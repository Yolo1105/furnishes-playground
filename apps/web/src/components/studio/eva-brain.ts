import { hasWord } from "./text";
import {
  CATEGORY_NAMES,
  pieceTotals,
  sgd,
  type AssetCategory,
  type AssetNode,
} from "./assets-data";
import { products, type Product } from "./catalogue";
import { ARCHETYPES } from "./archetypes";
import {
  ASKS,
  BRAINSTORM,
  BUDGET,
  budgetChips,
  budgetLabel,
  FURNISH,
  FURNITURE,
  personaOf,
  PREF_REVIEW,
  PREFERENCE_BLOCKS,
  ROOM_REVIEW,
  ROOMS,
  snapBudget,
  STYLES,
  SWATCHES,
  type Changes,
  type Observation,
  type PersonaId,
  type PreferenceCategory,
  type ProposalCat,
} from "./eva-data";
import { tipFor } from "./design-tips";
import {
  FIT_FOR_ROOM,
  FIT_GUIDANCE,
  metres,
  ROOM_NAMES,
  type FlatType,
  type RoomId,
  type Rules,
} from "./room-data";

/**
 * What Eva does with a message until she is wired to think: she reads
 * the room, the pieces and the confirmed preferences, hears preferences
 * in what is said and proposes them, keeps to the order of the work
 * (the room's size before a layout, the budget before a shopping list,
 * the room before furniture), and picks pieces from the catalogue that
 * fit, each with why it fits. The room plan's readiness is read from
 * the same facts.
 */

/* ---------- what Eva knows ---------- */

type Preferences = Partial<
  Record<PreferenceCategory, { values: string[]; budget?: [number, number] }>
>;

/** a piece and where it stands: mm from the room's north-west corner,
    its box on the floor, its turn */
export type Standing = AssetNode & {
  at?: { x: number; y: number; w: number; d: number; rotation: number };
};

export type Context = {
  room: {
    id: RoomId;
    flat: string;
    width: number;
    depth: number;
    height: number;
    /** false until the walls are drawn or a template picked */
    sized: boolean;
  };
  /** the pieces and room items standing in the room, each where it
      stands when that is known */
  pieces: Standing[];
  cart: string[];
  /** what the planner flags about the room as it stands, in its words */
  findings: string[];
  prefs: Preferences;
  exploration: boolean;
  /** the planner's rules for the room */
  rules: Rules;
  /** which Eva is answering */
  persona: PersonaId;
};

/* ---------- the stages of the work ---------- */

export const STAGES = [
  { id: "intake", label: "Room" },
  { id: "preferences", label: "Preferences" },
  { id: "recommend", label: "Pieces" },
  { id: "refine", label: "Refine" },
  { id: "order", label: "Order" },
] as const;
type Stage = (typeof STAGES)[number]["id"];

/** what a room cannot do without, by category */
const CORE: Record<RoomId, AssetCategory[]> = {
  living: ["seating", "tables", "storage"],
  master: ["storage", "lighting"],
  "bedroom-1": ["storage", "lighting"],
  "bedroom-2": ["storage", "lighting"],
  kitchen: ["tables", "storage"],
  study: ["tables", "storage", "lighting"],
  bathroom: ["storage"],
};
const SECONDARY: AssetCategory[] = ["lighting", "decor"];

/** where a room's budget should go, by category, as the chatbot's bands
    have it (the bedroom's bed and the dining table are not Furnishes
    pieces, so their shares are named but not counted) */
type Band = {
  category: AssetCategory;
  label: string;
  lo: number;
  hi: number;
};
const BANDS: Record<RoomId, Band[]> = {
  living: [
    { category: "seating", label: "Seating", lo: 0.3, hi: 0.4 },
    { category: "tables", label: "Tables", lo: 0.1, hi: 0.15 },
    { category: "storage", label: "Storage and media", lo: 0.08, hi: 0.12 },
    { category: "lighting", label: "Lighting", lo: 0.08, hi: 0.1 },
    { category: "decor", label: "Rug and décor", lo: 0.08, hi: 0.12 },
  ],
  master: [
    { category: "storage", label: "Storage", lo: 0.15, hi: 0.2 },
    { category: "lighting", label: "Lighting", lo: 0.08, hi: 0.1 },
    { category: "decor", label: "Textiles and décor", lo: 0.08, hi: 0.12 },
  ],
  "bedroom-1": [
    { category: "storage", label: "Storage", lo: 0.15, hi: 0.2 },
    { category: "tables", label: "Desk", lo: 0.1, hi: 0.15 },
    { category: "lighting", label: "Lighting", lo: 0.08, hi: 0.1 },
  ],
  "bedroom-2": [
    { category: "storage", label: "Storage", lo: 0.15, hi: 0.2 },
    { category: "tables", label: "Desk", lo: 0.1, hi: 0.15 },
    { category: "lighting", label: "Lighting", lo: 0.08, hi: 0.1 },
  ],
  kitchen: [
    { category: "tables", label: "Table and trolley", lo: 0.35, hi: 0.45 },
    { category: "seating", label: "Seating", lo: 0.25, hi: 0.3 },
    { category: "storage", label: "Storage", lo: 0.1, hi: 0.15 },
    { category: "lighting", label: "Lighting", lo: 0.1, hi: 0.1 },
  ],
  study: [
    { category: "tables", label: "Desk", lo: 0.3, hi: 0.4 },
    { category: "storage", label: "Storage and shelving", lo: 0.2, hi: 0.25 },
    { category: "seating", label: "Seating", lo: 0.15, hi: 0.2 },
    { category: "lighting", label: "Lighting", lo: 0.1, hi: 0.1 },
  ],
  bathroom: [
    { category: "storage", label: "Storage", lo: 0.15, hi: 0.25 },
    { category: "decor", label: "Textiles and décor", lo: 0.08, hi: 0.12 },
  ],
};

/** the fit guidance lines for this room of this flat */
export const fitLines = (c: Context) => {
  const flat = c.room.flat as FlatType;
  const guide = FIT_GUIDANCE[flat];
  return guide ? FIT_FOR_ROOM[c.room.id].map((k) => guide[k]) : [];
};

/** the fit line a message calls for: a bed, a sofa, a dining table */
const fitNoteFor = (c: Context, text: string) => {
  const flat = c.room.flat as FlatType;
  const guide = FIT_GUIDANCE[flat];
  if (!guide) return null;
  const room = c.room.id;
  if (/\b(bed|mattress|king|queen)\b/i.test(text))
    return guide[room === "master" ? "master" : "common"];
  if (/\b(sofa|couch|sectional|l-shape|l shaped)\b/i.test(text))
    return guide.living;
  if (/\b(dining|table for|seater)\b/i.test(text)) return guide.dining;
  return null;
};

export const planOf = (c: Context) => {
  const have = new Set(c.pieces.map((n) => n.category));
  const core = CORE[c.room.id];
  const coreHave = core.filter((k) => have.has(k));
  const secondaryHave = SECONDARY.filter((k) => have.has(k));
  const t = pieceTotals(c.pieces);
  const budget = c.prefs.budget?.budget;
  const to = budget?.[1];
  const remaining = to === undefined ? undefined : to - t.total;
  const styled = (c.prefs.style?.values.length ?? 0) > 0;
  const coloured = (c.prefs.color?.values.length ?? 0) > 0;
  const score = Math.round(
    (coreHave.length / core.length) * 60 +
      (secondaryHave.length / SECONDARY.length) * 20 +
      (to !== undefined && remaining! >= 0 ? 10 : 0) +
      (styled ? 5 : 0) +
      (coloured ? 5 : 0),
  );
  const label =
    score >= 100
      ? "Ready to order"
      : score >= 75
        ? "Nearly ready"
        : score >= 40
          ? "Taking shape"
          : "Just started";
  const spent = new Map<AssetCategory, number>();
  for (const n of c.pieces)
    if (n.kind === "piece" && n.price !== undefined)
      spent.set(n.category, (spent.get(n.category) ?? 0) + n.price);
  const bands =
    to === undefined
      ? []
      : BANDS[c.room.id].map((b) => ({
          ...b,
          from: Math.round((to * b.lo) / 10) * 10,
          upTo: Math.round((to * b.hi) / 10) * 10,
          spent: spent.get(b.category) ?? 0,
        }));
  return {
    score,
    label,
    core,
    coreHave,
    missing: core.filter((k) => !have.has(k)),
    total: t.total,
    to,
    remaining,
    /** where the budget should go, with what has gone there */
    bands,
  };
};

export const stageOf = (c: Context): Stage => {
  if (!c.room.sized) return "intake";
  if (!c.prefs.style?.values.length || !c.prefs.budget?.budget)
    return "preferences";
  const p = planOf(c);
  if (p.coreHave.length * 2 < p.core.length) return "recommend";
  if (p.missing.length > 0 || c.cart.length === 0) return "refine";
  return "order";
};

/* ---------- hearing preferences ---------- */

type Proposal = {
  cat: ProposalCat;
  values: string[];
  budget?: [number, number];
};

/** "under S$1,500", "around S$3k", "S$2,000 to S$4,000" */
const hearBudget = (text: string): [number, number] | null => {
  const nums = [...text.matchAll(/s\$\s?([\d,.]+)\s?(k)?/gi)].map((m) => {
    const n = parseFloat(m[1]!.replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  });
  if (nums.length === 0) return null;
  if (nums.length >= 2)
    return [
      snapBudget(Math.min(nums[0]!, nums[1]!)),
      snapBudget(Math.max(nums[0]!, nums[1]!)),
    ];
  const n = nums[0]!;
  if (/\b(around|about|roughly|near)\b/i.test(text))
    return [snapBudget(n * 0.8), snapBudget(n * 1.2)];
  if (/\b(from|at least|over|above|more than)\b/i.test(text))
    return [snapBudget(n), BUDGET.max];
  return [BUDGET.min, snapBudget(n)];
};

/** the preferences a message carries that are not confirmed yet */
const hear = (text: string, prefs: Preferences): Proposal[] => {
  const out: Proposal[] = [];
  const pick = (cat: ProposalCat, options: readonly string[]) => {
    const kept = cat === "room" ? [] : (prefs[cat]?.values ?? []);
    const heard = options.filter((o) => hasWord(text, o) && !kept.includes(o));
    if (heard.length) out.push({ cat, values: heard });
  };
  pick("room", ROOMS);
  pick("style", STYLES);
  pick(
    "color",
    SWATCHES.map((s) => s.name),
  );
  pick("furniture", FURNITURE);
  const budget = hearBudget(text);
  if (budget) {
    const cur = prefs.budget?.budget;
    if (!cur || cur[0] !== budget[0] || cur[1] !== budget[1])
      out.push({
        cat: "budget",
        values: [budgetLabel(budget[0], budget[1])],
        budget,
      });
  }
  return out;
};

/* ---------- what is being asked ---------- */

type Intent = "layout" | "shopping" | "furniture" | "talk";

const FURNITURE_WORDS = [
  ...FURNITURE,
  ...products.map((p) => p.name),
  "sofa",
  "table",
  "shelf",
  "shelves",
  "cabinet",
  "bench",
  "cart",
  "lamp",
  "pieces",
  "piece",
];

const intentOf = (text: string): Intent => {
  if (
    /\b(plan|layout|lay out|arrange|place|where|fit|fits|along)\b/i.test(text)
  )
    return "layout";
  if (
    /\b(buy|order|shopping|shortlist|list|price|prices|cheap|cheaper|budget|cost|under|spend)\b/i.test(
      text,
    ) ||
    /s\$/i.test(text)
  )
    return "shopping";
  if (FURNITURE_WORDS.some((w) => hasWord(text, w))) return "furniture";
  return "talk";
};

/* ---------- picking pieces ---------- */

type Recommendation = {
  product: Product;
  why: string;
};

/** what a need asks of a piece, read from its recipe: what it does and
    what it is */
const NEEDS: Record<string, (p: Product) => boolean> = {
  Storage: (p) => p.category === "storage",
  Shelving: (p) =>
    p.recipe ? p.recipe.does.includes("display") : /shelf/i.test(p.name),
  Desk: (p) =>
    p.recipe ? p.recipe.does.includes("work") : /desk|cart/i.test(p.name),
  Seating: (p) => p.category === "seating",
  Divider: (p) =>
    p.recipe
      ? p.recipe.does.includes("divide")
      : /screen|divider/i.test(p.name),
  Wardrobe: (p) =>
    p.recipe
      ? p.recipe.does.includes("hang") && p.recipe.height >= 1200
      : /organiser|coat|wardrobe/i.test(p.name),
  Bedside: (p) => /bedside/i.test(p.name),
};

/** a piece that runs along a wall, so its length is a reason it fits:
    a recipe a bay or more wide, or a thing called so */
const ALONG_A_WALL = /sofa|sideboard|bookwall|wardrobe|desk|bench|shelv/i;
const alongAWall = (p: Product) =>
  p.recipe ? p.recipe.width >= 1200 : ALONG_A_WALL.test(p.name);
/** a piece that closes, for a style that asks for closed storage */
const CLOSED = /cabinet|sideboard|wardrobe|drawer|cupboard/i;
const closes = (p: Product) => (p.recipe ? p.recipe.door : CLOSED.test(p.name));

export const recommend = (
  c: Context,
  text: string,
  opts: { skip?: string[]; cheaper?: boolean } = {},
): Recommendation[] => {
  // what the room has, by name and by product: a second of a kind is
  // numbered ("Kitchen trolley 3"), its product the same
  const inRoom = new Set(
    c.pieces.flatMap((n) => (n.productId ? [n.name, n.productId] : [n.name])),
  );
  const needs = c.exploration ? [] : (c.prefs.furniture?.values ?? []);
  const asked = FURNITURE.filter((f) => hasWord(text, f));
  const wanted = asked.length ? asked : needs;
  const plan = planOf(c);
  const remaining = c.exploration ? undefined : plan.remaining;
  const long = Math.max(c.room.width, c.room.depth);
  let pool = products.filter(
    (p) =>
      p.category !== "components" &&
      !inRoom.has(p.name) &&
      !inRoom.has(p.id) &&
      !opts.skip?.includes(p.id),
  );
  if (wanted.length) {
    const fit = pool.filter((p) => wanted.some((w) => NEEDS[w]?.(p)));
    if (fit.length) pool = fit;
  } else if (plan.missing.length) {
    const fit = pool.filter((p) => plan.missing.includes(p.category));
    if (fit.length) pool = fit;
  }
  if (remaining !== undefined) {
    const within = pool.filter((p) => p.price <= remaining);
    if (within.length) pool = within;
  }
  if (opts.cheaper) pool = [...pool].sort((a, b) => a.price - b.price);
  return pool.slice(0, 3).map((product) => {
    const why: string[] = [];
    const need = wanted.find((w) => NEEDS[w]?.(product));
    if (need)
      why.push(
        asked.length
          ? `you asked for ${need.toLowerCase()}`
          : `you need ${need.toLowerCase()}`,
      );
    else if (plan.missing.includes(product.category))
      why.push(
        `the room has no ${CATEGORY_NAMES[product.category].toLowerCase()} yet`,
      );
    if (!c.exploration && c.prefs.style?.values.length)
      why.push(`in keeping with ${c.prefs.style.values.join(" and ")}`);
    if (remaining !== undefined)
      why.push(
        product.price <= remaining
          ? `${sgd(remaining - product.price)} of your budget would be left`
          : `${sgd(product.price - remaining)} over what is left of your budget`,
      );
    // the wall's length is a reason only for a piece that runs along it
    if (alongAWall(product)) why.push(`fits the ${metres(long)} wall`);
    const tip = c.prefs.style?.values.map((s) => tipFor(s)).find(Boolean);
    if (tip && closes(product) && /closed|hide/i.test(tip.do))
      why.push("closed storage, as the style asks");
    return { product, why: why.join(" · ") };
  });
};

/* ---------- the answer ---------- */

export type Chip = {
  label: string;
  /** what the chip says to Eva, or what it does instead */
  send?: string;
  act?: "room-tab" | "budget" | "more" | "cheaper";
  budget?: [number, number];
};

export type Reply = {
  text: string;
  proposals: Proposal[];
  cards: Recommendation[];
  chips: Chip[];
  /** what Eva would do to the room, when she was asked to do something */
  changes?: Changes;
  /** what Eva noticed, from Review this room */
  observations?: Observation[];
};

const roomLine = (c: Context) =>
  `${ROOM_NAMES[c.room.id]}, ${metres(c.room.width)} × ${metres(c.room.depth)}`;

/** the box's mode: Ask lets the words decide; the others say what is wanted */
export type ChatMode = "ask" | "furniture" | "layout";

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);
/** an answer long enough to offer shorter */
export const isLong = (text: string) => sentences(text).length > 3;
/** the first sentence or two of what was said, for "Make that shorter" */
export const shorter = (text: string) => {
  const parts = sentences(text);
  return parts.slice(0, parts.length > 3 ? 2 : 1).join(" ");
};

/** what Eva keeps to and what is still open, each open block a chip
    that asks her about it */
const review = (c: Context): Reply => {
  const kept = PREFERENCE_BLOCKS.filter((b) => c.prefs[b.id]).map((b) => {
    const p = c.prefs[b.id]!;
    return `${b.label.toLowerCase()} ${
      p.budget
        ? `${sgd(p.budget[0])} to ${sgd(p.budget[1])}`
        : p.values.join(", ")
    }`;
  });
  const open = PREFERENCE_BLOCKS.filter((b) => !c.prefs[b.id]);
  return {
    text: `${
      kept.length
        ? `I'm keeping to ${kept.join("; ")}.`
        : "Nothing is kept yet."
    } ${
      open.length
        ? `Still open: ${open.map((b) => b.label.toLowerCase()).join(", ")}. Ask me about one and we'll settle it.`
        : "Everything is settled; change any of it in the Preference tab."
    }`,
    proposals: [],
    cards: [],
    chips: open.map((b) => ({ label: b.label, send: ASKS[b.id] })),
  };
};

/** three directions for the room: the kept styles first, then others,
    each with what it asks for */
export const brainstorm = (c: Context): Reply => {
  const kept = c.prefs.style?.values ?? [];
  const picks = [...kept, ...STYLES.filter((s) => !kept.includes(s))]
    .filter((s) => tipFor(s))
    .slice(0, 3);
  const lines = picks.map((s) => `${s}: ${tipFor(s)!.do}`);
  return {
    text: `Three directions for the ${ROOM_NAMES[c.room.id]}. ${lines.join(" ")} Pick one and I'll keep to it.`,
    proposals: [],
    cards: [],
    chips: picks.map((s) => ({ label: `Go with ${s}`, send: `I like ${s}` })),
  };
};

/** the room's size before anything is placed */
const sizeGate = (proposals: Proposal[] = []): Reply => ({
  text: "Could you give me the room's size first? Draw its walls or pick a template in the Room tab, and I'll plan around the real walls.",
  proposals,
  cards: [],
  chips: [{ label: "Open the Room tab", act: "room-tab" }],
});

/** Furnish this room: what the room kind's archetype asks for that
    is not in the room yet, the catalogue piece that is it or a room
    item from a few words, and the By the book layout over it all */
const furnish = (c: Context): Reply => {
  if (!c.room.sized) return sizeGate();
  const a = ARCHETYPES[c.room.id];
  const names = c.pieces.map((n) => n.name);
  const adds: Changes["adds"] = [];
  const items: Changes["items"] = [];
  for (const rule of a.rules) {
    if (names.some((n) => rule.what.test(n))) continue;
    const product = products.find(
      (p) =>
        p.category !== "components" &&
        rule.what.test(p.name) &&
        !names.includes(p.name),
    );
    if (product) adds.push({ id: product.id, name: product.name });
    else if (rule.item)
      items.push({ words: rule.item, name: rule.item.replace(/^an? /i, "") });
  }
  const brought = [
    ...adds.map((x) => `the ${x.name.toLowerCase()}`),
    ...items.map((x) => x.words.toLowerCase()),
  ];
  const cost = adds.reduce(
    (t, x) => t + (products.find((p) => p.id === x.id)?.price ?? 0),
    0,
  );
  return {
    text: `${
      brought.length
        ? `For the ${roomLine(c)} I'd bring in ${brought.join(", ")}${cost ? ` (${sgd(cost)} of Furnishes pieces)` : ""}, and`
        : `The ${ROOM_NAMES[c.room.id]} has its anchors; I'd`
    } stand everything by the book: ${a.name.toLowerCase()}. Apply it and look; Undo takes it back.`,
    proposals: [],
    cards: [],
    chips: [
      { label: "Why this layout?", send: "Why lay the room out this way?" },
      { label: "Something cheaper", send: "Furnish it for less." },
    ],
    changes: { moves: [], removes: [], adds, items, layout: "book" },
  };
};

/** how far apart two standing pieces are, edge to edge, mm */
const apart = (
  a: NonNullable<Standing["at"]>,
  b: NonNullable<Standing["at"]>,
) =>
  Math.max(
    0,
    Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)),
    Math.max(a.y - (b.y + b.d), b.y - (a.y + a.d)),
  );
/** within this of a wall is on it, mm */
const ON_WALL = 150;

/** Review this room: three to five things about the room as it stands,
    read from the planner's findings, the archetype's rules, what is
    still missing and the budget */
const reviewRoom = (c: Context): Reply => {
  const out: Observation[] = [];
  const plan = planOf(c);
  if (!c.room.sized)
    out.push({
      title: "The walls first",
      body: "Nothing can be judged until the room has its size. Draw the walls or pick a template in the Room tab.",
    });
  else if (c.pieces.length === 0)
    out.push({
      title: "An empty room",
      body: `Nothing stands in the ${ROOM_NAMES[c.room.id]} yet. I can furnish it from the catalogue and lay it out by the book.`,
      act: { label: "Furnish this room", send: FURNISH },
    });
  for (const f of c.findings.slice(0, 2))
    out.push({ title: "The planner flags", body: f });
  // the archetype: the anchor on a wall, its flankers beside it
  const a = ARCHETYPES[c.room.id];
  const standing = c.pieces.filter((n) => n.at);
  const anchor = a.rules.find((r) => r.place === "longest-wall");
  const bed = anchor && standing.find((n) => anchor.what.test(n.name));
  if (anchor && bed?.at) {
    const t = bed.at;
    const onWall =
      t.x <= ON_WALL ||
      t.y <= ON_WALL ||
      t.x + t.w >= c.room.width - ON_WALL ||
      t.y + t.d >= c.room.depth - ON_WALL;
    if (!onWall)
      out.push({
        title: `The ${anchor.name} stands away from every wall`,
        body: `A ${anchor.name} usually sits with its back to the longest wall; the By the book layout puts it there.`,
        act: {
          label: "Lay it out by the book",
          send: "Lay the room out by the book.",
        },
      });
    const flank = a.rules.find(
      (r) => r.place === "flanking" && r.target === anchor.name,
    );
    const far = flank
      ? standing.filter((n) => flank.what.test(n.name) && apart(n.at!, t) > 300)
      : [];
    if (far.length)
      out.push({
        title: `The ${far[0]!.name.toLowerCase()} is far from the ${anchor.name}`,
        body: `A ${flank!.name} belongs within reach of the ${anchor.name}, touching it; it stands ${Math.round(apart(far[0]!.at!, t) / 100) / 10} m away.`,
        act: {
          label: "Lay it out by the book",
          send: "Lay the room out by the book.",
        },
      });
  }
  // what is still to decide, with the piece that would settle it
  for (const cat of plan.missing.slice(0, 2)) {
    const pick = products.find(
      (p) =>
        p.category === cat &&
        (plan.remaining === undefined || p.price <= plan.remaining),
    );
    out.push({
      title: `No ${CATEGORY_NAMES[cat].toLowerCase()} yet`,
      body: pick
        ? `${pick.name} at ${sgd(pick.price)} would settle it${plan.remaining !== undefined ? ` and leave ${sgd(plan.remaining - pick.price)} of the budget` : ""}.`
        : `Nothing in the catalogue fits what is left of the budget; the room may do without.`,
      ...(pick ? { pick } : {}),
    });
  }
  if (plan.to === undefined)
    out.push({
      title: "No budget yet",
      body: "With a range I can say where the money should go and keep the picks inside it.",
      act: { label: "Set a budget", send: ASKS.budget },
    });
  else if (plan.remaining! < 0)
    out.push({
      title: `${sgd(-plan.remaining!)} over budget`,
      body: `The Furnishes pieces come to ${sgd(plan.total)} against ${sgd(plan.to)}. I can swap the dearest for something cheaper.`,
      act: { label: "Furnish it for less", send: "Furnish it for less." },
    });
  const observations = out.slice(0, 5);
  return {
    text: observations.length
      ? `${observations.length === 1 ? "One thing" : `${observations.length} things`} I'd look at in the ${ROOM_NAMES[c.room.id]}.`
      : `The ${ROOM_NAMES[c.room.id]} is in good order: nothing flagged, nothing missing, inside the budget.`,
    proposals: [],
    cards: [],
    chips: [],
    observations,
  };
};

export const reply = (
  text: string,
  c: Context,
  mode: ChatMode = "ask",
): Reply => {
  if (text.trim() === BRAINSTORM) return brainstorm(c);
  if (text.trim() === PREF_REVIEW) return review(c);
  if (text.trim() === FURNISH) return furnish(c);
  if (text.trim() === ROOM_REVIEW) return reviewRoom(c);
  const proposals = hear(text, c.prefs);
  // the lens steers what is asked for, not small talk: a greeting gets
  // an answer, not a layout
  const smallTalk =
    text.trim().split(/\s+/).length <= 3 && intentOf(text) === "talk";
  const intent: Intent =
    mode === "furniture" && !smallTalk
      ? "furniture"
      : mode === "layout" && !smallTalk
        ? "layout"
        : intentOf(text);
  // what fits this flat comes first, when a bed, a sofa or a table is named
  const fit = fitNoteFor(c, text);
  const fitLead = fit ? `For a ${c.room.flat} flat: ${fit} ` : "";
  const plan = planOf(c);
  // a budget question with a budget kept: where the money should go
  if (
    plan.bands.length &&
    !FURNITURE.some((f) => hasWord(text, f)) &&
    /\b(budget|spend|split|allocate|where|go)\b/i.test(text)
  )
    return {
      text: `${fitLead}Of your ${sgd(plan.to!)} for the ${ROOM_NAMES[c.room.id]}, ${plan.bands
        .map((b) => `${b.label.toLowerCase()} ${sgd(b.from)} to ${sgd(b.upTo)}`)
        .join(
          ", ",
        )}. ${plan.total ? `So far ${sgd(plan.total)} is in the room.` : "Nothing is in the room yet."}`,
      proposals,
      cards: [],
      chips: [
        { label: "Pick the seating", send: "Suggest seating within my budget" },
        { label: "Pick the storage", send: "Suggest storage within my budget" },
      ],
    };
  // the gates: the room's size before a layout, the budget before a list
  if (intent === "layout" && !c.room.sized) return sizeGate(proposals);
  if (
    intent === "shopping" &&
    !c.prefs.budget?.budget &&
    !proposals.some((p) => p.cat === "budget")
  )
    return {
      text: "Before a list: what's your budget range for the pieces?",
      proposals,
      cards: [],
      chips: [
        ...budgetChips(),
        { label: "Flexible", act: "budget", budget: [BUDGET.min, BUDGET.max] },
      ],
    };
  if (intent !== "talk") {
    const cards = recommend(c, text);
    if (cards.length)
      return {
        text:
          fitLead +
          (intent === "layout"
            ? `For the ${roomLine(c)}, here is what I'd stand along the walls first.`
            : `For the ${roomLine(c)}, ${cards.length === 1 ? "one piece" : `${cards.length} pieces`} that fit.`),
        proposals,
        cards,
        chips: [
          { label: "More options", act: "more" },
          { label: "Cheaper", act: "cheaper" },
          {
            label: "Where should it go?",
            send: "Where should the first one go?",
          },
        ],
      };
  }
  // nothing to pick: say what is known and ask for the next thing
  const stage = stageOf(c);
  const next =
    stage === "intake"
      ? " Start with the room's walls in the Room tab, and I'll take it from there."
      : stage === "preferences"
        ? " Tell me the style you're after and a budget, and I'll pick pieces that fit."
        : stage === "order"
          ? " The room reads complete; the cart is ready when you are."
          : " Ask me for pieces, a layout or a list and I'll keep to what fits.";
  const t = pieceTotals(c.pieces);
  return {
    text: `${fitLead}I'm reading the ${roomLine(c)}, with ${t.pieces} Furnishes pieces at ${sgd(t.total)}.${next}`,
    proposals,
    cards: [],
    chips:
      stage === "preferences" && !c.prefs.style?.values.length
        ? STYLES.slice(0, 4).map((s) => ({ label: s, send: `I like ${s}` }))
        : // in her lean: the one thing this Eva would do next
          [personaOf(c.persona).chip],
  };
};
