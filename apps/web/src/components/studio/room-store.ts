import { create } from "zustand";
import {
  CEILING,
  PRESETS,
  type FlatType,
  type RoomId,
  type Wall,
} from "./room-data";
import { ROOM_TEMPLATES, type Point, type TemplateId } from "./room-templates";

/** how the room's shape comes about: traced on the canvas, or picked */
export type RoomStart = "draw" | "template";

type RoomConfig = {
  start: RoomStart | null;
  template: TemplateId;
  /** the corners traced so far on the plan, mm, until the room closes */
  drawing: Point[];
  /** the room's own outline once drawn and closed, mm */
  drawn: Point[] | null;
  flat: FlatType;
  room: RoomId;
  width: number;
  depth: number;
  height: number;
  /** which wall the door is on, and the window */
  door: Wall;
  window: Wall;
  floor: string;
  wallTone: string;
  /** true until the visitor edits a size: sizes then stop following presets */
  preset: boolean;
};

type RoomState = RoomConfig & {
  setFlat: (flat: FlatType) => void;
  setRoom: (room: RoomId) => void;
  setSize: (
    patch: Partial<Pick<RoomConfig, "width" | "depth" | "height">>,
  ) => void;
  set: (
    patch: Partial<Pick<RoomConfig, "door" | "window" | "floor" | "wallTone">>,
  ) => void;
  resetSize: () => void;
  setStart: (start: RoomStart) => void;
  setTemplate: (template: TemplateId) => void;
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
  width: number;
  depth: number;
}): Point[] => {
  if (s.drawn) {
    const b = bbox(s.drawn);
    return s.drawn.map(([x, y]) => [x - b.x, y - b.y]);
  }
  const t =
    ROOM_TEMPLATES.find((x) => x.id === s.template) ?? ROOM_TEMPLATES[0]!;
  const b = bbox(t.footprint);
  return t.footprint.map(([x, y]) => [
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
export const useRoom = create<RoomState>((set, get) => ({
  start: null,
  template: ROOM_TEMPLATES[0]!.id,
  drawing: [],
  drawn: null,
  flat: "4-room",
  room: "living",
  ...sized("4-room", "living"),
  height: CEILING.default,
  door: "south",
  window: "north",
  floor: "Vinyl",
  wallTone: "white",
  preset: true,
  setFlat: (flat) => {
    const room = PRESETS[flat][get().room] ? get().room : "living";
    set({ flat, room, ...sized(flat, room), preset: true });
  },
  setRoom: (room) => set({ room, ...sized(get().flat, room), preset: true }),
  setSize: (patch) => set({ ...patch, preset: false }),
  set: (patch) => set(patch),
  resetSize: () =>
    set({
      ...sized(get().flat, get().room),
      height: CEILING.default,
      preset: true,
    }),
  setStart: (start) => set({ start }),
  setTemplate: (template) => set({ template, start: "template", drawn: null }),
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
