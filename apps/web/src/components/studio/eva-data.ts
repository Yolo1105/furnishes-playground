import type { Product } from "./catalogue";
import type { ChatMode, Chip } from "./eva-brain";
import type { RoomId } from "./room-data";

/**
 * What Eva's History and Preference tabs show: the shape of a
 * conversation and a message, and the preference catalogue, the four
 * blocks of the playground's design (budget, style, colour, furniture),
 * each with the choices Eva can hear or the visitor can pick. The room
 * itself is the Room tab's: Eva hears a room as a proposal to change it.
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
  at: number;
  /** preferences Eva heard, to accept or set aside; each is settled once */
  proposals?: {
    cat: ProposalCat;
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
/** the first minute of today, by the clock here */
const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** "Today", "Yesterday", then the date, by the calendar days here */
export function dayLabel(at: number, ref = Date.now()) {
  const d = Math.round((dayStart(ref) - dayStart(at)) / (24 * h));
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

/* ---------- preferences: the four blocks ---------- */

export type PreferenceCategory = "budget" | "style" | "color" | "furniture";
/** what Eva can hear and propose: a preference, or the room itself,
    which goes to the Room tab when kept */
export type ProposalCat = PreferenceCategory | "room";
/** how a proposal is headed */
export const proposalLabel = (cat: ProposalCat) =>
  cat === "room" ? "Room" : PREFERENCE_BLOCKS.find((b) => b.id === cat)!.label;

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
    id: "budget",
    index: "01",
    label: "Budget range",
    hint: "What the pieces may come to",
    multi: false,
  },
  {
    id: "style",
    index: "02",
    label: "Design style",
    hint: "How it should feel",
    multi: true,
  },
  {
    id: "color",
    index: "03",
    label: "Colour preferences",
    hint: "What you lean towards",
    multi: true,
  },
  {
    id: "furniture",
    index: "04",
    label: "Furniture needs",
    hint: "What has to be in it",
    multi: true,
  },
];

/** the rooms Eva can hear, each the studio's own room kind: a kept
    room proposal sets the active room to it */
export const ROOM_KIND = {
  "Living room": "living",
  Bedroom: "master",
  "Children's room": "bedroom-1",
  Study: "study",
  Kitchen: "kitchen",
} as const satisfies Record<string, RoomId>;
export const ROOMS = Object.keys(ROOM_KIND) as (keyof typeof ROOM_KIND)[];

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
  /** how the box asks when this Eva answers: the words decide, pieces
      are picked, or the room is laid out */
  mode: ChatMode;
  /** what she leads with, under her name in the chooser */
  leads: string;
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
    mode: "ask",
    leads: "Chat: the words decide what she does",
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
    mode: "furniture",
    leads: "Picks pieces from the catalogue",
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
    mode: "layout",
    leads: "Lays the pieces out in the room",
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
    mode: "ask",
    leads: "Weighs tradeoffs and priorities",
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

/** how to ask Eva about a preference still open, under her review of
    what is kept */
export const ASKS: Record<PreferenceCategory, string> = {
  budget:
    "Help me set a realistic budget for this project: an overall cap, and what to save on and what to splurge on.",
  style:
    "Help me name a clear design style for this project — references, mood, and what to avoid.",
  color:
    "Help me build a colour palette for this room — base, accent, and materials that carry it.",
  furniture:
    "Help me list the furniture this room actually needs, prioritised from must-have to nice-to-have.",
};
/** what Review my preferences asks: Eva says what she keeps to and what
    is still open */
export const PREF_REVIEW = "Review my preferences";

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

/** the chip under a long answer: the same, shorter */
export const SHORTER: Chip = { label: "Shorter", send: "Make that shorter." };
/** what Brainstorm for me asks */
export const BRAINSTORM = "Brainstorm a direction for this room with me.";
