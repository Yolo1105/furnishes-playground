/**
 * Which real model draws a room item, by what the item is and its size:
 * a model is used only when every axis of the item is within ±10 % of
 * the model as it stands (turned a quarter if that fits better), so a
 * model is never stretched out of its own proportions, nor its texture
 * with it. Past that the nearest variant of the kind is tried, and with
 * none the item keeps its built form (Furniture3D), which also stands
 * in while a model loads. The models and their sizes are listed in
 * public/props/index.json (public/props/README.md says how a model is
 * added).
 */

export type Kind =
  | "sofa"
  | "armchair"
  | "coffee-table"
  | "side-table"
  | "floor-lamp"
  | "desk-lamp"
  | "plant"
  | "vase"
  | "rug"
  | "basket"
  | "stool"
  | "chair";

/** a model as public/props/index.json lists it */
export type Variant = {
  /** the file under /props, without .glb */
  file: string;
  kind: Kind;
  /** as it stands, m: width (x), height (y), depth (z) */
  size: [number, number, number];
  /** which of its materials are cloth, taking the item's colour */
  cloth?: string;
  /** a simplified copy for beyond the near distance (file.lod1.glb) */
  lod?: boolean;
};

/** how far an axis may be scaled */
export const FIT = 0.1;

/** the room item's kind from its name, or null for an item no model draws */
export const kindOf = (name: string, category: string): Kind | null => {
  const n = name.toLowerCase();
  if (/sofa|couch|settee/.test(n)) return "sofa";
  if (/arm ?chair|lounge|easy chair|reading chair/.test(n)) return "armchair";
  if (/coffee table/.test(n)) return "coffee-table";
  if (/side table|end table|low table/.test(n)) return "side-table";
  if (category === "lighting" && /floor|standing/.test(n)) return "floor-lamp";
  if (category === "lighting" && /desk|table/.test(n)) return "desk-lamp";
  if (/rug|carpet/.test(n)) return "rug";
  if (category === "decor" && /plant|fig|palm|fern/.test(n)) return "plant";
  if (category === "decor" && /vase|jug|bottle/.test(n)) return "vase";
  if (category === "decor" && /basket/.test(n)) return "basket";
  if (/stool/.test(n)) return "stool";
  return null;
};

/** a model's scale on each axis to stand at `size`, and whether it is
    turned a quarter about the vertical, when it fits within FIT on every
    axis; null when it does not */
export const fitOf = (
  v: Variant,
  [w, h, d]: readonly [number, number, number],
): { scale: [number, number, number]; turned: boolean } | null => {
  const [mw, mh, md] = v.size;
  const ok = (r: number) => Math.abs(r - 1) <= FIT + 1e-9;
  const straight: [number, number, number] = [w / mw, h / mh, d / md];
  const turned: [number, number, number] = [w / md, h / mh, d / mw];
  const cost = (s: number[]) =>
    s.reduce((n, r) => n + Math.abs(Math.log(r)), 0);
  const options = [
    { scale: straight, turned: false },
    { scale: turned, turned: true },
  ].filter((o) => o.scale.every(ok));
  if (!options.length) return null;
  return options.reduce((a, b) => (cost(b.scale) < cost(a.scale) ? b : a));
};

/** the variant of a kind that fits an item best, with its fit; null when
    none of them fits */
export const variantFor = (
  variants: readonly Variant[],
  kind: Kind,
  size: readonly [number, number, number],
) => {
  let best: { v: Variant; fit: NonNullable<ReturnType<typeof fitOf>> } | null =
    null;
  let bestCost = Infinity;
  for (const v of variants) {
    if (v.kind !== kind) continue;
    const fit = fitOf(v, size);
    if (!fit) continue;
    const c = fit.scale.reduce((n, r) => n + Math.abs(Math.log(r)), 0);
    if (c < bestCost) {
      best = { v, fit };
      bestCost = c;
    }
  }
  return best;
};

/** the near distance a hero model is drawn at in full, m; past it its
    simplified copy (with a margin either way, so it does not flip back
    and forth at the line) */
export const LOD_NEAR = 4;
export const LOD_HYSTERESIS = 0.4;
/** which copy to draw at a distance, given the one drawn now */
export const lodAt = (distance: number, now: 0 | 1): 0 | 1 =>
  now === 0
    ? distance > LOD_NEAR + LOD_HYSTERESIS
      ? 1
      : 0
    : distance < LOD_NEAR - LOD_HYSTERESIS
      ? 0
      : 1;
