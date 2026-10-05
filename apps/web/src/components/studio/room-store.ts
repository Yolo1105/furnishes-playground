import { create } from "zustand";
import { newId } from "./ids";
import {
  CEILING,
  type FlatType,
  makeOpening,
  type Opening,
  type OpeningKind,
  openingsFor,
  PRESETS,
  ROOM_NAMES,
  ROOM_SIZE,
  type RoomId,
  type Rules,
  rulesFor,
  type Wall,
  WALLS,
} from "./room-data";
import {
  insideOutline,
  normalizeOutline,
  outlineFromCells,
  WALL_MM,
} from "./room-geometry";
import { useScene } from "./scene-store";
import { ROOM_TEMPLATES, type Point, type TemplateId } from "./room-templates";

/** how the room's shape comes about: traced on the canvas, or picked */
export type RoomStart = "draw" | "template";

/** one room of the flat: its shape, size, openings, finish and rules,
    and where it stands on the sheet */
export type RoomSpec = {
  id: string;
  /** the room's top-left corner on the sheet, mm */
  pos: Point;
  start: RoomStart | null;
  template: TemplateId;
  /** the squares tapped for a "Your shape" room, "x,y" each */
  cells: string[];
  /** the room's own outline once drawn, closed or reshaped, mm */
  drawn: Point[] | null;
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

type RoomConfig = {
  flat: FlatType;
  /** the rooms of the flat, in the order they were added */
  rooms: RoomSpec[];
  /** the room being worked on: the panels, the handles and Eva read it */
  activeId: string;
  /** the tour's stops on the sheet, mm, in the order they are walked */
  stops: Point[];
  /** the corners traced so far on the plan, mm, until the room closes */
  drawing: Point[];
};

/** the active room's own fields, with the flat's */
export type ActiveRoom = RoomSpec & Pick<RoomConfig, "flat">;

type RoomState = RoomConfig & {
  setFlat: (flat: FlatType) => void;
  setRoom: (room: RoomId) => void;
  setSize: (
    patch: Partial<Pick<RoomSpec, "width" | "depth" | "height">>,
  ) => void;
  set: (patch: Partial<Pick<RoomSpec, "floor" | "wallTone">>) => void;
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
  /** a stop on the tour, if it is in a room */
  addStop: (p: Point) => void;
  removeStop: (i: number) => void;
  clearStops: () => void;
  /** a corner on the plan; near the first one, with three or more, it closes */
  addCorner: (p: Point) => void;
  /** forget the drawing and the drawn room */
  clearWalls: () => void;
  /** the room's outline as the plan's handles left it, mm in the frame
      the plan showed; the room becomes its own shape, sized by its box,
      and what stood in it keeps to the walls that did not move. Returns
      how far the frame moved. */
  setOutline: (points: readonly Point[]) => { dx: number; dy: number };
  /** another room of the flat, at its typical size, stood beside the
      active one; it becomes the active room. Returns its id */
  addRoom: (room: RoomId) => string;
  /** a room taken out of the flat, with what stood in it; the last room stays */
  removeRoom: (id: string) => void;
  setActive: (id: string) => void;
  /** a room stood elsewhere on the sheet */
  moveRoom: (id: string, pos: Point) => void;
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

/** a drawn outline and its openings stretched to a new width and depth */
const stretched = (
  s: Pick<RoomSpec, "drawn" | "openings" | "width" | "depth">,
  width: number,
  depth: number,
) => {
  if (!s.drawn) return {};
  const fx = width / s.width;
  const fy = depth / s.depth;
  return {
    drawn: s.drawn.map(([x, y]): Point => [x * fx, y * fy]),
    openings: s.openings.map((o) =>
      o.at === null
        ? o
        : {
            ...o,
            at: o.at * (o.wall === "north" || o.wall === "south" ? fx : fy),
          },
    ),
  };
};

/** a room of a kind at its typical size for the flat, before any choice
    of how it begins */
const roomOf = (flat: FlatType, room: RoomId, pos: Point): RoomSpec => {
  const size = sized(flat, room);
  return {
    id: newId("room"),
    pos,
    start: null,
    template: ROOM_TEMPLATES[0]!.id,
    cells: ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "3,1", "4,1"],
    drawn: null,
    room,
    ...size,
    height: CEILING.default,
    openings: openingsFor(room, size.width, size.depth),
    floor: "Vinyl",
    wallTone: "white",
    preset: true,
    rules: rulesFor(room),
  };
};

/** the room being worked on */
export const activeOf = (s: Pick<RoomConfig, "rooms" | "activeId">) =>
  s.rooms.find((r) => r.id === s.activeId) ?? s.rooms[0]!;

/** a room's outline on the sheet, mm */
export const sheetOutline = (r: RoomSpec): Point[] =>
  footprintOf(r).map(([x, y]) => [x + r.pos[0], y + r.pos[1]]);

/** the room whose floor a point of the sheet is on, if any */
export const roomAt = (rooms: readonly RoomSpec[], p: Point) =>
  rooms.find((r) => insideOutline(p[0], p[1], sheetOutline(r))) ?? null;

/** what a room is called in the flat: its kind, numbered past the first
    of that kind */
export const roomLabel = (rooms: readonly RoomSpec[], r: RoomSpec) => {
  const same = rooms.filter((x) => x.room === r.room);
  const n = same.indexOf(r);
  return n > 0 ? `${ROOM_NAMES[r.room]} ${n + 1}` : ROOM_NAMES[r.room];
};

/** the kind of room the flat has not got yet, else a living room */
export const nextRoomKind = (flat: FlatType, rooms: readonly RoomSpec[]) =>
  (Object.keys(PRESETS[flat]) as RoomId[]).find(
    (k) => !rooms.some((r) => r.room === k),
  ) ?? "living";

/** the box round every room on the sheet, mm */
export const sheetBox = (rooms: readonly RoomSpec[]) =>
  bbox(rooms.flatMap(sheetOutline));

/** The rooms of the flat, one of them active. */
export const useRoom = create<RoomState>((set, get) => {
  /** the active room changed */
  const active = (
    patch:
      Partial<RoomSpec> | ((r: RoomSpec, s: RoomState) => Partial<RoomSpec>),
  ) =>
    set((s) => ({
      rooms: s.rooms.map((r) =>
        r.id === s.activeId
          ? { ...r, ...(typeof patch === "function" ? patch(r, s) : patch) }
          : r,
      ),
    }));
  const first = roomOf("4-room", "living", [0, 0]);
  return {
    flat: "4-room",
    rooms: [first],
    activeId: first.id,
    stops: [],
    drawing: [],
    setFlat: (flat) =>
      set((s) => ({
        flat,
        // a room the flat does not have becomes a living room; one still
        // at its typical size takes the flat's
        rooms: s.rooms.map((r) => {
          const room = PRESETS[flat][r.room] ? r.room : "living";
          if (!r.preset && room === r.room) return r;
          const size = sized(flat, room);
          return {
            ...r,
            room,
            ...(r.preset ? size : {}),
            openings: r.preset
              ? openingsFor(room, size.width, size.depth)
              : r.openings,
            ...(room === r.room ? {} : { rules: rulesFor(room) }),
          };
        }),
      })),
    setRoom: (room) =>
      active((r, s) => {
        const size = sized(s.flat, room);
        return {
          room,
          ...size,
          drawn: null,
          openings: openingsFor(room, size.width, size.depth),
          preset: true,
          rules: rulesFor(room),
        };
      }),
    setSize: (patch) =>
      active((r) => ({
        ...stretched(r, patch.width ?? r.width, patch.depth ?? r.depth),
        ...patch,
        preset: false,
      })),
    set: (patch) => active(patch),
    setOpening: (id, patch) =>
      active((r) => ({
        openings: r.openings.map((o) =>
          o.id === id ? { ...o, hdb: false, ...patch } : o,
        ),
      })),
    addOpening: (kind, wall, at) => {
      const r = activeOf(get());
      const o = makeOpening(kind, wall ?? freeWall(r.openings), {
        at: at ?? null,
      });
      active({ openings: [...r.openings, o] });
      return o.id;
    },
    removeOpening: (id) =>
      active((r) => ({ openings: r.openings.filter((o) => o.id !== id) })),
    resetSize: () =>
      active((r, s) => {
        const size = sized(s.flat, r.room);
        return {
          ...stretched(r, size.width, size.depth),
          ...size,
          height: CEILING.default,
          preset: true,
        };
      }),
    setRules: (patch) => active((r) => ({ rules: { ...r.rules, ...patch } })),
    resetRules: () => active((r) => ({ rules: rulesFor(r.room) })),
    setStart: (start) => active({ start }),
    setTemplate: (template) =>
      active({ template, start: "template", drawn: null }),
    addStop: ([x, y]) =>
      set((s) => {
        const p: Point = [Math.round(x / 100) * 100, Math.round(y / 100) * 100];
        return roomAt(s.rooms, p) ? { stops: [...s.stops, p] } : {};
      }),
    removeStop: (i) =>
      set((s) => ({ stops: s.stops.filter((_, k) => k !== i) })),
    clearStops: () => set({ stops: [] }),
    toggleCell: (x, y) =>
      active((r) => {
        const key = `${x},${y}`;
        const cells = r.cells.includes(key)
          ? r.cells.filter((c) => c !== key)
          : [...r.cells, key];
        // the squares must hold together to be a room
        return outlineFromCells(new Set(cells)).length
          ? { cells, drawn: null }
          : {};
      }),
    addCorner: ([x, y]) => {
      const p: Point = [
        Math.round(x / SNAP) * SNAP,
        Math.round(y / SNAP) * SNAP,
      ];
      const { drawing } = get();
      const first = drawing[0];
      if (
        first &&
        drawing.length >= 3 &&
        Math.hypot(p[0] - first[0], p[1] - first[1]) <= CLOSE_WITHIN
      ) {
        // the drawing is on the sheet: the room takes its shape and
        // stands where it was drawn
        const b = bbox(drawing);
        set({ drawing: [] });
        active({
          drawn: drawing.map(([px, py]): Point => [px - b.x, py - b.y]),
          pos: [b.x, b.y],
          width: Math.max(ROOM_SIZE.min, b.w),
          depth: Math.max(ROOM_SIZE.min, b.h),
          preset: false,
        });
        return;
      }
      const last = drawing[drawing.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) return;
      set({ drawing: [...drawing, p] });
    },
    clearWalls: () => {
      set({ drawing: [] });
      active({ drawn: null });
    },
    setOutline: (points) => {
      const { points: drawn, dx, dy } = normalizeOutline(points);
      const b = bbox(drawn);
      const r = activeOf(get());
      // the frame moved: the room's corner on the sheet moves the other
      // way, so the walls that stayed stay put on the sheet
      active({
        drawn,
        pos: [r.pos[0] - dx, r.pos[1] - dy],
        width: b.w,
        depth: b.h,
        preset: false,
        start: r.start ?? "template",
        openings: r.openings.map((o) =>
          o.at === null
            ? o
            : {
                ...o,
                at: o.at + (o.wall === "north" || o.wall === "south" ? dx : dy),
              },
        ),
      });
      useScene.getState().nudgeAll(dx, dy, r.id, get().rooms[0]!.id);
      return { dx, dy };
    },
    addRoom: (room) => {
      const s = get();
      const from = activeOf(s);
      // beside the active room, a wall's thickness to its east
      const next = roomOf(s.flat, room, [
        from.pos[0] + from.width + WALL_MM,
        from.pos[1],
      ]);
      next.start = "template";
      set({ rooms: [...s.rooms, next], activeId: next.id });
      return next.id;
    },
    removeRoom: (id) => {
      const s = get();
      if (s.rooms.length < 2 || !s.rooms.some((r) => r.id === id)) return;
      const rooms = s.rooms.filter((r) => r.id !== id);
      useScene.getState().removeRoomPieces(id, s.rooms[0]!.id);
      set({
        rooms,
        activeId: s.activeId === id ? rooms[0]!.id : s.activeId,
      });
    },
    setActive: (id) =>
      set((s) => (s.rooms.some((r) => r.id === id) ? { activeId: id } : {})),
    moveRoom: (id, pos) =>
      set((s) => ({
        rooms: s.rooms.map((r) => (r.id === id ? { ...r, pos } : r)),
      })),
  };
});

/** the active room's fields, with the flat's, for a component to read */
export const useActiveRoom = (): ActiveRoom => {
  const r = useRoom(activeOf);
  const flat = useRoom((s) => s.flat);
  return { ...r, flat };
};
