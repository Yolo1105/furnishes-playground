import type { AssetCategory, AssetNode } from "./assets-data";

/**
 * What can be changed on a piece or one of its components: its colour,
 * its texture and its size. Defaults come from the category; the Detail
 * tab's edits sit over them in the scene store.
 */
export type PieceProps = {
  colour: string;
  texture: string;
  width: number;
  depth: number;
  height: number;
};

export const COLOURS = [
  { id: "oak", name: "Natural oak", hex: "#d9b98a" },
  { id: "walnut", name: "Walnut", hex: "#7a5236" },
  { id: "ash", name: "Ash white", hex: "#efe9e0" },
  { id: "charcoal", name: "Charcoal", hex: "#4a4541" },
  { id: "sage", name: "Sage", hex: "#b8bfa5" },
] as const;

export const TEXTURES = ["Matte", "Satin", "Wood grain", "Linen"] as const;

/** typical mm per category: width, depth, height */
const SIZES: Record<AssetCategory, [number, number, number]> = {
  components: [800, 300, 25],
  storage: [1200, 400, 900],
  seating: [1800, 900, 800],
  tables: [1200, 600, 750],
  lighting: [300, 300, 1500],
  decor: [400, 400, 400],
  architecture: [1000, 100, 2600],
};

export const defaultProps = (n: AssetNode): PieceProps => {
  const [width, depth, height] = SIZES[n.category];
  return { colour: "oak", texture: "Matte", width, depth, height };
};

/** how many pieces can be labelled for Eva at a time */
export const LABEL_MAX = 5;
