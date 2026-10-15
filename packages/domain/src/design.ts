import { carcassPanels, DRAWER_MM, PLINTH_MM, priceOfPanels } from "./carcass";
import { nest, SHEET } from "./cutlist";
import { SYSTEM } from "./features";
import { PANEL_THICKNESS, type Panel } from "./panels";

/**
 * A custom Furnishes piece as a recipe (round 8, Part 3a): what the
 * designer (Eva's `design_piece` tool, or the words alone without her)
 * writes, never a mesh. The recipe is checked against how the pieces are
 * made: 18 mm birch plywood, shelves on the 32 mm system, a shelf no
 * longer than an 18 mm board carries without sagging, a door leaf no
 * wider than its hinges hold, every panel cut from a 2440 × 1220 sheet,
 * and room in a bay for what goes in it. The same recipe gives the 2D
 * views, the price, the cut list and the 3D piece (carcassPanels), so
 * the picture always matches what can be made.
 */

/** a finish a designed piece comes in: the catalogue's colours */
export const DESIGN_FINISHES = [
  "oak",
  "walnut",
  "ash",
  "charcoal",
  "sage",
] as const;
export type DesignFinish = (typeof DESIGN_FINISHES)[number];

export type DesignRecipe = {
  name: string;
  /** mm: across the front, up from the floor, front to back */
  width: number;
  height: number;
  depth: number;
  /** bays side by side, shelves in each, bays with a door (from the
      left), bays after those with a drawer at their foot */
  bays: number;
  shelves: number;
  doors: number;
  drawers: number;
  /** on a recessed plinth, or straight on the floor */
  plinth: boolean;
  finish: DesignFinish;
};

/** the rules' numbers, mm: the sizes a piece may be, the most bays and
    shelves, the longest an 18 mm shelf spans unsupported, the widest a
    door leaf on two hinges, the least room between two shelves, and
    the 32 mm system's step */
export const DESIGN_RULES = {
  width: [300, 2400],
  height: [300, 2400],
  depth: [250, 600],
  bays: [1, 6],
  shelves: [0, 8],
  span: 800,
  leaf: 600,
  gap: 160,
  pitch: SYSTEM.pitch,
  panel: PANEL_THICKNESS,
} as const;

/** a rule a recipe breaks: which part of it, and why, in words the
    designer (and a person) can act on */
export type DesignProblem = {
  field: keyof DesignRecipe | "panels";
  message: string;
};

/** a bay's width inside, mm */
export const bayWidth = (r: Pick<DesignRecipe, "width" | "bays">) =>
  (r.width - PANEL_THICKNESS * (r.bays + 1)) / r.bays;

/** the recipe's panels, in the piece's frame (carcass.ts) */
export const designPanels = (r: DesignRecipe): Panel[] =>
  carcassPanels({
    width: r.width,
    depth: r.depth,
    height: r.height,
    bays: r.bays,
    doors: r.doors > 0,
    doored: r.doors,
    drawers: r.drawers,
    shelves: r.shelves,
    plinth: r.plinth,
  });

/** what the recipe breaks; none when it can be made */
export const checkRecipe = (r: DesignRecipe): DesignProblem[] => {
  const out: DesignProblem[] = [];
  const range = (
    field: "width" | "height" | "depth" | "bays" | "shelves",
    unit: string,
  ) => {
    const [lo, hi] = DESIGN_RULES[field];
    if (!(r[field] >= lo && r[field] <= hi))
      out.push({
        field,
        message: `${field} must be ${lo}–${hi}${unit}; it is ${r[field]}${unit}`,
      });
  };
  range("width", " mm");
  range("height", " mm");
  range("depth", " mm");
  range("bays", "");
  range("shelves", "");
  for (const k of ["bays", "shelves", "doors", "drawers"] as const)
    if (!Number.isInteger(r[k]))
      out.push({ field: k, message: `${k} must be a whole number` });
  if (r.doors < 0 || r.drawers < 0 || r.doors + r.drawers > r.bays)
    out.push({
      field: "doors",
      message: `doors and drawers take a bay each: ${r.doors} + ${r.drawers} is more than the ${r.bays} bay${r.bays === 1 ? "" : "s"}`,
    });
  if (out.length > 0) return out;
  const bay = bayWidth(r);
  if (bay > DESIGN_RULES.span)
    out.push({
      field: "bays",
      message: `a bay ${Math.round(bay)} mm wide is more than an 18 mm shelf spans (${DESIGN_RULES.span} mm): use at least ${Math.ceil((r.width - PANEL_THICKNESS) / (DESIGN_RULES.span + PANEL_THICKNESS))} bays`,
    });
  if (r.doors > 0 && bay > DESIGN_RULES.leaf)
    out.push({
      field: "doors",
      message: `a door ${Math.round(bay)} mm wide is more than one leaf on two hinges holds (${DESIGN_RULES.leaf} mm): use narrower bays`,
    });
  // the room between shelves, in the tallest bay (one with no drawer)
  const inner = r.height - (r.plinth ? PLINTH_MM : 0) - 2 * PANEL_THICKNESS;
  const room =
    (inner - (r.drawers === r.bays ? DRAWER_MM + PANEL_THICKNESS : 0)) /
    (r.shelves + 1);
  if (room < DESIGN_RULES.gap)
    out.push({
      field: "shelves",
      message: `${r.shelves} shelves leave ${Math.round(room)} mm between them; ${DESIGN_RULES.gap} mm at least: fewer shelves or a taller piece`,
    });
  if (r.drawers > 0 && inner < DRAWER_MM + PANEL_THICKNESS + DESIGN_RULES.gap)
    out.push({
      field: "drawers",
      message: `a drawer needs ${DRAWER_MM + PANEL_THICKNESS + DESIGN_RULES.gap} mm inside; this piece has ${Math.round(inner)} mm`,
    });
  if (out.length > 0) return out;
  const cut = nest(designPanels(r), SHEET);
  for (const u of cut.unplaced)
    out.push({
      field: "panels",
      message: `the ${u.name.toLowerCase()} does not fit a ${SHEET.length} × ${SHEET.width} mm sheet`,
    });
  return out;
};

/** what a recipe comes to: its panels, its price (S$, an estimate),
    and its cut list */
export const designOf = (r: DesignRecipe) => {
  const panels = designPanels(r);
  return { panels, price: priceOfPanels(panels), cut: nest(panels, SHEET) };
};

/** the words of a number, as people write them for a count */
const COUNTS: Record<string, number> = {
  no: 0,
  one: 1,
  a: 1,
  an: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};
const count = (text: string, noun: RegExp) => {
  const m = text.match(
    new RegExp(
      `\\b(\\d+|${Object.keys(COUNTS).join("|")})\\s+(?:\\w+\\s+)?(?:${noun.source})`,
      "i",
    ),
  );
  if (!m) return null;
  const v = m[1]!.toLowerCase();
  return /^\d+$/.test(v) ? Number(v) : COUNTS[v]!;
};
/** the lengths in the words ("1.6 m", "160 cm", "1600 mm"), each with
    the word that names which it is (wide, tall, deep), before or after */
const UNIT = "(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b";
const SIZE_WORDS = {
  width: /wide|width|across|long/,
  height: /tall|high|height/,
  depth: /deep|depth/,
} as const;
const lengths = (text: string) =>
  [...text.matchAll(new RegExp(UNIT, "gi"))].map((m) => {
    const n = Number(m[1]);
    const u = m[2]!.toLowerCase();
    const after =
      text.slice(m.index + m[0].length).match(/^\s*(\w+)/)?.[1] ?? "";
    const before = text.slice(0, m.index).match(/(\w+)\W{0,3}$/)?.[1] ?? "";
    // the word after names it first ("75 cm tall"), else the one before
    // ("width 1200 mm")
    const keys = Object.keys(SIZE_WORDS) as (keyof typeof SIZE_WORDS)[];
    const named =
      keys.find((k) => SIZE_WORDS[k].test(after)) ??
      keys.find((k) => SIZE_WORDS[k].test(before));
    return {
      mm: Math.round(u === "m" ? n * 1000 : u === "cm" ? n * 10 : n),
      named,
    };
  });
const snap = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, [lo, hi]: readonly [number, number]) =>
  Math.min(hi, Math.max(lo, v));

/**
 * The recipe the words alone ask for, when there is no designer to ask
 * ("a 1.6 m low bookcase with two doors, oak"): the size by the words
 * that name it, else by the kind of piece; the bays as few as keep a
 * shelf within its span; shelves by the height; doors and drawers by
 * count; the finish by name. Always a recipe that passes the rules.
 */
export const recipeFromWords = (text: string): DesignRecipe => {
  const t = text.toLowerCase();
  const kind = /book|shel/.test(t)
    ? "Bookcase"
    : /sideboard|credenza|buffet/.test(t)
      ? "Sideboard"
      : /tv|media/.test(t)
        ? "Media unit"
        : /wardrobe|closet/.test(t)
          ? "Wardrobe"
          : /bedside|night/.test(t)
            ? "Bedside"
            : "Cabinet";
  // low or tall as a kind of piece, not as a size's word ("75 cm tall")
  const plain = t.replace(
    new RegExp(`${UNIT}\\s*(?:${SIZE_WORDS.height.source})`, "gi"),
    " ",
  );
  const low = /\blow\b/.test(plain);
  const tall = /\btall\b|\bhigh\b/.test(plain);
  const typical: Record<string, [number, number, number]> = {
    Bookcase: [900, low ? 800 : tall ? 2000 : 1200, 320],
    Sideboard: [1600, 800, 420],
    "Media unit": [1800, 500, 420],
    Wardrobe: [1000, 2000, 580],
    Bedside: [450, 520, 400],
    Cabinet: [800, low ? 700 : 900, 400],
  };
  const [w0, h0, d0] = typical[kind]!;
  // a size by the word that names it; the width also by the first size
  // no word names
  const said = lengths(t);
  const sized = (k: keyof typeof SIZE_WORDS) =>
    said.find((l) => l.named === k)?.mm ??
    (k === "width" ? said.find((l) => !l.named)?.mm : undefined);
  const width = clamp(snap(sized("width") ?? w0, 10), DESIGN_RULES.width);
  const height = clamp(snap(sized("height") ?? h0, 10), DESIGN_RULES.height);
  const depth = clamp(snap(sized("depth") ?? d0, 10), DESIGN_RULES.depth);
  const span = DESIGN_RULES.span + PANEL_THICKNESS;
  let bays = clamp(
    count(t, /bays?/) ?? Math.ceil((width - PANEL_THICKNESS) / span),
    DESIGN_RULES.bays,
  );
  let doors = Math.min(bays, count(t, /doors?/) ?? (/door/.test(t) ? bays : 0));
  // a door leaf is no wider than its hinges hold: more, narrower bays
  while (
    doors > 0 &&
    bayWidth({ width, bays }) > DESIGN_RULES.leaf &&
    bays < DESIGN_RULES.bays[1]
  ) {
    bays += 1;
    doors = Math.min(bays, Math.max(doors, count(t, /doors?/) ?? bays));
  }
  const drawers = Math.min(
    bays - doors,
    count(t, /drawers?/) ?? (/drawer/.test(t) ? 1 : 0),
  );
  const inner = height - PLINTH_MM - 2 * PANEL_THICKNESS;
  const shelves = clamp(
    count(t, /shelf|shelves/) ?? Math.max(0, Math.floor(inner / 340) - 1),
    DESIGN_RULES.shelves,
  );
  const finish =
    DESIGN_FINISHES.find((f) => t.includes(f)) ??
    (/white|light|natural|birch/.test(t)
      ? "ash"
      : /black|dark/.test(t)
        ? "charcoal"
        : /green/.test(t)
          ? "sage"
          : "oak");
  const recipe: DesignRecipe = {
    name: low
      ? `Low ${kind.toLowerCase()}`
      : tall
        ? `Tall ${kind.toLowerCase()}`
        : kind,
    width,
    height,
    depth,
    bays,
    shelves,
    doors,
    drawers,
    plinth: !/no plinth|on legs|floating/.test(t),
    finish,
  };
  // too many shelves for the height: as many as leave room between
  while (
    checkRecipe(recipe).some((p) => p.field === "shelves") &&
    recipe.shelves > 0
  )
    recipe.shelves -= 1;
  return recipe;
};
