import {
  CATEGORY_NAMES,
  pieceTotals,
  sgd,
  type AssetCategory,
  type AssetNode,
} from "./assets-data";
import { products, type Product } from "./catalogue";
import {
  BUDGET,
  FURNITURE,
  ROOMS,
  STYLES,
  SWATCHES,
  type PreferenceCategory,
} from "./eva-data";
import { metres, ROOM_NAMES, type RoomId } from "./room-data";

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

export type Preferences = Partial<
  Record<PreferenceCategory, { values: string[]; budget?: [number, number] }>
>;

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
  /** the pieces and room items standing in the room */
  pieces: AssetNode[];
  cart: string[];
  prefs: Preferences;
  exploration: boolean;
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
};
const SECONDARY: AssetCategory[] = ["lighting", "decor"];

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
  return {
    score,
    label,
    core,
    coreHave,
    missing: core.filter((k) => !have.has(k)),
    total: t.total,
    to,
    remaining,
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
  cat: PreferenceCategory;
  values: string[];
  budget?: [number, number];
};

const has = (text: string, word: string) =>
  new RegExp(
    `\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
    "i",
  ).test(text);

const snapBudget = (n: number) =>
  Math.min(
    BUDGET.max,
    Math.max(BUDGET.min, Math.round(n / BUDGET.step) * BUDGET.step),
  );

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
export const hear = (text: string, prefs: Preferences): Proposal[] => {
  const out: Proposal[] = [];
  const pick = (cat: PreferenceCategory, options: readonly string[]) => {
    const heard = options.filter(
      (o) => has(text, o) && !prefs[cat]?.values.includes(o),
    );
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
        values: [`${sgd(budget[0])} – ${sgd(budget[1])}`],
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
  if (FURNITURE_WORDS.some((w) => has(text, w))) return "furniture";
  return "talk";
};

/* ---------- picking pieces ---------- */

type Recommendation = {
  product: Product;
  why: string;
};

const NEEDS: Record<string, (p: Product) => boolean> = {
  Storage: (p) => p.category === "storage",
  Shelving: (p) => /bookwall|shelf|sideboard/i.test(p.name),
  Desk: (p) => /desk|cart/i.test(p.name),
  Seating: (p) => p.category === "seating",
  Divider: (p) => /screen|divider/i.test(p.name),
  Wardrobe: (p) => /organiser|coat/i.test(p.name),
  Bedside: (p) => /bedside/i.test(p.name),
};

export const recommend = (
  c: Context,
  text: string,
  opts: { skip?: string[]; cheaper?: boolean } = {},
): Recommendation[] => {
  const inRoom = new Set(c.pieces.map((n) => n.name));
  const needs = c.exploration ? [] : (c.prefs.furniture?.values ?? []);
  const asked = FURNITURE.filter((f) => has(text, f));
  const wanted = asked.length ? asked : needs;
  const plan = planOf(c);
  const remaining = c.exploration ? undefined : plan.remaining;
  const long = Math.max(c.room.width, c.room.depth);
  let pool = products.filter(
    (p) =>
      p.category !== "components" &&
      !inRoom.has(p.name) &&
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
    why.push(`fits the ${metres(long)} wall`);
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
};

const roomLine = (c: Context) =>
  `${ROOM_NAMES[c.room.id]}, ${metres(c.room.width)} × ${metres(c.room.depth)}`;

export const reply = (text: string, c: Context): Reply => {
  const proposals = hear(text, c.prefs);
  const intent = intentOf(text);
  const stance = c.exploration
    ? " Exploration is on, so I'm ranging wide rather than keeping to your preferences."
    : "";
  // the gates: the room's size before a layout, the budget before a list,
  // the room before furniture
  if (intent === "layout" && !c.room.sized)
    return {
      text: "Could you give me the room's size first? Draw its walls or pick a template in the Room tab, and I'll plan around the real walls.",
      proposals,
      cards: [],
      chips: [{ label: "Open the Room tab", act: "room-tab" }],
    };
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
        ...[1500, 3000, 5000].map((n): Chip => ({
          label: `Under ${sgd(n)}`,
          act: "budget",
          budget: [BUDGET.min, n],
        })),
        { label: "Flexible", act: "budget", budget: [BUDGET.min, BUDGET.max] },
      ],
    };
  if (
    intent === "furniture" &&
    !c.prefs.room?.values.length &&
    !proposals.some((p) => p.cat === "room")
  )
    return {
      text: "Which room is this for? Then I'll pick what fits it.",
      proposals,
      cards: [],
      chips: ROOMS.slice(0, 4).map((r) => ({
        label: r,
        send: `It's for the ${r.toLowerCase()}`,
      })),
    };
  if (intent !== "talk") {
    const cards = recommend(c, text);
    if (cards.length)
      return {
        text:
          intent === "layout"
            ? `For the ${roomLine(c)}, here is what I'd stand along the walls first.${stance}`
            : `For the ${roomLine(c)}, ${cards.length === 1 ? "one piece" : `${cards.length} pieces`} that fit.${stance}`,
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
    text: `I'm reading the ${roomLine(c)}, with ${t.pieces} Furnishes pieces at ${sgd(t.total)}.${stance}${next}`,
    proposals,
    cards: [],
    chips:
      stage === "preferences" && !c.prefs.style?.values.length
        ? STYLES.slice(0, 4).map((s) => ({ label: s, send: `I like ${s}` }))
        : [],
  };
};

/** the four rooms to start from, as the chatbot offers them */
export const STARTERS = ["Living room", "Bedroom", "Study", "Kitchen"] as const;
