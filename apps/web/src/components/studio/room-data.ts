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
/** how small and how large a room's width and depth can be, mm */
export const ROOM_SIZE = { min: 1500, max: 12000 } as const;

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
type FitKey = "master" | "common" | "living" | "dining";
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
/**
 * The openings in the walls: any number of doors (hinged, sliding,
 * double, or a passage with no leaf) and windows, each on a wall at a
 * place along it with a width; a window also has its sill and head. A
 * room starts with the openings its flat has: the living room's door
 * is 800 mm from the east corner with a wide window to the north; the
 * kitchen's door is from the living room on the east wall, centred, and
 * its light comes through the service yard, so it has no window of its
 * own.
 */
export type OpeningKind = "door" | "sliding" | "double" | "passage" | "window";
export type Opening = {
  id: string;
  kind: OpeningKind;
  wall: Wall;
  /** an opening shared with the room beyond the wall: the join it comes
      from, which both rooms read */
  join?: string;
  /** mm, the opening's centre along its wall from the room's west side
      (north and south walls) or north side (east and west walls); null
      is the middle of the wall */
  at: number | null;
  width: number;
  /** a window: mm from the floor to the glass, and to its top */
  sill?: number;
  head?: number;
  /** placed by the flat's convention, so the panel can say so */
  hdb?: boolean;
};
export const OPENING_KINDS: {
  id: OpeningKind;
  label: string;
  width: number;
}[] = [
  { id: "door", label: "Door", width: OPENINGS.door.width },
  { id: "sliding", label: "Sliding door", width: 1800 },
  { id: "double", label: "Double door", width: 1500 },
  { id: "passage", label: "Passage", width: OPENINGS.door.width },
  { id: "window", label: "Window", width: OPENINGS.window.width },
];
export const openingLabel = (kind: OpeningKind) =>
  OPENING_KINDS.find((k) => k.id === kind)!.label;
/** the width an opening of that kind starts at */
export const kindWidth = (kind: OpeningKind) =>
  OPENING_KINDS.find((k) => k.id === kind)!.width;
export const isWindow = (o: Pick<Opening, "kind">) => o.kind === "window";
/** a leaf that swings into the room, and so needs its floor clear */
export const swings = (o: Pick<Opening, "kind">) =>
  o.kind === "door" || o.kind === "double";
/** how wide an opening can be, mm, and the step it moves and grows by */
export const OPENING_WIDTH = { min: 500, max: 4000, step: 50 };
/** the sizes a person picks by name. A doorway's size can bring its
    kind (Double, Sliding); the other three keep a hinged door hinged and
    a passage open. Full wall runs the window to within a reveal of each
    corner. */
export const DOOR_SIZES: {
  label: string;
  width: number;
  kind?: OpeningKind;
}[] = [
  { label: "Narrow", width: 750 },
  { label: "Standard", width: 850 },
  { label: "Wide", width: 900 },
  { label: "Double", width: kindWidth("double"), kind: "double" },
  { label: "Sliding", width: kindWidth("sliding"), kind: "sliding" },
];
/** what a named door size makes of a doorway: that width, and that kind */
export const doorSized = (
  o: Pick<Opening, "kind">,
  z: (typeof DOOR_SIZES)[number],
): Pick<Opening, "width" | "kind"> => ({
  width: z.width,
  kind: z.kind ?? (o.kind === "passage" ? "passage" : "door"),
});
export const WINDOW_SIZES: { label: string; width: number | "full" }[] = [
  { label: "Small", width: 1200 },
  { label: "Standard", width: 1500 },
  { label: "Wide", width: 1900 },
  { label: "Full wall", width: "full" },
];
/** what a full-wall window keeps from each corner, mm */
export const REVEAL = 300;
/** the floor a doorway with no swinging leaf keeps clear to pass, mm */
export const PASS_DEPTH = 600;
/** the floor under a window kept clear of tall pieces, mm */
export const SILL_DEPTH = 150;
/** the shortest shared wall that gets a doorway, mm */
export const JOIN_MIN = 900;
/** the rooms a door swings into: the private ones. Two rooms joined get
    a door into the private one, else an open passage */
export const PRIVATE_ROOMS: readonly RoomId[] = [
  "master",
  "bedroom-1",
  "bedroom-2",
  "study",
];

let openingSeq = 0;
export const openingId = () => `o-${Date.now().toString(36)}-${++openingSeq}`;
export const makeOpening = (
  kind: OpeningKind,
  wall: Wall,
  patch: Partial<Opening> = {},
): Opening => ({
  id: openingId(),
  kind,
  wall,
  at: null,
  width: kindWidth(kind),
  ...(kind === "window"
    ? { sill: OPENINGS.window.sill, head: OPENINGS.window.head }
    : {}),
  ...patch,
});

/** the openings a room starts with, by its flat's convention; the sizes
    say where the far corner is */
export const openingsFor = (room: RoomId, W: number, D: number): Opening[] => {
  // a door `offset` mm from the wall's far end (east for a south wall)
  const fromFar = (wall: Wall, offset: number, width: number) =>
    (wall === "north" || wall === "south" ? W : D) - offset - width / 2;
  switch (room) {
    case "living":
      return [
        makeOpening("door", "south", {
          at: fromFar("south", 800, OPENINGS.door.width),
          hdb: true,
        }),
        makeOpening("window", "north", { width: 1900 }),
      ];
    case "kitchen":
      return [makeOpening("door", "east")];
    default:
      return [
        makeOpening("door", "south", {
          at: fromFar("south", 600, OPENINGS.door.width),
          hdb: true,
        }),
        makeOpening("window", "north"),
      ];
  }
};
/** the HDB offset an opening was placed by: mm from the far corner */
export const hdbOffset = (o: Opening, W: number, D: number) =>
  o.at === null
    ? null
    : (o.wall === "north" || o.wall === "south" ? W : D) - o.at - o.width / 2;

/** a room saved before openings were a list: its one door and window */
type LegacyOpenings = {
  door?: Wall;
  doorOffset?: number | null;
  window?: Wall | null;
  windowWidth?: number;
};
export const fromLegacyOpenings = (
  r: LegacyOpenings,
  W: number,
  D: number,
): Opening[] | null => {
  if (!r.door) return null;
  const L = r.door === "north" || r.door === "south" ? W : D;
  const out = [
    makeOpening("door", r.door, {
      at:
        r.doorOffset === null || r.doorOffset === undefined
          ? null
          : L - r.doorOffset - OPENINGS.door.width / 2,
      ...(r.doorOffset !== null && r.doorOffset !== undefined
        ? { hdb: true }
        : {}),
    }),
  ];
  if (r.window)
    out.push(
      makeOpening("window", r.window, {
        width: r.windowWidth ?? OPENINGS.window.width,
      }),
    );
  return out;
};

/**
 * The planner's rules, as the archive's Requirements tab had them: how
 * wide a walkway must be, whether the door's swing and the window are
 * kept clear, whether a bed must stand against a wall, what the room
 * must have, and how far apart a layout spreads the pieces; and the
 * two priorities the archive's tab had as sliders, flow against storage
 * and open against cosy, which lean on how the layouts are weighed. The
 * walkway starts at 600 mm, as HDB has it; a layout starts snug, at
 * the walkway, and can be opened up to 600 mm more. A preset sets the
 * whole lot for a way of living in the room.
 */
export type BedWall = "prefer" | "required" | "off";
export type Rules = {
  /** mm between neighbours that a walkway needs */
  walkway: number;
  doorClear: boolean;
  windowClear: boolean;
  bedWall: BedWall;
  /** what the room must have, by the keys of MUST_HAVE_CHOICES */
  mustHave: string[];
  /** mm added to the walkway between pieces a layout lays out */
  spacing: number;
  /** 0 storage first, 100 flow first: how much a narrow gap or a
      blocked door weighs against a layout */
  flow: number;
  /** 0 cosy, 100 open: whether the middle of the room should stay clear */
  open: number;
};
export const PRIORITY = { min: 0, max: 100, step: 10, default: 50 };
export const WALKWAY = { min: 500, max: 1200, step: 50, default: 600 };
export const SPACING = { max: 600, step: 50 };
/** what a room can be asked to have, and the words a piece's name
    carries when it is that thing */
export const MUST_HAVE_CHOICES: { key: string; match: RegExp }[] = [
  { key: "sofa", match: /sofa|couch/i },
  { key: "coffee table", match: /coffee table/i },
  { key: "dining table", match: /dining/i },
  { key: "bed", match: /\bbed\b(?!side)/i },
  { key: "wardrobe", match: /wardrobe/i },
  { key: "desk", match: /\bdesk\b(?!-side| lamp)/i },
  {
    key: "storage",
    match:
      /shelf|cabinet|sideboard|bookwall|organiser|drawer|trolley|cart|wardrobe/i,
  },
  { key: "rug", match: /rug/i },
  { key: "lamp", match: /lamp|pendant/i },
  { key: "plant", match: /plant|fig|palm|fern/i },
];
const MUST_HAVE_FOR_ROOM: Record<RoomId, string[]> = {
  living: ["sofa", "coffee table", "storage"],
  master: ["bed", "wardrobe"],
  "bedroom-1": ["bed", "wardrobe"],
  "bedroom-2": ["bed", "storage"],
  kitchen: ["storage"],
  study: ["desk", "storage"],
};
export const rulesFor = (room: RoomId): Rules => ({
  walkway: WALKWAY.default,
  doorClear: true,
  windowClear: true,
  bedWall: "prefer",
  mustHave: MUST_HAVE_FOR_ROOM[room],
  spacing: 0,
  flow: PRIORITY.default,
  open: PRIORITY.default,
});
export const sameRules = (a: Rules, b: Rules) =>
  a.walkway === b.walkway &&
  a.doorClear === b.doorClear &&
  a.windowClear === b.windowClear &&
  a.bedWall === b.bedWall &&
  a.spacing === b.spacing &&
  a.flow === b.flow &&
  a.open === b.open &&
  a.mustHave.length === b.mustHave.length &&
  a.mustHave.every((k) => b.mustHave.includes(k));

/** the rules for a way of living in the room, over its typical ones */
export type RulePreset = {
  id: string;
  label: string;
  note: string;
  patch: Partial<Omit<Rules, "mustHave">>;
  /** what the room must have besides its typical pieces */
  also?: string[];
};
export const RULE_PRESETS: RulePreset[] = [
  {
    id: "open-plan",
    label: "Open plan",
    note: "Wide walkways, pieces spread, the middle clear",
    patch: { walkway: 900, spacing: 300, open: 90, flow: 70 },
  },
  {
    id: "snug-storage",
    label: "Snug storage",
    note: "Pieces close, every wall working",
    patch: { walkway: 600, spacing: 0, open: 20, flow: 30 },
    also: ["storage"],
  },
  {
    id: "family-flow",
    label: "Family flow",
    note: "A metre to pass, the door and window clear",
    patch: {
      walkway: 1000,
      flow: 100,
      open: 60,
      doorClear: true,
      windowClear: true,
    },
  },
  {
    id: "reading-nook",
    label: "Reading nook",
    note: "Cosy, by the window, a lamp to read by",
    patch: {
      walkway: 600,
      spacing: 150,
      open: 30,
      flow: 40,
      windowClear: true,
    },
    also: ["lamp"],
  },
  {
    id: "live-work",
    label: "Live-work",
    note: "A desk and storage, room to move between",
    patch: { walkway: 800, flow: 60, open: 50 },
    also: ["desk", "storage"],
  },
];
/** a preset's rules for a room: the typical ones with the preset over them */
export const presetRules = (preset: RulePreset, room: RoomId): Rules => {
  const base = rulesFor(room);
  return {
    ...base,
    ...preset.patch,
    mustHave: [...new Set([...base.mustHave, ...(preset.also ?? [])])],
  };
};
/** the preset the rules match exactly, if any */
export const presetOf = (rules: Rules, room: RoomId) =>
  RULE_PRESETS.find((p) => sameRules(rules, presetRules(p, room)))?.id ?? null;
