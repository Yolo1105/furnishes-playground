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
  | "room"
  | "budget"
  | "style"
  | "color"
  | "furniture";

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

/** budget slider: S$, in steps */
export const BUDGET = { min: 500, max: 10000, step: 250 } as const;
