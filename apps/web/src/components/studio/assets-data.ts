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
 * The studio opens on a flat of four rooms furnished as a flat is lived
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
 * The flat as it opens, room by room. The living and dining room: the
 * lounge under the window faces the sideboard on the south wall (the
 * media wall), the rug and the coffee table between, the armchair at
 * the rug's east end, the bookwall on the west wall north of the
 * bedroom door, the dining table at the east end beside the kitchen
 * door with its four chairs, the shoe bench and the entry organiser
 * either side of the entry door. The kitchen: a fitted counter along
 * the north wall with its wall cabinets, the fridge at the south-east,
 * the preparation island on the south wall with two stools, the
 * trolley at the counter's end under the window. The bedroom: a queen
 * bed with its head on the south wall, a bedside cabinet each side,
 * the storage bench at its foot, the wardrobe along the west wall, the
 * organiser by the window. The bathroom: the shower behind its screen
 * in the north-west corner, the basin on the north wall, the WC on the
 * south, the towel trolley in the south-east corner out of the door's
 * swing. Every gap is a walkway (600 mm or more) and every door's
 * swing is clear.
 */
const SHOWCASE: [AssetNode, Place][] = [
  // the living and dining room
  [piece("sideboard"), { x: 1100, y: 4100, rotation: 180 }],
  [
    piece("bookwall", "bookwall", ["Segment A", "Segment B"]),
    { x: 5200, y: 0 },
  ],
  [piece("bench"), { x: 4000, y: 4100, rotation: 180 }],
  [piece("entry"), { x: 6600, y: 1000, rotation: 90 }],
  [decor("sofa", "Sofa", "seating"), { x: 1000, y: 1300, width: 2400 }],
  [
    decor("rug", "Rug", "decor"),
    { x: 1000, y: 2300, width: 2400, depth: 1600 },
  ],
  [decor("coffee-table", "Coffee table", "tables"), { x: 1700, y: 2800 }],
  [
    decor("armchair", "Armchair", "seating"),
    { x: 3500, y: 2600, rotation: 90 },
  ],
  [decor("floor-lamp", "Floor lamp", "lighting"), { x: 3450, y: 1400 }],
  [decor("plant", "Potted plant", "decor"), { x: 200, y: 200 }],
  [decor("plant-2", "Potted plant 2", "decor"), { x: 6500, y: 200 }],
  [decor("dining-table", "Dining table", "tables"), { x: 4700, y: 1600 }],
  [decor("chair-1", "Dining chair", "seating"), { x: 4950, y: 1100 }],
  [decor("chair-2", "Dining chair 2", "seating"), { x: 5650, y: 1100 }],
  [
    decor("chair-3", "Dining chair 3", "seating"),
    { x: 4950, y: 2400, rotation: 180 },
  ],
  [
    decor("chair-4", "Dining chair 4", "seating"),
    { x: 5650, y: 2400, rotation: 180 },
  ],
  // the kitchen
  [
    piece("island"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 600, y: 2300, rotation: 180 },
  ],
  [
    piece("kitchen", "trolley-kitchen"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 2800, y: 1200, rotation: 90 },
  ],
  [
    decor("counter", "Kitchen counter", "fittings"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 0, y: 0 },
  ],
  [
    decor("fridge", "Fridge", "fittings"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 1800, y: 2050, rotation: 180 },
  ],
  [
    decor("stool-1", "Stool", "seating"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 800, y: 1900 },
  ],
  [
    decor("stool-2", "Stool 2", "seating"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 1300, y: 1900 },
  ],
  [
    decor("basket", "Wicker basket", "decor"),
    { roomId: SHOWCASE_ROOMS.kitchen, x: 2800, y: 2350 },
  ],
  // the master bedroom
  [
    decor("bed", "Queen bed", "beds"),
    {
      roomId: SHOWCASE_ROOMS.master,
      x: 1200,
      y: 1400,
      rotation: 180,
      width: 1600,
      depth: 2100,
    },
  ],
  [
    piece("bedside", "bedside-west"),
    { roomId: SHOWCASE_ROOMS.master, x: 600, y: 3100, rotation: 180 },
  ],
  [
    piece("bedside", "bedside-east", undefined, "Bedside cabinet 2"),
    { roomId: SHOWCASE_ROOMS.master, x: 2800, y: 3100, rotation: 180 },
  ],
  [
    piece("bench", "bench-master", undefined, "Storage bench 2"),
    { roomId: SHOWCASE_ROOMS.master, x: 1400, y: 1000 },
  ],
  [
    piece("desk"),
    { roomId: SHOWCASE_ROOMS.master, x: 3600, y: 200, rotation: 90 },
  ],
  [
    decor("wardrobe", "Wardrobe", "storage"),
    {
      roomId: SHOWCASE_ROOMS.master,
      x: 0,
      y: 200,
      rotation: 270,
      width: 2000,
      height: 2200,
    },
  ],
  [
    decor("plant-3", "Potted plant 3", "decor"),
    { roomId: SHOWCASE_ROOMS.master, x: 700, y: 150 },
  ],
  // the bathroom
  [
    decor("shower-screen", "Shower screen", "fittings"),
    { roomId: SHOWCASE_ROOMS.bathroom, x: 900, y: 0 },
  ],
  [
    decor("basin", "Basin cabinet", "fittings"),
    { roomId: SHOWCASE_ROOMS.bathroom, x: 950, y: 0 },
  ],
  [
    decor("wc", "WC", "fittings"),
    { roomId: SHOWCASE_ROOMS.bathroom, x: 1000, y: 1050, rotation: 180 },
  ],
  [
    decor("bath-mat", "Bath mat", "decor"),
    { roomId: SHOWCASE_ROOMS.bathroom, x: 950, y: 500 },
  ],
  [
    piece("kitchen", "trolley-bath", undefined, "Kitchen trolley 2"),
    { roomId: SHOWCASE_ROOMS.bathroom, x: 2000, y: 1100, rotation: 90 },
  ],
  [
    decor("basket-2", "Wicker basket 2", "decor"),
    { roomId: SHOWCASE_ROOMS.bathroom, x: 1500, y: 1350 },
  ],
];

/** where everything in the flat stands as it opens, as the scene's
    overrides over each piece's defaults */
export const showcasePlaces: Record<
  string,
  Partial<PieceProps>
> = Object.fromEntries(SHOWCASE.map(([n, place]) => [n.id, place]));

/** the things in the flat by category, in the categories' order, the
    architecture last */
export const assetGroups: AssetGroup[] = [
  ...ASSET_CATEGORIES.filter((c) => c !== "architecture").flatMap((c) => {
    const items = SHOWCASE.map(([n]) => n).filter((n) => n.category === c);
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
