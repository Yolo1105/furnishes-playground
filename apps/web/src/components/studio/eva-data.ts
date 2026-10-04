import type { Product } from "./catalogue";
import type { Chip } from "./eva-brain";

/**
 * What Eva's History and Preference tabs show. Placeholder conversations
 * until the chat is wired; the preference catalogue is the five blocks of
 * the playground's design (room, budget, style, colour, furniture), each
 * with the choices Eva can hear or the visitor can pick.
 */

export type Conversation = {
  id: string;
  title: string;
  /** the last thing said, trimmed */
  snippet: string;
  /** epoch ms */
  at: number;
  turns: number;
};

export type Message = {
  id: string;
  who: "you" | "eva";
  text: string;
  /** the name of a picture sent along, if any */
  image?: string;
  at: number;
  /** preferences Eva heard, to accept or set aside; each is settled once */
  proposals?: {
    cat: PreferenceCategory;
    values: string[];
    budget?: [number, number];
    settled?: "accepted" | "dismissed";
  }[];
  /** pieces Eva picked, with why each fits */
  cards?: { product: Product; why: string }[];
  /** what can be said or done next */
  chips?: Chip[];
  /** whether a model answered, or the studio's own rules */
  source?: "model" | "rules";
  /** a thumb up or down on one of Eva's answers */
  rating?: "up" | "down";
  /** kept with the project, listed above the thread */
  pinned?: boolean;
};

/** what Eva can be asked first; each goes into the input box */
export const PROMPTS = [
  "Plan this room around the sofa and the window",
  "Suggest storage for this wall under S$1,500",
  "What fits along a 3 m wall?",
  "Match the pieces to my wall tone",
] as const;

const h = 60 * 60 * 1000;
const now = Date.now();

export const conversations: Conversation[] = [
  {
    id: "c-1",
    title: "Reading nook by the window",
    snippet:
      "…a low bookwall under the sill, the armchair turned to the light.",
    at: now - 2 * h,
    turns: 14,
  },
  {
    id: "c-2",
    title: "Entry storage for two",
    snippet: "Shoes below, a tray for keys, hooks at hand height.",
    at: now - 7 * h,
    turns: 6,
  },
  {
    id: "c-3",
    title: "Dividing the living room",
    snippet: "Two segments, four tiers: a room inside the room.",
    at: now - 30 * h,
    turns: 22,
  },
  {
    id: "c-4",
    title: "Work cart under the desk",
    snippet: "The printer and the paper, rolled away when you are done.",
    at: now - 4 * 24 * h,
    turns: 9,
  },
  {
    id: "c-5",
    title: "First look at the flat",
    snippet: "4-room HDB, north-facing, two of us and a cat.",
    at: now - 12 * 24 * h,
    turns: 31,
  },
];

/** "Today", "Yesterday", then the date */
export function dayLabel(at: number, ref = Date.now()) {
  const day = (t: number) => Math.floor(t / (24 * h));
  const d = day(ref) - day(at);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return new Date(at).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
  });
}

export function timeLabel(at: number) {
  return new Date(at).toLocaleTimeString("en-SG", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------- preferences: the five blocks ---------- */

export type PreferenceCategory =
  "room" | "budget" | "style" | "color" | "furniture";

type Swatch = { id: string; name: string; hex: string };

export const PREFERENCE_BLOCKS: {
  id: PreferenceCategory;
  index: string;
  label: string;
  hint: string;
  /** one value or several */
  multi: boolean;
}[] = [
  {
    id: "room",
    index: "01",
    label: "Room type",
    hint: "Where this is for",
    multi: false,
  },
  {
    id: "budget",
    index: "02",
    label: "Budget range",
    hint: "What the pieces may come to",
    multi: false,
  },
  {
    id: "style",
    index: "03",
    label: "Design style",
    hint: "How it should feel",
    multi: true,
  },
  {
    id: "color",
    index: "04",
    label: "Colour preferences",
    hint: "What you lean towards",
    multi: true,
  },
  {
    id: "furniture",
    index: "05",
    label: "Furniture needs",
    hint: "What has to be in it",
    multi: true,
  },
];

export const ROOMS = [
  "Living room",
  "Bedroom",
  "Study",
  "Kitchen",
  "Children's room",
  "Hallway",
] as const;

export const STYLES = [
  "Scandinavian",
  "Japandi",
  "Mid-century",
  "Minimalist",
  "Industrial",
  "Coastal",
  "Peranakan",
] as const;

export const SWATCHES: Swatch[] = [
  { id: "warm-neutral", name: "Warm neutrals", hex: "#e9dccb" },
  { id: "birch", name: "Birch", hex: "#dcbd8f" },
  { id: "walnut", name: "Walnut", hex: "#6e4a2f" },
  { id: "white", name: "Soft white", hex: "#f6f1ea" },
  { id: "grey", name: "Cool grey", hex: "#b9bcc2" },
  { id: "sage", name: "Sage", hex: "#a9b59a" },
  { id: "terracotta", name: "Terracotta", hex: "#c8734f" },
  { id: "navy", name: "Navy", hex: "#2f3f5c" },
];

export const FURNITURE = [
  "Storage",
  "Shelving",
  "Desk",
  "Seating",
  "Divider",
  "Wardrobe",
  "Bedside",
] as const;

/** the fixed options of each block that takes chips */
export const CUSTOM_OPTIONS: Partial<
  Record<PreferenceCategory, readonly string[]>
> = {
  room: ROOMS,
  style: STYLES,
  color: SWATCHES.map((s) => s.name),
  furniture: FURNITURE,
};

/** budget slider: S$, in steps */
export const BUDGET = { min: 500, max: 10000, step: 250 } as const;
/** a sum kept to the budget's steps and range */
export const snapBudget = (n: number) =>
  Math.min(
    BUDGET.max,
    Math.max(BUDGET.min, Math.round(n / BUDGET.step) * BUDGET.step),
  );

/* ---------- who Eva is this turn ---------- */

/** The chatbot's four Evas: the same assistant leaning one way. Each
    has what the chatbot told the model about her, verbatim. */
export type PersonaId = "eva" | "style" | "plan" | "budget";
type Persona = {
  id: PersonaId;
  name: string;
  tagline: string;
  description: string;
  replyStyle: string;
  rules: string[];
  suggestionStyle: string;
  traits: string[];
  /** what the rules offer first under a plain answer, in her lean */
  chip: Chip;
};
export const PERSONAS: Persona[] = [
  {
    id: "eva",
    name: "Eva",
    tagline: "Balanced design partner",
    description:
      "Your default Furnishes guide—warm, structured, and even across aesthetics, layout, and budget.",
    replyStyle:
      "Use a friendly, professional tone. Structure answers as: (1) brief read of what matters most to them, (2) 2–3 concrete options or considerations, (3) one focused follow-up question. Keep paragraphs short; use bullets when comparing tradeoffs.",
    rules: [
      "Balance style, spatial practicality, and budget—call out when one must give way.",
      "Prefer specific, room-aware suggestions over generic decor tips.",
      "Surface assumptions explicitly and invite correction.",
    ],
    suggestionStyle:
      "Offer one open follow-up that deepens context (room use, constraints, or taste) and optionally one narrower alternative.",
    traits: ["Balanced", "Structured", "Supportive"],
    chip: { label: "What would you pick?", send: "What would you pick?" },
  },
  {
    id: "style",
    name: "Eva · Style",
    tagline: "Aesthetic & cohesion first",
    description:
      "Prioritizes palette, materials, mood, and visual harmony—how the room feels and reads as a whole.",
    replyStyle:
      "Lead with sensory and visual language (light, material, proportion). Structure: mood/palette anchor → 2 cohesive directions → how to test them (swatches, inspo refs). Tone: warm curator; avoid dry checklists.",
    rules: [
      "Start from palette + material cohesion before furniture SKUs.",
      "Name tradeoffs in aesthetics explicitly (e.g., warm minimal vs. coastal brightness).",
      "Tie recommendations back to a single ‘through-line’ phrase the user can reuse.",
    ],
    suggestionStyle:
      "Follow-ups should probe mood words, reference spaces, and material likes/dislikes—not square footage first.",
    traits: ["Palette-focused", "Mood-driven", "Cohesive"],
    chip: {
      label: "Build a palette",
      send: "Build a colour palette for this room",
    },
  },
  {
    id: "plan",
    name: "Eva · Plan",
    tagline: "Layout, flow & fit",
    description:
      "Emphasizes circulation, furniture scale, zones, and real-world constraints so the room works day to day.",
    replyStyle:
      "Use a practical planner voice. Structure: constraints recap → layout principle → 2 layout options with why → what to measure next. Prefer diagrams-in-words (e.g., ‘sofa on long wall, 900 mm passage to the door’).",
    rules: [
      "Ask for or infer dimensions early when layout is in play.",
      "Prioritize circulation and door/window clearance over aesthetics when they conflict; say so plainly.",
      "Give relative scale cues (e.g., rug relative to seating group) not only style adjectives.",
    ],
    suggestionStyle:
      "Follow-ups should request measurements, traffic patterns, or fixed elements—not color preferences first.",
    traits: ["Spatial", "Practical", "Measurement-aware"],
    chip: { label: "Lay the room out", send: "Lay this room out for me" },
  },
  {
    id: "budget",
    name: "Eva · Budget",
    tagline: "Tradeoffs & priorities",
    description:
      "Centers spend discipline: where to splurge, where to save, and sequencing purchases for maximum impact.",
    replyStyle:
      "Tone: calm advisor. Structure: confirm budget posture → name 2–3 priority tiers → suggest phasing → one question to calibrate pain points. Use ranges and ‘if/then’ when the user gives numbers.",
    rules: [
      "Surface tradeoffs in dollars or relative impact, not only style.",
      "Recommend sequencing (anchors first, accessories later) when funds are tight.",
      "Flag hidden costs (delivery, install, textiles) when relevant.",
    ],
    suggestionStyle:
      "Follow-ups should clarify total envelope, flexibility, and which categories are non-negotiable.",
    traits: ["Tradeoff-savvy", "Phased", "Impact-focused"],
    chip: {
      label: "Where should the budget go?",
      send: "Where should the budget go?",
    },
  },
];
export const personaOf = (id: PersonaId) =>
  PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]!;

/* ---------- what might be said next ---------- */

/** the chatbot's Insights: for a kept preference, how to have Eva
    review it; for one still open, how to ask her */
export const INSIGHTS: Record<
  PreferenceCategory,
  { openHint: string; ask: string; review: (value: string) => string }
> = {
  room: {
    openHint: "Which space are we designing?",
    ask: "Help me choose which room to design first, and what matters most about that space.",
    review: (v) =>
      `Review my room direction (${v}). Flag anything important we're still missing.`,
  },
  budget: {
    openHint: "No spend range yet",
    ask: "Help me set a realistic budget for this project — overall cap and where to save vs splurge.",
    review: (v) =>
      `Review my budget (${v}). Does it fit the room and furniture needs we've discussed?`,
  },
  style: {
    openHint: "Look and mood still open",
    ask: "Help me name a clear design style for this project — references, mood, and what to avoid.",
    review: (v) =>
      `Review my style direction (${v}). Keep what's strong and tighten anything vague.`,
  },
  color: {
    openHint: "No colours locked yet",
    ask: "Help me build a colour palette for this room — base, accent, and materials that carry it.",
    review: (v) =>
      `Review my palette (${v}). Suggest refinements that stay cohesive with the style.`,
  },
  furniture: {
    openHint: "Needs list is empty",
    ask: "Help me list the furniture this room actually needs, prioritised from must-have to nice-to-have.",
    review: (v) =>
      `Review my furniture needs (${v}). What's essential, and what can wait?`,
  },
};

/** the chatbot's follow-ups, read from what Eva just said */
export const followupsFor = (text: string): string[] => {
  const t = text.toLowerCase();
  if (/sofa/.test(t)) return ["Compare two sofas", "Rug pairing"];
  if (/light/.test(t))
    return ["Dim to warm bulbs?", "Mark positions on my plan"];
  if (/budget|\$|spend/.test(t))
    return ["Filter the shortlist to my budget", "Where to save vs splurge?"];
  if (/rug/.test(t))
    return ["Show flatweave options", "What size for a 3 seat sofa?"];
  if (/palette|neutral|warm/.test(t))
    return ["Build a 5 colour palette", "Add one bold accent"];
  return ["Tell me more", "What would you pick?"];
};

/** the ways to refine Eva's latest answer */
export const REFINES = [
  { label: "Shorter", send: "Make that shorter." },
  { label: "More options", send: "Give me two more options." },
  { label: "Cheaper", send: "What's a cheaper alternative?" },
] as const;
/** what Brainstorm for me asks */
export const BRAINSTORM = "Brainstorm a direction for this room with me.";
