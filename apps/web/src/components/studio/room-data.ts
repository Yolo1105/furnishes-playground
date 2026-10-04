/**
 * The room the project is for. Singapore HDB flats come in three types,
 * and each room in them has a typical size; those are the presets, and
 * the visitor corrects them to their own flat in millimetres.
 * Sizes follow the archive's SG HDB profile.
 */
export type FlatType = "3-room" | "4-room" | "5-room";
export const FLAT_TYPES: FlatType[] = ["3-room", "4-room", "5-room"];

export type RoomId =
  | "living"
  | "master"
  | "bedroom-1"
  | "bedroom-2"
  | "kitchen"
  | "study";

export const ROOM_NAMES: Record<RoomId, string> = {
  living: "Living & dining",
  master: "Master bedroom",
  "bedroom-1": "Bedroom 2",
  "bedroom-2": "Bedroom 3",
  kitchen: "Kitchen",
  study: "Study",
};

/** mm: width along the window wall, depth into the room */
export type Size = { width: number; depth: number };

const r = (width: number, depth: number): Size => ({ width, depth });

/** typical sizes per flat; a 3-room has one common bedroom and no study */
export const PRESETS: Record<FlatType, Partial<Record<RoomId, Size>>> = {
  "3-room": {
    living: r(6000, 3200),
    master: r(3000, 3000),
    "bedroom-1": r(3000, 2500),
    kitchen: r(2400, 2400),
  },
  "4-room": {
    living: r(6500, 4000),
    master: r(3500, 3000),
    "bedroom-1": r(3000, 2700),
    "bedroom-2": r(3000, 2700),
    kitchen: r(3000, 2400),
    study: r(3000, 2700),
  },
  "5-room": {
    living: r(7000, 4500),
    master: r(4000, 3500),
    "bedroom-1": r(3000, 3000),
    "bedroom-2": r(3000, 3000),
    kitchen: r(3200, 2700),
    study: r(3000, 3000),
  },
};

/** HDB ceilings run 2.6 to 2.8 m */
export const CEILING = { default: 2600, min: 2400, max: 3200 } as const;

/** the door and the window as the drawings show them, mm: the door from
    the floor, the window from its sill */
export const OPENINGS = {
  door: { width: 900, height: 2100 },
  window: { width: 1500, sill: 900, head: 2400 },
} as const;

export type Wall = "north" | "east" | "south" | "west";
export const WALLS: Wall[] = ["north", "east", "south", "west"];

export const FLOORS = ["Vinyl", "Tiles", "Parquet", "Concrete"] as const;
export type Floor = (typeof FLOORS)[number];
/** how each floor reads in the scene */
export const FLOOR_TONES: Record<Floor, string> = {
  Vinyl: "#d8c1a4",
  Tiles: "#e4ded4",
  Parquet: "#c59b6b",
  Concrete: "#b9b4ad",
};
export const WALL_TONES = [
  { id: "white", name: "White", hex: "#f6f1ea" },
  { id: "warm", name: "Warm white", hex: "#f3e9dc" },
  { id: "sand", name: "Sand", hex: "#e6d5bf" },
  { id: "sage", name: "Sage", hex: "#c9cfb8" },
] as const;

export const metres = (mm: number) => `${(mm / 1000).toFixed(1)} m`;
