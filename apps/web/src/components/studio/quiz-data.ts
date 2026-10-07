import { BUDGET, ROOMS, snapBudget } from "./eva-data";

/**
 * The three short quizzes, ported from the chatbot's: style (five
 * profiles), budget (a range from how the room will be furnished), room
 * (who it is for and what it needs). The theatre of the originals (a
 * colour per question, giant type) stays behind; the questions, options
 * and scoring come across. Each answer is a set of option ids.
 */
/** the five tones the palettes are mixed from */
const SAND = "#DDD5C4";
const OAK = "#B09470";
const SAGE = "#8A9E9A";
const OLIVE = "#6B7355";
const RUST = "#B33D0E";

export type Flow = "style" | "budget" | "room";
export type StyleKey =
  "minimal" | "maximalist" | "organic" | "industrial" | "artisan";

type Option = {
  id: string;
  label: string;
  sublabel?: string;
  style?: StyleKey;
};
type Question = {
  id: string;
  question: string;
  subtext?: string;
  /** how many to pick; one means a single choice that moves on by itself */
  min: number;
  max: number;
  options: Option[];
};

export const FLOW_NAMES: Record<Flow, string> = {
  style: "Style quiz",
  budget: "Budget quiz",
  room: "Room quiz",
};

export const STYLE_QUIZ: Question[] = [
  {
    id: "s1",
    question: "First feeling",
    subtext: "Pick two or three spaces that instantly feel right.",
    min: 2,
    max: 3,
    options: [
      { id: "s1a", label: "Cosy nook", style: "organic" },
      { id: "s1b", label: "Open loft", style: "industrial" },
      { id: "s1c", label: "Minimal studio", style: "minimal" },
      { id: "s1d", label: "Warm library", style: "maximalist" },
      { id: "s1e", label: "Sunny balcony", style: "organic" },
      { id: "s1f", label: "Serene bedroom", style: "minimal" },
    ],
  },
  {
    id: "s2",
    question: "Mood words",
    subtext: "Pick three to five words for how home should feel.",
    min: 3,
    max: 5,
    options: [
      { id: "s2-calm", label: "Calm", style: "minimal" },
      { id: "s2-cozy", label: "Cosy", style: "organic" },
      { id: "s2-airy", label: "Airy", style: "minimal" },
      { id: "s2-grounded", label: "Grounded", style: "industrial" },
      { id: "s2-warm", label: "Warm", style: "organic" },
      { id: "s2-layered", label: "Layered", style: "maximalist" },
      { id: "s2-moody", label: "Moody", style: "industrial" },
      { id: "s2-playful", label: "Playful", style: "maximalist" },
      { id: "s2-natural", label: "Natural", style: "organic" },
      { id: "s2-refined", label: "Refined", style: "artisan" },
      { id: "s2-textured", label: "Textured", style: "artisan" },
      { id: "s2-clean", label: "Clean", style: "minimal" },
    ],
  },
  {
    id: "s3",
    question: "Your morning scene",
    subtext: "Which space are you waking up in?",
    min: 1,
    max: 1,
    options: [
      {
        id: "s3a",
        label: "The light bath",
        sublabel:
          "Soft light through linen, white walls, natural wood, silence.",
        style: "minimal",
      },
      {
        id: "s3b",
        label: "The warm embrace",
        sublabel: "Rich textures, warm colours, books, candles, a soft throw.",
        style: "maximalist",
      },
      {
        id: "s3c",
        label: "The green retreat",
        sublabel: "Plants everywhere, fresh air, life growing around you.",
        style: "organic",
      },
      {
        id: "s3d",
        label: "The quiet study",
        sublabel: "Dark wood, leather, brass; serious and grounding.",
        style: "industrial",
      },
    ],
  },
  {
    id: "s6",
    question: "Texture touch",
    subtext: "Pick three materials you want to live with.",
    min: 3,
    max: 3,
    options: [
      { id: "s6-lw", label: "Light wood", style: "minimal" },
      { id: "s6-dw", label: "Dark wood", style: "industrial" },
      { id: "s6-mb", label: "Marble", style: "minimal" },
      { id: "s6-co", label: "Concrete", style: "industrial" },
      { id: "s6-li", label: "Linen", style: "organic" },
      { id: "s6-ve", label: "Velvet", style: "maximalist" },
      { id: "s6-le", label: "Leather", style: "industrial" },
      { id: "s6-ra", label: "Rattan", style: "organic" },
      { id: "s6-br", label: "Brass", style: "artisan" },
      { id: "s6-bo", label: "Bouclé", style: "organic" },
    ],
  },
  {
    id: "s12",
    question: "Dream room",
    subtext: "One space. The one.",
    min: 1,
    max: 1,
    options: [
      {
        id: "s12a",
        label: "Warm minimalist",
        sublabel: "Clean lines, natural materials, sunlight",
        style: "minimal",
      },
      {
        id: "s12b",
        label: "Cosy collected",
        sublabel: "Layered textures, books, warm lighting",
        style: "maximalist",
      },
      {
        id: "s12c",
        label: "Light and airy",
        sublabel: "Whites, plants, breathing room",
        style: "organic",
      },
      {
        id: "s12d",
        label: "Bold character",
        sublabel: "Dark accents, statement furniture, drama",
        style: "industrial",
      },
    ],
  },
];

/** the five profiles, as the chatbot names them, with what each means
    in the studio's own chips and swatches */
export const STYLE_PROFILES: Record<
  StyleKey,
  {
    name: string;
    tagline: string;
    description: string;
    palette: string[];
    styles: string[];
    colours: string[];
  }
> = {
  minimal: {
    name: "The Quietist",
    tagline: "Less is a decision, not a default.",
    description:
      "A room should breathe. Every object earns its place; the edit is the art.",
    palette: [SAND, OAK, SAGE],
    styles: ["Minimalist", "Japandi"],
    colours: ["Soft white", "Warm neutrals"],
  },
  maximalist: {
    name: "The Collector",
    tagline: "A room should tell the whole story.",
    description:
      "Texture, memory and colour layered until a room becomes a world.",
    palette: [RUST, OAK, SAND],
    styles: ["Peranakan", "Mid-century"],
    colours: ["Terracotta", "Navy"],
  },
  organic: {
    name: "The Naturalist",
    tagline: "Living things are the best furniture.",
    description:
      "Raw clay, rough linen, trailing green, warm light through leaves.",
    palette: [OLIVE, OAK, SAND],
    styles: ["Japandi", "Scandinavian"],
    colours: ["Sage", "Birch"],
  },
  industrial: {
    name: "The Structuralist",
    tagline: "Honest material. Honest form.",
    description:
      "Exposed structure is the design: steel, wood, concrete, seen holding the room up.",
    palette: [OLIVE, SAGE, OAK],
    styles: ["Industrial"],
    colours: ["Cool grey", "Walnut"],
  },
  artisan: {
    name: "The Maker",
    tagline: "The hand is always visible.",
    description:
      "Craft is evidence, not ornament: every object carries the mark of its making.",
    palette: [OAK, OLIVE, SAND],
    styles: ["Mid-century", "Coastal"],
    colours: ["Walnut", "Warm neutrals"],
  },
};

const BUDGET_QUIZ: Question[] = [
  {
    id: "b1",
    question: "Your budget",
    subtext: "How would you like to approach it?",
    min: 1,
    max: 1,
    options: [
      { id: "hard", label: "A hard cap" },
      { id: "flexible", label: "Flexible", sublabel: "Can stretch 10 to 15%" },
      {
        id: "explore",
        label: "Explore first",
        sublabel: "At different price points",
      },
    ],
  },
  {
    id: "b2a",
    question: "Room type",
    subtext: "What room are we furnishing?",
    min: 1,
    max: 1,
    options: [
      { id: "b2a-lr", label: "Living room" },
      { id: "b2a-br", label: "Bedroom" },
      { id: "b2a-ho", label: "Home office" },
      { id: "b2a-dr", label: "Dining room" },
      { id: "b2a-st", label: "Studio" },
    ],
  },
  {
    id: "b2b",
    question: "Room size",
    subtext: "Roughly how big is the space?",
    min: 1,
    max: 1,
    options: [
      { id: "b2b-sm", label: "Cosy", sublabel: "Under 18 m²" },
      { id: "b2b-md", label: "Medium", sublabel: "18 to 37 m²" },
      { id: "b2b-lg", label: "Spacious", sublabel: "Over 37 m²" },
    ],
  },
  {
    id: "b2c",
    question: "Starting point",
    subtext: "Where are you starting from?",
    min: 1,
    max: 1,
    options: [
      { id: "b2c-em", label: "An empty room" },
      { id: "b2c-so", label: "Have some pieces" },
      { id: "b2c-fw", label: "Just a few items to add" },
    ],
  },
  {
    id: "b2d",
    question: "How long",
    subtext: "How long do you plan to keep this room as it is?",
    min: 1,
    max: 1,
    options: [
      { id: "b2d-sh", label: "1 to 2 years" },
      { id: "b2d-md", label: "3 to 5 years" },
      { id: "b2d-lg", label: "5 years or more" },
    ],
  },
  {
    id: "b2e",
    question: "Quality tier",
    subtext: "What level are you aiming for?",
    min: 1,
    max: 1,
    options: [
      { id: "b2e-bud", label: "Budget friendly" },
      { id: "b2e-mid", label: "Mid range" },
      { id: "b2e-hi", label: "Investment pieces" },
    ],
  },
  {
    id: "b2f",
    question: "Shopping style",
    subtext: "How do you like to buy?",
    min: 1,
    max: 1,
    options: [
      { id: "b2f-hunt", label: "Hunt for deals" },
      { id: "b2f-bal", label: "Balanced" },
      { id: "b2f-conv", label: "Convenience first" },
    ],
  },
];

/** the chatbot's budget formula, its bases brought to Furnishes pieces in S$ */
const ROOM_BASE: Record<string, [number, number]> = {
  "b2a-lr": [2000, 6000],
  "b2a-br": [1200, 4000],
  "b2a-ho": [800, 3200],
  "b2a-dr": [1200, 4800],
  "b2a-st": [1600, 4800],
};
const MULT: Record<string, number> = {
  "b2b-sm": 0.7,
  "b2b-md": 1,
  "b2b-lg": 1.4,
  "b2c-em": 1.2,
  "b2c-so": 1,
  "b2c-fw": 0.5,
  "b2d-sh": 0.6,
  "b2d-md": 1,
  "b2d-lg": 1.3,
  "b2e-bud": 0.5,
  "b2e-mid": 1,
  "b2e-hi": 2,
  "b2f-hunt": 0.7,
  "b2f-bal": 0.85,
  "b2f-conv": 1,
};

export const budgetOf = (
  answers: Record<string, string[]>,
): [number, number] => {
  const pick = (q: string) => answers[q]?.[0] ?? "";
  const base = ROOM_BASE[pick("b2a")] ?? [2000, 6000];
  const m = ["b2b", "b2c", "b2d", "b2e", "b2f"].reduce(
    (k, q) => k * (MULT[pick(q)] ?? 1),
    1,
  );
  const lo = base[0] * m;
  let hi = base[1] * m;
  const approach = pick("b1");
  if (approach === "hard") hi = lo + (hi - lo) * 0.5;
  if (approach === "flexible") hi *= 1.15;
  return [
    snapBudget(lo),
    Math.max(snapBudget(lo) + BUDGET.step, snapBudget(hi)),
  ];
};

export const ROOM_QUIZ: Question[] = [
  {
    id: "r0",
    question: "Which room?",
    subtext: "The one we are planning.",
    min: 1,
    max: 1,
    options: ROOMS.map((r) => ({ id: r, label: r })),
  },
  {
    id: "r1",
    question: "Who lives here?",
    min: 1,
    max: 1,
    options: [
      { id: "r1a", label: "Just me" },
      { id: "r1b", label: "Me and a partner" },
      { id: "r1c", label: "Family with young kids" },
      { id: "r1d", label: "Family with older kids" },
      { id: "r1e", label: "Housemates" },
    ],
  },
  {
    id: "r2",
    question: "Any pets?",
    min: 1,
    max: 1,
    options: [
      { id: "r2a", label: "A small dog" },
      { id: "r2b", label: "A large dog" },
      { id: "r2c", label: "A cat" },
      { id: "r2d", label: "Several" },
      { id: "r2e", label: "No pets" },
    ],
  },
  {
    id: "r5",
    question: "Natural light",
    min: 1,
    max: 1,
    options: [
      { id: "r5a", label: "Bright and sunny" },
      { id: "r5b", label: "Moderate" },
      { id: "r5c", label: "Dim, north-facing" },
    ],
  },
  {
    id: "r9",
    question: "How do you use this room?",
    subtext: "Pick up to three.",
    min: 1,
    max: 3,
    options: [
      { id: "r9a", label: "Watching TV" },
      { id: "r9b", label: "Reading" },
      { id: "r9c", label: "Working or studying" },
      { id: "r9d", label: "Eating meals" },
      { id: "r9e", label: "Hosting friends" },
      { id: "r9f", label: "Kids playing" },
      { id: "r9k", label: "Video calls" },
    ],
  },
  {
    id: "r10",
    question: "Furniture needs",
    subtext: "What has to be in it? Pick up to four.",
    min: 1,
    max: 4,
    options: [
      { id: "Seating", label: "Seating" },
      { id: "Desk", label: "A desk" },
      { id: "Shelving", label: "Shelving" },
      { id: "Storage", label: "Closed storage" },
      { id: "Wardrobe", label: "A wardrobe" },
      { id: "Bedside", label: "Bedside storage" },
      { id: "Divider", label: "A room divider" },
    ],
  },
];

export const QUIZZES: Record<Flow, Question[]> = {
  style: STYLE_QUIZ,
  budget: BUDGET_QUIZ,
  room: ROOM_QUIZ,
};
