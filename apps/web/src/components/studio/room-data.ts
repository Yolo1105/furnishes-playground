/**
 * The room the project is for. Singapore HDB flats come in three types,
 * and each room in them has a typical size; those are the presets, and
 * the visitor corrects them to their own flat in millimetres.
 * Sizes follow the archive's SG HDB profile.
 */
export type FlatType = "3-room" | "4-room" | "5-room";
export const FLAT_TYPES: FlatType[] = ["3-room", "4-room", "5-room"];

export type RoomId =
  "living" | "master" | "bedroom-1" | "bedroom-2" | "kitchen" | "study";

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

/**
 * What fits, by flat type, from the archive's Singapore HDB profile: the
 * bed the master and the common bedrooms take, the sofa the living room
 * takes, the dining table that leaves room to move. Eva keeps to these
 * before suggesting anything, and the Room tab shows the lines for the
 * room in hand.
 */
export type FitKey = "master" | "common" | "living" | "dining";
export const FIT_GUIDANCE: Record<FlatType, Record<FitKey, string>> = {
  "3-room": {
    master:
      "Queen bed (152 × 203 cm) only, a tight fit. A king bed will not fit. Allow 50 to 60 cm clearance on at least one side for getting in and out.",
    common:
      "Single (91 × 190 cm) or super single (107 × 190 cm) only. A queen fits but leaves no space for any other furniture: no desk, no wardrobe.",
    living:
      "A 3-seater straight sofa (about 2.0 to 2.2 m long). An L-shaped sofa does not fit comfortably.",
    dining:
      "A 4-seater dining table only (round 100 cm or rectangular 120 × 75 cm). A 6-seater will block circulation.",
  },
  "4-room": {
    master:
      "Queen bed (152 × 203 cm) comfortable. A king (193 × 203 cm) is tight: it fits but leaves under 40 cm on each side. Queen is the recommendation for a typical household.",
    common:
      "Single (91 × 190 cm) comfortable with a desk and wardrobe. Super single (107 × 190 cm) fits with a slim desk. A queen leaves no space for a desk.",
    living:
      "An L-shaped sofa 2.6 to 2.8 m on the long edge fits comfortably. A 3-seater straight sofa (2.2 to 2.4 m) is the conservative choice.",
    dining:
      "A 6-seater dining table (rectangular 150 × 85 cm or round 120 cm). A 4-seater feels small in this living and dining size.",
  },
  "5-room": {
    master:
      "King bed (193 × 203 cm) comfortable with bedside tables on both sides. A queen leaves room for a bench at the foot.",
    common:
      "Single, super single or queen all fit. A queen (152 × 203 cm) with a small desk works for older children.",
    living:
      "An L-shaped sofa 3.0 m or more on the long edge; a sectional with a chaise also fits. Coffee table 110 to 130 cm.",
    dining:
      "A 6 to 8-seater dining table, rectangular 180 × 90 cm or round 140 cm. Allows a reunion-dinner seating.",
  },
};

/** which guidance lines speak to a room */
export const FIT_FOR_ROOM: Record<RoomId, FitKey[]> = {
  living: ["living", "dining"],
  master: ["master"],
  "bedroom-1": ["common"],
  "bedroom-2": ["common"],
  kitchen: ["dining"],
  study: ["common"],
};

/** what every new HDB flat has in common, as the archive recorded it */
export const HDB_CONVENTIONS = [
  "ceilings 2.6 to 2.8 m",
  "the master bedroom has an ensuite (about 1.5 × 2.0 m, shower only)",
  "the kitchen is enclosed, with a service yard of about 2.5 m² behind it",
  "a household shelter of about 1.75 m² is mandatory",
  "the common bathroom is about 1.7 × 2.4 m, shower only",
  "every bedroom has an external window",
  "bedrooms are near square (aspect 1.0 to 1.2); living and dining run 1.5 to 1.9",
] as const;

/**
 * Where the openings are by post-2000 HDB convention: bedrooms have the
 * door on the corridor (south) wall 600 mm from the east corner and the
 * window centred on the daylight (north) wall; the living room's entry
 * door is 800 mm from the east corner with a wide window or balcony
 * opening to the north; the kitchen's door is from the living room on
 * the east wall, centred, and its light comes through the service yard,
 * so it has no window of its own.
 */
export type Openings = {
  door: Wall;
  /** mm from the wall's far end (east for north and south walls, south
      for east and west walls); null is the middle */
  doorOffset: number | null;
  window: Wall | null;
  windowWidth: number;
};
export const openingsFor = (room: RoomId): Openings => {
  switch (room) {
    case "living":
      return {
        door: "south",
        doorOffset: 800,
        window: "north",
        windowWidth: 1900,
      };
    case "kitchen":
      return {
        door: "east",
        doorOffset: null,
        window: null,
        windowWidth: OPENINGS.window.width,
      };
    default:
      return {
        door: "south",
        doorOffset: 600,
        window: "north",
        windowWidth: OPENINGS.window.width,
      };
  }
};

/** where the door's centre sits along a wall of length `L` */
export const doorCentreAlong = (L: number, offset: number | null) =>
  offset === null ? L / 2 : L - offset - OPENINGS.door.width / 2;
