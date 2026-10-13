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
    and a size other than what its name gives it; a Furnishes piece's
    add-ons where they are not the recipe's own */
type Place = Partial<
  Pick<
    PieceProps,
    | "roomId"
    | "rotation"
    | "width"
    | "depth"
    | "height"
    | "accessories"
    | "colour"
  >
> & { x: number; y: number };

/**
 * The flat as it opens, room by room, furnished as a family with
 * children lives in it (after the family apartment planner it follows).
 * The living and dining room: a homework desk for three under the north
 * window with its chairs, the bookwall on the west wall beside it; the
 * sofa facing the media wall on the east wall, the rug and the coffee
 * table between, the armchair at the rug's south end; the dining table
 * by the kitchen's slider with four chairs; the sideboard, a charging
 * dock on its top, on the south wall between the slider and the
 * entrance, the entry organiser for shoes on the east wall by the door. The kitchen: the counter with its
 * wall cabinets along the south wall, the fridge and the trolley on the
 * north wall clear of the slider. The parents' room: a queen bed with
 * its head on the south wall and a bedside cabinet each side, the
 * wardrobe on the north wall beside the door to their bathroom. The children's rooms:
 * a bunk bed for two on the west wall with a bedside cabinet and a
 * wardrobe across the room; a single bed, a desk with its chair, a
 * wardrobe and a bedside cabinet for the one alone. The bathrooms: a
 * shower behind its screen, the basin (an oak vanity in the parents'),
 * the WC and a bath mat; the
 * shelter's shelving on its back wall; the yard's washer and work cart.
 * Every gap is a walkway (600 mm or more) and every door's swing is
 * clear (showcase.test.ts).
 */
const R = SHOWCASE_ROOMS;
/** the parents' bathroom's vanity, a warm oak */
const VANITY_OAK = "#a07a52";
const SHOWCASE: [AssetNode, Place][] = [
  // the living and dining room
  [
    piece("bookwall", "bookwall", ["Segment A", "Segment B"]),
    { x: 0, y: 1300, rotation: 270 },
  ],
  // the family's command sideboard: the tablets and the phones charge
  // on its top, by the way in
  [
    piece("sideboard"),
    { x: 2200, y: 5900, rotation: 180, accessories: ["charging-dock"] },
  ],
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
    {
      roomId: R.master,
      x: 600,
      y: 1700,
      rotation: 180,
      width: 1600,
      depth: 2100,
    },
  ],
  [
    piece("bedside", "bedside-west"),
    { roomId: R.master, x: 0, y: 3400, rotation: 180 },
  ],
  [
    piece("bedside", "bedside-east", undefined, "Bedside cabinet 2"),
    { roomId: R.master, x: 2200, y: 3400, rotation: 180 },
  ],
  [
    decor("wardrobe", "Wardrobe", "storage"),
    { roomId: R.master, x: 0, y: 0, width: 2000, height: 2200 },
  ],
  [
    decor("plant-2", "Potted plant 2", "decor"),
    { roomId: R.master, x: 0, y: 1000 },
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
    decor("basin-2", "Vanity cabinet", "fittings"),
    // in oak, the suite's own
    {
      roomId: R.bathroom2,
      x: 0,
      y: 300,
      rotation: 270,
      depth: 400,
      colour: VANITY_OAK,
    },
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
    // by the window at the yard's far end, its back to the west wall
    { roomId: R.yard, x: 0, y: 3250, rotation: 270 },
  ],
  [piece("work-cart"), { roomId: R.yard, x: 0, y: 1500, rotation: 270 }],
];

type Entry = [AssetNode, Place];

/** where everything stands, as the scene's overrides over each piece's
    defaults */
const placesOf = (
  entries: readonly Entry[],
): Record<string, Partial<PieceProps>> =>
  Object.fromEntries(
    entries.flatMap(([n, place]) => [
      [n.id, place],
      // a piece's parts take its finish
      ...(place.colour
        ? (n.children ?? []).map((c) => [c.id, { colour: place.colour }])
        : []),
    ]),
  );

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
    added, things moved (by id, what of their place changes); the finish
    every Furnishes piece takes (a colour's id), and a room item's own
    tone (by id, a hex: the sofa's linen, the rug's wool); and the
    rooms' paint and floors, by room id */
type Variant = {
  out: readonly string[];
  add: readonly Entry[];
  move?: Record<string, Partial<Place>>;
  paint?: string;
  tones?: Record<string, string>;
  rooms?: Record<string, { wallTone?: string; floor?: string }>;
};
const varied = (v: Variant): Entry[] =>
  [...SHOWCASE.filter(([n]) => !v.out.includes(n.id)), ...v.add].map(
    ([n, place]): Entry => [
      n,
      {
        ...place,
        ...v.move?.[n.id],
        ...(n.kind === "piece" && v.paint ? { colour: v.paint } : {}),
        ...(v.tones?.[n.id] ? { colour: v.tones[n.id] } : {}),
      },
    ],
  );

/**
 * The flat's arrangements, after the family apartment planner's three:
 * each opens as a project of its own, and each reads apart at a glance
 * by its pieces, its layout and its palette, not its floor alone.
 * Balanced is the flat as above: oak pieces, a linen sofa, warm walls.
 * Study-focused gives the children more to learn at: a learning library
 * beside the bookwall, an organiser workstation in the north-east corner
 * where the armchair and the lamp were, a study desk for the two sharing
 * a room in place of their rug; ash white pieces, a cool grey sofa on a
 * slate rug, white walls. Leisure gives them more to play in: a leisure
 * bench and a reading chair under the living room's window in place of
 * the homework desk, a second armchair across the rug, a low play table
 * in the shared room, a bean bag in place of the single room's desk;
 * walnut pieces, a terracotta sofa on a rust rug, sand and sage walls
 * over parquet.
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
        out: ["rug-2", "armchair", "floor-lamp"],
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
          // a second place to work, in the north-east corner clear of both
          // windows, the plant moved to the lamp's place
          [
            piece("workstation"),
            { x: 4700, y: 0, rotation: 90, accessories: ["charging-dock"] },
          ],
          [
            decor("desk-chair-7", "Desk chair 7", "seating"),
            { x: 4100, y: 350, rotation: 270 },
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
        // ash white pieces, a cool grey sofa on a slate rug, crisp linen
        move: { plant: { x: 2550, y: 1500 } },
        paint: "ash",
        tones: {
          sofa: "#aeb3b1",
          rug: "#5f666a",
          bed: "#dfe4e8",
          "bed-2": "#dfe4e8",
          "bunk-bed": "#dfe4e8",
        },
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
          // a second armchair across the rug from the first
          [decor("armchair-2", "Armchair 2", "seating"), { x: 3900, y: 1100 }],
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
        // walnut pieces, a terracotta sofa on a rust rug, oatmeal
        // armchairs, warm linen
        paint: "walnut",
        tones: {
          sofa: "#8c5c49",
          rug: "#7a4a36",
          armchair: "#d6c3a2",
          "armchair-2": "#d6c3a2",
          "reading-chair": "#d6c3a2",
          bed: "#e8d6bf",
          "bed-2": "#e8d6bf",
          "bunk-bed": "#e8d6bf",
        },
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
