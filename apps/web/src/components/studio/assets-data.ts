/**
 * Everything standing in the room, as the outliner and the shelf see it.
 *
 * Two kinds of thing share the scene:
 *   piece  — a Furnishes modular piece: editable, purchasable, priced
 *   decor  — something placed so the scene reads as a room (sofa, plant)
 *   fixed  — architecture: walls, floor, window
 *
 * Groups follow how furniture relates (storage, seating, tables…), never
 * what can be edited: that is a mark on the row, not a folder.
 *
 * The pieces the first room starts with are made from the catalogue's
 * recipes, so their size and price are the recipe's; the room items are
 * the things a room has.
 */
import { productOf } from "./catalogue";
export type AssetKind = "piece" | "decor" | "fixed";

export type AssetCategory =
  | "components"
  | "storage"
  | "seating"
  | "tables"
  | "screens"
  | "lighting"
  | "decor"
  | "architecture";

export const CATEGORY_NAMES: Record<AssetCategory, string> = {
  components: "Components",
  storage: "Storage",
  seating: "Seating",
  tables: "Tables & desks",
  screens: "Screens & dividers",
  lighting: "Lighting",
  decor: "Plants & décor",
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
};

export type AssetGroup = {
  id: AssetCategory;
  name: string;
  items: AssetNode[];
};

/** a Furnishes piece in the room, made from a catalogue recipe: its
    category and price are the recipe's; its bays can be named as parts,
    each a share of the price */
const piece = (
  productId: string,
  id = productId,
  bays?: string[],
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
    name: p.name,
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

export const assetGroups: AssetGroup[] = [
  {
    id: "storage",
    name: CATEGORY_NAMES.storage,
    items: [
      piece("bookwall", "bookwall", ["Segment A", "Segment B"]),
      piece("sideboard"),
      piece("entry"),
    ],
  },
  {
    id: "seating",
    name: CATEGORY_NAMES.seating,
    items: [
      decor("sofa", "Sofa", "seating"),
      decor("armchair", "Armchair", "seating"),
      piece("bench"),
    ],
  },
  {
    id: "tables",
    name: CATEGORY_NAMES.tables,
    items: [
      decor("coffee-table", "Coffee table", "tables"),
      piece("work-cart"),
    ],
  },
  {
    id: "lighting",
    name: CATEGORY_NAMES.lighting,
    items: [
      decor("floor-lamp", "Floor lamp", "lighting"),
      decor("desk-lamp", "Desk lamp", "lighting"),
    ],
  },
  {
    id: "decor",
    name: CATEGORY_NAMES.decor,
    items: [
      decor("plant", "Potted plant", "decor"),
      decor("vase", "Ceramic vase", "decor"),
      decor("rug", "Rug", "decor"),
    ],
  },
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

/** Singapore dollars, whole numbers, written "S$1,540". Intl alone prints
    a bare "$" for SGD in the Singapore locale, so the symbol is set here. */
const sgdFormat = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 0,
});
export const sgd = (n: number) =>
  sgdFormat
    .formatToParts(n)
    .map((p) => (p.type === "currency" ? "S$" : p.value))
    .join("");
