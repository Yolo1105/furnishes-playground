import {
  type Configuration,
  defaultConfig,
  type Panel,
} from "@furnishes/domain";
import { recipeOf, recipeSize } from "./catalogue";
import type { AssetCategory, AssetNode } from "./assets-data";

/**
 * What can be changed on a piece or one of its components: its colour,
 * its texture and its size; and, for the piece as a whole, where it
 * stands, which way it turns, whether it is hidden or locked in place.
 * Defaults come from the category; the Detail tab's and the stage's
 * edits sit over them in the scene store. A piece with no `x`/`y` yet
 * stands where the room's layout puts it.
 */
export type PieceProps = {
  colour: string;
  texture: string;
  width: number;
  depth: number;
  height: number;
  /** mm from the room's north-west corner, once placed by hand */
  x?: number;
  y?: number;
  /** the room it stands in; the flat's first room when unset */
  roomId?: string;
  /** degrees clockwise on the plan, 0 to 359; a handle drag snaps to
      ROTATE_SNAP, the R key and Turn go a quarter at a time */
  rotation: number;
  hidden: boolean;
  locked: boolean;
  /** the piece opened as panels: its parts as the person has them,
      in its own frame (x across, y up from the floor, z to the front,
      mm about its middle); its size and price then come from them */
  panels?: Panel[];
  /** a Furnishes piece as configured: doors on its bays, and which
      add-ons it takes; unset, the recipe's own (defaultConfig) */
  doors?: boolean;
  accessories?: string[];
};

/** how a Furnishes piece is configured: what was chosen here, else
    the recipe's own; null for a piece with no recipe */
export const configOf = (
  n: Pick<AssetNode, "productId">,
  props: Pick<PieceProps, "doors" | "accessories">,
): Configuration | null => {
  const r = recipeOf(n);
  if (!r) return null;
  const base = defaultConfig(r);
  return {
    doors: props.doors ?? base.doors,
    accessories: props.accessories ?? base.accessories,
  };
};

/** a turn kept to 0 to 359 whole degrees */
export const normTurn = (t: number) => ((Math.round(t) % 360) + 360) % 360;
/** a handle drag snaps to this, degrees (Shift lets it go free) */
export const ROTATE_SNAP = 15;
/** true when the piece runs square to the walls */
export const isSquare = (t: number) => normTurn(t) % 90 === 0;

/** the piece's footprint on the plan, width along x, with its turn: the
    box round it when it stands on the slant */
export const footprint = (p: PieceProps) => {
  const r = normTurn(p.rotation);
  if (r % 90 === 0)
    return r % 180 === 0
      ? { w: p.width, d: p.depth }
      : { w: p.depth, d: p.width };
  const a = (r * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  return {
    w: Math.round(p.width * c + p.depth * s),
    d: Math.round(p.width * s + p.depth * c),
  };
};

/** the next quarter turn, from the nearest square one */
export const turned = (t: number) => normTurn(Math.round(t / 90) * 90 + 90);
/** the nearest square turn */
export const squared = (t: number) => normTurn(Math.round(t / 90) * 90);
/** a drag snaps to this, mm */
export const PLACE_SNAP = 50;

export const COLOURS = [
  { id: "oak", name: "Natural oak", hex: "#d9b98a" },
  { id: "walnut", name: "Walnut", hex: "#7a5236" },
  { id: "ash", name: "Ash white", hex: "#efe9e0" },
  { id: "charcoal", name: "Charcoal", hex: "#4a4541" },
  { id: "sage", name: "Sage", hex: "#b8bfa5" },
] as const;

export const TEXTURES = ["Matte", "Satin", "Wood grain", "Linen"] as const;

/** a colour's hex, where a canvas needs one (three.js, the mini views) */
export const colourHex = (id: string) =>
  COLOURS.find((c) => c.id === id)?.hex ?? COLOURS[0].hex;
/** a room item there to read the room: quiet, never a piece's colour */
export const ROOM_ITEM_HEX = "#d9d2c8";
/** the light wood the props and the door are finished in */
export const LIGHT_WOOD_HEX = "#cfae82";
/** the accent as a canvas needs it, a plain hex: the token itself is oklch */
export const ACCENT_HEX = "#ed5c00";
/** the warning colour, as `--color-danger` reads in sRGB */
export const DANGER_HEX = "#cc3b2c";
/** a plant's crown */
export const FOLIAGE_HEX = "#8fa37c";

/** typical mm per category: width, depth, height */
const SIZES: Record<AssetCategory, [number, number, number]> = {
  components: [800, 300, 25],
  storage: [1200, 400, 900],
  seating: [1800, 900, 800],
  tables: [1200, 600, 750],
  screens: [1500, 300, 1700],
  lighting: [300, 300, 1500],
  decor: [400, 400, 400],
  architecture: [1000, 100, 2600],
};

/** typical mm by what the piece is called, before its category's size */
const SIZES_BY_NAME: [RegExp, [number, number, number]][] = [
  [/armchair/i, [800, 850, 800]],
  [/sofa/i, [1800, 900, 800]],
  [/bench/i, [1200, 400, 450]],
  [/coffee table/i, [1000, 600, 420]],
  [/cart|trolley/i, [600, 450, 750]],
  [/island/i, [1200, 700, 900]],
  [/floor lamp/i, [300, 300, 1500]],
  [/desk lamp/i, [200, 200, 450]],
  [/plant/i, [400, 400, 900]],
  [/vase/i, [200, 200, 350]],
  [/rug/i, [1600, 1200, 15]],
  [/screen/i, [1500, 300, 1700]],
  [/bedside/i, [450, 400, 550]],
  [/\bbed\b/i, [1550, 2000, 450]],
  [/wardrobe/i, [1200, 600, 2000]],
  [/\bdesk\b(?!-side| lamp)/i, [1200, 600, 750]],
  [/dining table/i, [1400, 800, 750]],
  [/coat stand/i, [400, 400, 1750]],
];

/** the body a piece is drawn as: a cart on castors, a bench, a carcass
    of panels, or none of these (a room item drawn by what it is) */
export const bodyOf = (
  n: Pick<AssetNode, "name" | "kind" | "category" | "productId">,
): "cart" | "bench" | "carcass" | null => {
  const r = recipeOf(n);
  const name = n.name.toLowerCase();
  const shape = r?.shape;
  if (shape === "trolley" || shape === "island" || /cart|trolley/.test(name))
    return "cart";
  if (shape === "bench" || /bench/.test(name)) return "bench";
  if (
    n.kind === "piece" &&
    (r
      ? shape !== "folding"
      : n.category !== "decor" && n.category !== "screens")
  )
    return "carcass";
  return null;
};

/** a carcass's bays and whether it has doors: how its panels are laid
    out, or null for a piece that is not a carcass */
export const carcassOf = (
  n: Pick<AssetNode, "name" | "kind" | "category" | "productId" | "children">,
): { bays: number; doors: boolean } | null => {
  if (bodyOf(n) !== "carcass") return null;
  const r = recipeOf(n);
  return {
    // a piece with parts has a bay a part; a recipe has its bays
    bays: n.children?.length || r?.bays || 1,
    doors: r
      ? r.door && r.shape === "cabinet"
      : /sideboard|cabinet|wardrobe|drawer/.test(n.name.toLowerCase()),
  };
};

/** a rug lies under things; a small item (a lamp, a vase) is no obstacle */
export const isRug = (n: Pick<AssetNode, "name">) => /rug/i.test(n.name);
export const isSmall = (p: Pick<PieceProps, "width" | "depth">) =>
  Math.max(p.width, p.depth) < 500;

export const defaultProps = (n: AssetNode): PieceProps => {
  // a Furnishes piece is the size its recipe draws it; anything else is
  // sized by what it is called, then by its kind
  const recipe = recipeOf(n);
  const [width, depth, height] = recipe
    ? recipeSize(recipe)
    : (SIZES_BY_NAME.find(([re]) => re.test(n.name))?.[1] ?? SIZES[n.category]);
  // a Furnishes piece is plywood: it opens in its grain
  return {
    colour: "oak",
    texture: recipe ? "Wood grain" : "Matte",
    width,
    depth,
    height,
    rotation: 0,
    hidden: false,
    locked: false,
  };
};

/** how many pieces can be labelled for Eva at a time */
export const LABEL_MAX = 5;
