import { create } from "zustand";
import {
  CEILING,
  PRESETS,
  type FlatType,
  type RoomId,
  type Wall,
} from "./room-data";
import { ROOM_TEMPLATES, type TemplateId } from "./room-templates";

/** how the room's shape comes about: traced on the canvas, or picked */
export type RoomStart = "draw" | "template";

export type RoomConfig = {
  start: RoomStart | null;
  template: TemplateId;
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
};

const sized = (flat: FlatType, room: RoomId) => {
  const p = PRESETS[flat][room] ??
    PRESETS[flat].living ?? { width: 4000, depth: 3000 };
  return { width: p.width, depth: p.depth };
};

/** The room being designed. One per project for now. */
export const useRoom = create<RoomState>((set, get) => ({
  start: null,
  template: ROOM_TEMPLATES[0]!.id,
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
  setTemplate: (template) => set({ template, start: "template" }),
}));
