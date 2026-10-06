import {
  depthOf,
  partPrice,
  priceOf,
  products as recipes,
  type Product as Recipe,
} from "@furnishes/domain";
import type { AssetCategory, AssetNode } from "./assets-data";

/** A product from the catalogue, as the Products tab and the + strip
    list it: a Furnishes recipe with its price counted from its parts, or
    one part on its own. Every price is an estimate, and says so. */
export type Product = {
  id: string;
  name: string;
  category: AssetCategory;
  /** S$, an estimate from the parts */
  price: number;
  /** the recipe behind a piece: its body, parts, steps and price lines */
  recipe?: Recipe;
};

/** the parts a piece is built from, sold on their own: what the + in
    the toolbar offers to click or drag into the room. Each is priced as
    the one part it is. */
const PARTS: [string, string, Parameters<typeof partPrice>[0], string][] = [
  ["c-shelf", "Shelf", "panel", "564 × 380 × 18 mm"],
  ["c-divider", "Divider", "panel", "400 × 400 × 18 mm"],
  ["c-back", "Back panel", "panel", "564 × 400 × 18 mm"],
  ["c-drawer", "Drawer", "door", "564 × 380 × 18 mm"],
  ["c-door", "Door", "door", "564 × 382 × 18 mm"],
];

export const products: Product[] = [
  ...PARTS.map(([id, name, kind, spec]) => ({
    id,
    name,
    category: "components" as const,
    price: partPrice(kind, spec),
  })),
  ...recipes.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    price: priceOf(r).sgd,
    recipe: r,
  })),
];

export const productOf = (id: string) => products.find((p) => p.id === id);

/** the recipe a piece in the room was made from, if it is a Furnishes
    piece: its parts and its size come from it */
export const recipeOf = (n: Pick<AssetNode, "productId">) =>
  n.productId ? productOf(n.productId)?.recipe : undefined;

/** a recipe's size as a piece in the room, mm: width, depth, height */
export const recipeSize = (r: Recipe): [number, number, number] => [
  r.width,
  depthOf(r),
  r.height,
];
