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

export const KINDS = [
  "sofa",
  "armchair",
  "coffee-table",
  "side-table",
  "floor-lamp",
  "desk-lamp",
  "plant",
  "vase",
  "rug",
  "basket",
  "stool",
  "pouf",
  "chair",
  "cushion",
  "throw",
  "fridge",
  "toilet",
  "basin",
  "tap",
  "bed",
  "dish-rack",
  "cabinet",
  "planter",
  "books",
  "box",
  "laptop",
] as const;
export type Kind = (typeof KINDS)[number];
/** a model's design, which an item keeps: a boxy sofa is never drawn
    as a curved one (round 8, Part 2) */
export type Style = "boxy" | "curved" | "organic";

/** a model as public/props/index.json lists it */
export type Variant = {
  /** the file under /props, without .glb */
  file: string;
  kind: Kind;
  /** as it stands, m: width (x), height (y), depth (z) */
  size: [number, number, number];
  style: Style;
  /** which of its materials are cloth, taking the item's colour */
  cloth?: string;
  /** a simplified copy for beyond the near distance (file.lod1.glb) */
  lod?: boolean;
  /** what was found when it was checked: a correction, a limit */
  note?: string;
};

/** how far an axis may be scaled */
export const FIT = 0.1;

/** the room item's kind from its name (or a few words asked for), or
    null for an item no model draws */
export const kindOf = (name: string, category = ""): Kind | null => {
  const n = name.toLowerCase();
  if (/sofa|couch|settee/.test(n)) return "sofa";
  if (/arm ?chair|lounge|easy chair|reading chair/.test(n)) return "armchair";
  if (/coffee table/.test(n)) return "coffee-table";
  if (/side table|end table|low table/.test(n)) return "side-table";
  if (/floor lamp|standing lamp|arc lamp/.test(n)) return "floor-lamp";
  if (/desk lamp|table lamp/.test(n)) return "desk-lamp";
  if (category === "lighting" && /floor|standing/.test(n)) return "floor-lamp";
  if (category === "lighting" && /desk|table/.test(n)) return "desk-lamp";
  if (/rug|carpet/.test(n)) return "rug";
  if (/planter|herbs?\b|window box/.test(n)) return "planter";
  if (/plant|fig|palm|fern|monstera|tree/.test(n)) return "plant";
  if (/vase|jug|bottle|flowers/.test(n)) return "vase";
  if (/basket|hamper/.test(n)) return "basket";
  if (/pouf|ottoman|footstool/.test(n)) return "pouf";
  if (/stool/.test(n)) return "stool";
  if (/cushion|pillow/.test(n)) return "cushion";
  if (/throw|blanket/.test(n)) return "throw";
  if (/fridge|refrigerator/.test(n)) return "fridge";
  if (/\bwc\b|toilet/.test(n)) return "toilet";
  if (/\btap\b|faucet|mixer/.test(n)) return "tap";
  if (/basin|sink|vanity/.test(n)) return "basin";
  if (/dish ?rack|drying rack/.test(n)) return "dish-rack";
  if (/\bbed\b/.test(n) && !/bedside/.test(n)) return "bed";
  if (/books?\b|encyclop/.test(n)) return "books";
  if (/laptop|computer|notebook/.test(n)) return "laptop";
  if (/\bbox\b|carton|crate/.test(n)) return "box";
  if (/cabinet|dresser|chest|cupboard/.test(n)) return "cabinet";
  if (/chair/.test(n)) return "chair";
  return null;
};

/** the design an item asks for by its name: curved when it says so
    (velvet, tufted, round, an oval or a tub), organic for what grows or
    is thrown and turned, boxy otherwise, as the studio's own forms are */
export const styleOf = (name: string, kind: Kind): Style => {
  if (/plant|vase|cushion|throw|basket|planter/.test(kind)) return "organic";
  if (kind === "floor-lamp" || kind === "desk-lamp") return "organic";
  return /velvet|tufted|round|oval|tub|curv|chesterfield|wingback|glam/i.test(
    name,
  )
    ? "curved"
    : "boxy";
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

/** the variant of a kind (and of the item's design, when given) that
    fits an item best, with its fit; null when none of them fits */
export const variantFor = (
  variants: readonly Variant[],
  kind: Kind,
  size: readonly [number, number, number],
  style?: Style,
) => {
  let best: { v: Variant; fit: NonNullable<ReturnType<typeof fitOf>> } | null =
    null;
  let bestCost = Infinity;
  for (const v of variants) {
    if (v.kind !== kind || (style && v.style !== style)) continue;
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

/** the kinds whose built form only stands in for a model (a lamp, a
    plant, an armchair's frame): an item of one with no model within
    `FIT` takes the nearest model's own size instead, and the planner
    says so. A sofa, a table or a bed keeps its own size and its built
    form, which is a design of its own (the soft box, 1f) */
export const SNAPS: readonly Kind[] = [
  "armchair",
  "floor-lamp",
  "desk-lamp",
  "plant",
  "vase",
  "basket",
  "stool",
  "pouf",
  "cushion",
  "throw",
];
/** the most an axis may change when an item takes its model's size: past
    it the model is another design, not this one at another size (the
    only floor lamp, an arc lamp, is nearly four times as wide as a
    standing one) */
export const SNAP_MOST = 1.8;
/** the size (w, h, d, m) an item of a snapping kind takes so a model of
    its design draws it, when none fits as it is; null when one fits, the
    kind keeps its own size, or the nearest is another design */
export const snapFor = (
  variants: readonly Variant[],
  kind: Kind,
  style: Style,
  size: readonly [number, number, number],
) => {
  if (!SNAPS.includes(kind) || variantFor(variants, kind, size, style))
    return null;
  let best: { v: Variant; size: [number, number, number] } | null = null;
  let bestCost = Infinity;
  for (const v of variants) {
    if (v.kind !== kind || v.style !== style) continue;
    const [mw, mh, md] = v.size;
    for (const s of [
      [mw, mh, md],
      [md, mh, mw],
    ] as [number, number, number][]) {
      const r = s.map((m, k) => m / size[k]!);
      if (r.some((x) => x > SNAP_MOST || x < 1 / SNAP_MOST)) continue;
      const c = r.reduce((n, x) => n + Math.abs(Math.log(x)), 0);
      if (c < bestCost) {
        best = { v, size: s };
        bestCost = c;
      }
    }
  }
  return best;
};

/** the model that stands in for what a few words describe (a room item
    asked for with no provider connected): the kind's first listed */
export const modelFor = (variants: readonly Variant[], words: string) => {
  const kind = kindOf(words);
  const v = kind ? variants.find((m) => m.kind === kind) : undefined;
  return v ? `/props/${v.file}.glb` : undefined;
};

/** the near distance a model is drawn at in full, m: a room's far corner
    from its near one, so a room's own views draw it in full; past it,
    from the flat's overviews, its simplified copy (with a margin either
    way, so it does not flip back and forth at the line) */
export const LOD_NEAR = 8;
export const LOD_HYSTERESIS = 0.5;
/** which copy to draw at a distance, given the one drawn now */
export const lodAt = (distance: number, now: 0 | 1): 0 | 1 =>
  now === 0
    ? distance > LOD_NEAR + LOD_HYSTERESIS
      ? 1
      : 0
    : distance < LOD_NEAR - LOD_HYSTERESIS
      ? 0
      : 1;
