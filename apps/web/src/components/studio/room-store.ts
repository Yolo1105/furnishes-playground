import { create } from "zustand";
import {
  CEILING,
  type FlatType,
  makeOpening,
  type Opening,
  type OpeningKind,
  openingsFor,
  PRESETS,
  type RoomId,
  type Rules,
  rulesFor,
  type Wall,
  WALLS,
} from "./room-data";
import { insideOutline, outlineFromCells } from "./room-geometry";
import { ROOM_TEMPLATES, type Point, type TemplateId } from "./room-templates";

/** how the room's shape comes about: traced on the canvas, or picked */
export type RoomStart = "draw" | "template";

type RoomConfig = {
  start: RoomStart | null;
  template: TemplateId;
  /** the squares tapped for a "Your shape" room, "x,y" each */
  cells: string[];
  /** the tour's stops on the plan, mm, in the order they are walked */
  stops: Point[];
  /** the corners traced so far on the plan, mm, until the room closes */
  drawing: Point[];
  /** the room's own outline once drawn and closed, mm */
  drawn: Point[] | null;
  flat: FlatType;
  room: RoomId;
  width: number;
  depth: number;
  height: number;
  /** the doors and windows in the walls */
  openings: Opening[];
  floor: string;
  wallTone: string;
  /** true until the visitor edits a size: sizes then stop following presets */
  preset: boolean;
  /** the planner's rules for this room */
  rules: Rules;
};

type RoomState = RoomConfig & {
  setFlat: (flat: FlatType) => void;
  setRoom: (room: RoomId) => void;
  setSize: (
    patch: Partial<Pick<RoomConfig, "width" | "depth" | "height">>,
  ) => void;
  set: (patch: Partial<Pick<RoomConfig, "floor" | "wallTone">>) => void;
  /** one opening changed: its wall, place, width, sill or head */
  setOpening: (id: string, patch: Partial<Omit<Opening, "id">>) => void;
  /** an opening of a kind put in a wall (the emptiest, facing the first
      door, unless one is named); returns its id */
  addOpening: (kind: OpeningKind, wall?: Wall, at?: number) => string;
  removeOpening: (id: string) => void;
  resetSize: () => void;
  setRules: (patch: Partial<Rules>) => void;
  /** the rules back to what this room starts with */
  resetRules: () => void;
  setStart: (start: RoomStart) => void;
  setTemplate: (template: TemplateId) => void;
  /** tap a square into, or out of, a "Your shape" room */
  toggleCell: (x: number, y: number) => void;
  /** a stop on the tour, if it is in the room */
  addStop: (p: Point) => void;
  removeStop: (i: number) => void;
  clearStops: () => void;
  /** a corner on the plan; near the first one, with three or more, it closes */
  addCorner: (p: Point) => void;
  /** forget the drawing and the drawn room */
  clearWalls: () => void;
};

/** how close to the first corner a click closes the room, mm */
export const CLOSE_WITHIN = 350;
/** the drawing snaps to this, mm */
const SNAP = 100;

const bbox = (pts: readonly Point[]) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
};

/** the room's outline in mm, from the top-left corner: the drawn one, or
    the template scaled to the room's width and depth */
export const footprintOf = (s: {
  drawn: Point[] | null;
  template: TemplateId;
  cells: string[];
  width: number;
  depth: number;
}): Point[] => {
  if (s.drawn) {
    const b = bbox(s.drawn);
    return s.drawn.map(([x, y]) => [x - b.x, y - b.y]);
  }
  const tapped =
    s.template === "grid" ? outlineFromCells(new Set(s.cells)) : [];
  const shape = tapped.length
    ? tapped
    : (ROOM_TEMPLATES.find((x) => x.id === s.template) ?? ROOM_TEMPLATES[0]!)
        .footprint;
  const b = bbox(shape);
  return shape.map(([x, y]) => [
    ((x - b.x) / b.w) * s.width,
    ((y - b.y) / b.h) * s.depth,
  ]);
};

/** how many walls the room has */
export const wallsOf = (s: { drawn: Point[] | null; drawing: Point[] }) =>
  s.drawn ? s.drawn.length : Math.max(0, s.drawing.length - 1);

const sized = (flat: FlatType, room: RoomId) => {
  const p = PRESETS[flat][room] ??
    PRESETS[flat].living ?? { width: 4000, depth: 3000 };
  return { width: p.width, depth: p.depth };
};

/** The room being designed. One per project for now. */
/** the wall with the fewest openings, the one facing the first door
    first among equals, so a new door tends to face the old one */
const freeWall = (openings: Opening[]): Wall => {
  const first = openings.find((o) => o.kind !== "window")?.wall;
  const facing: Record<Wall, Wall> = {
    north: "south",
    south: "north",
    east: "west",
    west: "east",
  };
  const order: Wall[] = first
    ? [facing[first], ...WALLS.filter((w) => w !== facing[first])]
    : WALLS;
  return order.reduce((best, w) =>
    openings.filter((o) => o.wall === w).length <
    openings.filter((o) => o.wall === best).length
      ? w
      : best,
  );
};

export const useRoom = create<RoomState>((set, get) => ({
  start: null,
  template: ROOM_TEMPLATES[0]!.id,
  cells: ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "3,1", "4,1"],
  stops: [],
  drawing: [],
  drawn: null,
  flat: "4-room",
  room: "living",
  ...sized("4-room", "living"),
  height: CEILING.default,
  openings: openingsFor(
    "living",
    sized("4-room", "living").width,
    sized("4-room", "living").depth,
  ),
  floor: "Vinyl",
  wallTone: "white",
  preset: true,
  rules: rulesFor("living"),
  setFlat: (flat) => {
    const room = PRESETS[flat][get().room] ? get().room : "living";
    set({
      flat,
      room,
      ...sized(flat, room),
      openings: openingsFor(
        room,
        sized(flat, room).width,
        sized(flat, room).depth,
      ),
      preset: true,
      ...(room === get().room ? {} : { rules: rulesFor(room) }),
    });
  },
  setRoom: (room) =>
    set({
      room,
      ...sized(get().flat, room),
      openings: openingsFor(
        room,
        sized(get().flat, room).width,
        sized(get().flat, room).depth,
      ),
      preset: true,
      rules: rulesFor(room),
    }),
  setSize: (patch) => set({ ...patch, preset: false }),
  set: (patch) => set(patch),
  setOpening: (id, patch) =>
    set((s) => ({
      openings: s.openings.map((o) =>
        o.id === id ? { ...o, hdb: false, ...patch } : o,
      ),
    })),
  addOpening: (kind, wall, at) => {
    const s = get();
    const o = makeOpening(kind, wall ?? freeWall(s.openings), {
      at: at ?? null,
    });
    set({ openings: [...s.openings, o] });
    return o.id;
  },
  removeOpening: (id) =>
    set((s) => ({ openings: s.openings.filter((o) => o.id !== id) })),
  resetSize: () =>
    set({
      ...sized(get().flat, get().room),
      height: CEILING.default,
      preset: true,
    }),
  setRules: (patch) => set({ rules: { ...get().rules, ...patch } }),
  resetRules: () => set({ rules: rulesFor(get().room) }),
  setStart: (start) => set({ start }),
  setTemplate: (template) => set({ template, start: "template", drawn: null }),
  addStop: ([x, y]) =>
    set((s) => {
      const p: Point = [Math.round(x / 100) * 100, Math.round(y / 100) * 100];
      return insideOutline(p[0], p[1], footprintOf(s))
        ? { stops: [...s.stops, p] }
        : {};
    }),
  removeStop: (i) => set((s) => ({ stops: s.stops.filter((_, k) => k !== i) })),
  clearStops: () => set({ stops: [] }),
  toggleCell: (x, y) =>
    set((s) => {
      const key = `${x},${y}`;
      const cells = s.cells.includes(key)
        ? s.cells.filter((c) => c !== key)
        : [...s.cells, key];
      // the squares must hold together to be a room
      return outlineFromCells(new Set(cells)).length ? { cells } : {};
    }),
  addCorner: ([x, y]) => {
    const p: Point = [Math.round(x / SNAP) * SNAP, Math.round(y / SNAP) * SNAP];
    const { drawing } = get();
    const first = drawing[0];
    if (
      first &&
      drawing.length >= 3 &&
      Math.hypot(p[0] - first[0], p[1] - first[1]) <= CLOSE_WITHIN
    ) {
      const b = bbox(drawing);
      set({
        drawn: drawing,
        drawing: [],
        width: Math.max(1500, b.w),
        depth: Math.max(1500, b.h),
        preset: false,
      });
      return;
    }
    const last = drawing[drawing.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) return;
    set({ drawing: [...drawing, p] });
  },
  clearWalls: () => set({ drawing: [], drawn: null }),
}));
