/**
 * Everything standing in the room, as the outliner and the shelf see it.
 *
 * Three kinds of thing share the scene:
 *   piece  — a Furnishes modular piece: editable, purchasable, priced
 *   decor  — something placed so the scene reads as a room (sofa, plant)
 *   fixed  — architecture: walls, floor, window
 *
 * Groups follow how furniture relates (storage, seating, tables…), never
 * what can be edited: that is a mark on the row, not a folder.
 *
 * The studio opens on an HDB 5-room flat of ten rooms furnished as a flat is lived
 * in (room-store's showcaseFlat has the rooms). The pieces in it are
 * made from the catalogue's recipes, so their size and price are the
 * recipe's; the room items are the things a room has. Every item's
 * place is set below (SHOWCASE), so a first visit shows the rooms laid
 * out and not a heap of pieces.
 */
import type { Part } from "@furnishes/domain";
import { productOf } from "./catalogue";
import type { PieceProps } from "./piece-detail";
import { SHOWCASE_ROOMS } from "./room-data";
export const ASSET_KINDS = ["piece", "decor", "fixed", "part"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_CATEGORIES = [
  "components",
  "storage",
  "seating",
  "tables",
  "screens",
  "lighting",
  "decor",
  "beds",
  "fittings",
  "architecture",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const CATEGORY_NAMES: Record<AssetCategory, string> = {
  components: "Components",
  storage: "Storage",
  seating: "Seating",
  tables: "Tables & desks",
  screens: "Screens & dividers",
  lighting: "Lighting",
  decor: "Plants & décor",
  beds: "Beds",
  fittings: "Kitchen & bath fittings",
  architecture: "Architecture",
};

export type AssetNode = {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  /** S$, only pieces carry one: an estimate counted from the parts */
  price?: number;
  /** the catalogue recipe a Furnishes piece was made from */
  productId?: string;
  /** a piece built from parts, or a set that stands together */
  children?: AssetNode[];
  /** a generated room item's picture and mesh, when a provider made them */
  image?: string;
  model?: string;
  /** a part modelled in the studio (kind "part"): its sketches and
      feature history, built by the part worker */
  part?: Part;
};

export type AssetGroup = {
  id: AssetCategory;
  name: string;
  items: AssetNode[];
};

/** a Furnishes piece in the room, made from a catalogue recipe: its
    category and price are the recipe's; its bays can be named as parts,
    each a share of the price; a second of a kind is numbered, as the
    store numbers one brought in later */
const piece = (
  productId: string,
  id = productId,
  bays?: string[],
  name?: string,
): AssetNode => {
  const p = productOf(productId)!;
  const children = bays?.map((name, i) => ({
    id: `${id}-${"abc"[i]}`,
    name,
    kind: "piece" as const,
    category: p.category,
    price: Math.round(p.price / bays.length),
  }));
  return {
    id,
    name: name ?? p.name,
    kind: "piece",
    category: p.category,
    price: p.price,
    productId,
    ...(children ? { children } : {}),
  };
};
const decor = (
  id: string,
  name: string,
  category: AssetCategory,
): AssetNode => ({
  id,
  name,
  kind: "decor",
  category,
});
const fixed = (id: string, name: string): AssetNode => ({
  id,
  name,
  kind: "fixed",
  category: "architecture",
});

/** where a thing stands in the flat: its room (the living room when
    unset), the north-west corner of its footprint in mm from the
    room's, its turn in degrees clockwise on the plan (0 faces south),
    and a size other than what its name gives it */
type Place = Partial<
  Pick<PieceProps, "roomId" | "rotation" | "width" | "depth" | "height">
> & { x: number; y: number };

/**
 * The flat as it opens, room by room, furnished as a family with
 * children lives in it (after the family apartment planner it follows).
 * The living and dining room: a homework desk for three under the north
 * window with its chairs, the bookwall on the west wall beside it; the
 * sofa facing the media wall on the east wall, the rug and the coffee
 * table between, the armchair at the rug's south end; the dining table
 * by the kitchen's slider with four chairs; the sideboard on the south
 * wall between the slider and the entrance, the entry organiser for
 * shoes on the east wall by the door. The kitchen: the counter with its
 * wall cabinets along the south wall, the fridge and the trolley on the
 * north wall clear of the slider. The parents' room: a queen bed with
 * its head on the north wall and a bedside cabinet each side, the
 * wardrobe on the south wall clear of the door. The children's rooms:
 * a bunk bed for two on the west wall with a bedside cabinet and a
 * wardrobe across the room; a single bed, a desk with its chair, a
 * wardrobe and a bedside cabinet for the one alone. The bathrooms: a
 * shower behind its screen, the basin, the WC and a towel trolley; the
 * shelter's shelving on its back wall; the yard's washer and work cart.
 * Every gap is a walkway (600 mm or more) and every door's swing is
 * clear (showcase.test.ts).
 */
const R = SHOWCASE_ROOMS;
const SHOWCASE: [AssetNode, Place][] = [
  // the living and dining room
  [
    piece("bookwall", "bookwall", ["Segment A", "Segment B"]),
    { x: 0, y: 1300, rotation: 270 },
  ],
  [piece("sideboard"), { x: 2200, y: 5900, rotation: 180 }],
  [piece("entry"), { x: 5300, y: 4700, rotation: 90 }],
  [
    decor("homework-desk", "Homework desk", "tables"),
    { x: 300, y: 0, width: 2200, depth: 600 },
  ],
  [
    decor("desk-chair", "Desk chair", "seating"),
    { x: 450, y: 650, rotation: 180 },
  ],
  [
    decor("desk-chair-2", "Desk chair 2", "seating"),
    { x: 1150, y: 650, rotation: 180 },
  ],
  [
    decor("desk-chair-3", "Desk chair 3", "seating"),
    { x: 1850, y: 650, rotation: 180 },
  ],
  [
    decor("tv-console", "TV console", "tables"),
    { x: 5300, y: 2300, rotation: 90 },
  ],
  [
    decor("sofa", "Sofa", "seating"),
    { x: 2500, y: 2000, rotation: 270, width: 2400 },
  ],
  [
    decor("rug", "Rug", "decor"),
    { x: 3400, y: 2000, rotation: 90, width: 2400, depth: 1600 },
  ],
  [
    decor("coffee-table", "Coffee table", "tables"),
    { x: 4000, y: 2700, rotation: 90 },
  ],
  [
    decor("armchair", "Armchair", "seating"),
    { x: 3900, y: 4400, rotation: 180 },
  ],
  [decor("floor-lamp", "Floor lamp", "lighting"), { x: 2550, y: 1500 }],
  [decor("plant", "Potted plant", "decor"), { x: 5200, y: 1700 }],
  [
    decor("dining-table", "Dining table", "tables"),
    { x: 1100, y: 4400, rotation: 90, width: 1200 },
  ],
  [
    decor("chair-1", "Dining chair", "seating"),
    { x: 600, y: 4600, rotation: 270 },
  ],
  [
    decor("chair-2", "Dining chair 2", "seating"),
    { x: 600, y: 5100, rotation: 270 },
  ],
  [
    decor("chair-3", "Dining chair 3", "seating"),
    { x: 1950, y: 4600, rotation: 90 },
  ],
  [
    decor("chair-4", "Dining chair 4", "seating"),
    { x: 1950, y: 5100, rotation: 90 },
  ],
  // the kitchen, a galley
  [
    decor("counter", "Kitchen counter", "fittings"),
    { roomId: R.kitchen, x: 400, y: 1800, rotation: 180 },
  ],
  [decor("fridge", "Fridge", "fittings"), { roomId: R.kitchen, x: 0, y: 0 }],
  [piece("kitchen", "trolley-kitchen"), { roomId: R.kitchen, x: 1400, y: 0 }],
  // the parents' room
  [
    decor("bed", "Queen bed", "beds"),
    { roomId: R.master, x: 700, y: 0, width: 1600, depth: 2100 },
  ],
  [piece("bedside", "bedside-west"), { roomId: R.master, x: 100, y: 0 }],
  [
    piece("bedside", "bedside-east", undefined, "Bedside cabinet 2"),
    { roomId: R.master, x: 2300, y: 0 },
  ],
  [
    decor("wardrobe", "Wardrobe", "storage"),
    {
      roomId: R.master,
      x: 0,
      y: 3200,
      rotation: 180,
      width: 2000,
      height: 2200,
    },
  ],
  [
    decor("plant-2", "Potted plant 2", "decor"),
    { roomId: R.master, x: 2500, y: 2300 },
  ],
  // bedroom 2, one child's room
  [
    decor("bed-2", "Single bed", "beds"),
    { roomId: R.bedroom2, x: 1700, y: 0, width: 1000, depth: 1900 },
  ],
  [
    piece("desk", "desk-side-bedroom2"),
    { roomId: R.bedroom2, x: 0, y: 400, rotation: 270 },
  ],
  [
    decor("study-desk", "Study desk", "tables"),
    {
      roomId: R.bedroom2,
      x: 0,
      y: 1000,
      rotation: 270,
      width: 1200,
      depth: 600,
    },
  ],
  [
    decor("desk-chair-4", "Desk chair 4", "seating"),
    { roomId: R.bedroom2, x: 600, y: 1350, rotation: 90 },
  ],
  [
    decor("wardrobe-2", "Wardrobe 2", "storage"),
    {
      roomId: R.bedroom2,
      x: 0,
      y: 2800,
      rotation: 180,
      width: 900,
      height: 2100,
    },
  ],
  // bedroom 3, two children's room
  [
    decor("bunk-bed", "Bunk bed", "beds"),
    { roomId: R.bedroom3, x: 0, y: 400, width: 1000, depth: 2000 },
  ],
  [
    piece("bench", "bench-bedroom3"),
    { roomId: R.bedroom3, x: 0, y: 3000, rotation: 180 },
  ],
  [
    decor("wardrobe-3", "Wardrobe 3", "storage"),
    {
      roomId: R.bedroom3,
      x: 2400,
      y: 400,
      rotation: 90,
      width: 1200,
      height: 2100,
    },
  ],
  [
    decor("rug-2", "Rug 2", "decor"),
    { roomId: R.bedroom3, x: 1200, y: 1300, width: 1100, depth: 900 },
  ],
  // the first bathroom
  [
    decor("shower-screen", "Shower screen", "fittings"),
    { roomId: R.bathroom, x: 1400, y: 800, rotation: 90 },
  ],
  [
    decor("basin", "Basin cabinet", "fittings"),
    { roomId: R.bathroom, x: 0, y: 750, rotation: 270 },
  ],
  [
    decor("wc", "WC", "fittings"),
    { roomId: R.bathroom, x: 450, y: 1050, rotation: 180 },
  ],
  [
    decor("bath-mat", "Bath mat", "decor"),
    { roomId: R.bathroom, x: 600, y: 400 },
  ],
  // the second bathroom
  [
    decor("basin-2", "Basin cabinet 2", "fittings"),
    { roomId: R.bathroom2, x: 0, y: 300, rotation: 270, depth: 400 },
  ],
  [
    decor("wc-2", "WC 2", "fittings"),
    { roomId: R.bathroom2, x: 1350, y: 1000, rotation: 180 },
  ],
  [
    decor("shower-screen-2", "Shower screen 2", "fittings"),
    { roomId: R.bathroom2, x: 0, y: 900, rotation: 90, depth: 700 },
  ],
  // the household shelter
  [
    piece("bookwall", "shelter-shelving", undefined, "Shelter shelving"),
    { roomId: R.shelter, x: 200, y: 800, rotation: 180 },
  ],
  // the service yard
  [
    decor("washer", "Washing machine", "fittings"),
    { roomId: R.yard, x: 0, y: 0 },
  ],
  [piece("work-cart"), { roomId: R.yard, x: 0, y: 1500, rotation: 180 }],
];

type Entry = [AssetNode, Place];

/** where everything stands, as the scene's overrides over each piece's
    defaults */
const placesOf = (
  entries: readonly Entry[],
): Record<string, Partial<PieceProps>> =>
  Object.fromEntries(entries.map(([n, place]) => [n.id, place]));

/** the things by category, in the categories' order, the architecture
    last */
const groupsOf = (entries: readonly Entry[]): AssetGroup[] => [
  ...ASSET_CATEGORIES.filter((c) => c !== "architecture").flatMap((c) => {
    const items = entries.map(([n]) => n).filter((n) => n.category === c);
    return items.length ? [{ id: c, name: CATEGORY_NAMES[c], items }] : [];
  }),
  {
    id: "architecture",
    name: CATEGORY_NAMES.architecture,
    items: [
      fixed("walls", "Walls"),
      fixed("floor", "Floor"),
      fixed("window", "Window"),
    ],
  },
];

/** where everything in the flat stands as it opens */
export const showcasePlaces = placesOf(SHOWCASE);
/** the things in the flat by category */
export const assetGroups: AssetGroup[] = groupsOf(SHOWCASE);

/** an arrangement's change to the flat: things taken out by id, things
    added; and the rooms' paint and floors, by room id */
type Variant = {
  out: readonly string[];
  add: readonly Entry[];
  rooms?: Record<string, { wallTone?: string; floor?: string }>;
};
const varied = (v: Variant): Entry[] => [
  ...SHOWCASE.filter(([n]) => !v.out.includes(n.id)),
  ...v.add,
];

/**
 * The flat's arrangements, after the family apartment planner's three:
 * each opens as a project of its own. Balanced is the flat as above.
 * Study-focused gives the children more to learn at: a learning library
 * beside the homework desk, a study desk for the two sharing a room in
 * place of their rug, soft white walls. Leisure gives them more to play
 * in: a leisure bench and a reading chair under the living room's
 * window in place of the homework desk, a low play table in the shared
 * room, a bean bag in place of the single room's desk, sand and sage
 * walls over parquet.
 */
const BEDROOMS = [R.master, R.bedroom2, R.bedroom3];
export const ARRANGEMENTS: {
  id: "balanced" | "study" | "leisure";
  name: string;
  entries: Entry[];
  rooms: Record<string, { wallTone?: string; floor?: string }>;
}[] = [
  { id: "balanced", name: "Balanced", entries: SHOWCASE, rooms: {} },
  {
    id: "study",
    name: "Study-focused",
    ...(() => {
      const v: Variant = {
        out: ["rug-2"],
        add: [
          [
            piece(
              "bookwall",
              "learning-library",
              undefined,
              "Learning library",
            ),
            { x: 0, y: 2500, rotation: 270 },
          ],
          [
            decor("kids-desk", "Two-child study desk", "tables"),
            { roomId: R.bedroom3, x: 1000, y: 0, width: 1400, depth: 600 },
          ],
          [
            decor("kids-chair", "Desk chair 5", "seating"),
            { roomId: R.bedroom3, x: 1150, y: 650, rotation: 180 },
          ],
          [
            decor("kids-chair-2", "Desk chair 6", "seating"),
            { roomId: R.bedroom3, x: 1800, y: 650, rotation: 180 },
          ],
        ],
        rooms: Object.fromEntries(
          [R.living, ...BEDROOMS].map((id) => [id, { wallTone: "white" }]),
        ),
      };
      return { entries: varied(v), rooms: v.rooms ?? {} };
    })(),
  },
  {
    id: "leisure",
    name: "Leisure",
    ...(() => {
      const v: Variant = {
        out: [
          "homework-desk",
          "desk-chair",
          "desk-chair-2",
          "desk-chair-3",
          "study-desk",
          "desk-chair-4",
        ],
        add: [
          [
            piece("bench", "leisure-bench", undefined, "Leisure bench"),
            { x: 300, y: 0 },
          ],
          [
            decor("reading-chair", "Reading armchair", "seating"),
            { x: 2100, y: 0 },
          ],
          [
            decor("play-table", "Play table", "tables"),
            {
              roomId: R.bedroom3,
              x: 1600,
              y: 1700,
              width: 750,
              depth: 600,
              height: 450,
            },
          ],
          [
            decor("bean-bag", "Bean bag", "seating"),
            {
              roomId: R.bedroom2,
              x: 0,
              y: 1000,
              width: 700,
              depth: 700,
              height: 450,
            },
          ],
        ],
        rooms: {
          [R.living]: { wallTone: "sand", floor: "Parquet" },
          ...Object.fromEntries(
            BEDROOMS.map((id) => [id, { wallTone: "sage", floor: "Parquet" }]),
          ),
        },
      };
      return { entries: varied(v), rooms: v.rooms ?? {} };
    })(),
  },
];
/** an arrangement's things and places, as a project starts with them */
export const arrangementOf = (id: (typeof ARRANGEMENTS)[number]["id"]) => {
  const a = ARRANGEMENTS.find((x) => x.id === id) ?? ARRANGEMENTS[0]!;
  return {
    groups: groupsOf(a.entries),
    overrides: placesOf(a.entries),
    rooms: a.rooms,
  };
};

export const pieceTotals = (nodes: AssetNode[]) => {
  const pieces = nodes.filter((n) => n.kind === "piece");
  return {
    pieces: pieces.length,
    others: nodes.length - pieces.length,
    total: pieces.reduce((s, n) => s + (n.price ?? 0), 0),
  };
};

/** money as the studio shows it, from lib/money */
export { sgd } from "@/lib/money";
