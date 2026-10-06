/**
 * The catalogue: the thirteen Furnishes recipes, carried over from the
 * house site's storefront, which carried them from the assembly record.
 * Each is a body of 18 mm birch panels on the 600 × 400 × 400 unit: how
 * wide, how tall, how many tiers and bays, which rooms it is for, what
 * it lets you do, what comes on it and what can. The parts a recipe is
 * built from are counted in parts.ts, the steps to build it in
 * steps.ts, and its price, an estimate from those parts, in price.ts.
 * Nothing here is a released SKU or a load rating: the status tier says
 * how far along each recipe is.
 */

/** the shelves of the Products tab */
export type Category = "storage" | "seating" | "tables" | "screens";

export const CATEGORY_NAMES: Record<Category, string> = {
  storage: "Storage",
  seating: "Seating",
  tables: "Tables & desks",
  screens: "Screens & dividers",
};

/** the body a recipe is: how its parts go together */
export type Shape =
  | "organiser"
  | "cabinet"
  | "trolley"
  | "shelf"
  | "desk"
  | "screen"
  | "folding"
  | "bench"
  | "island";

/** pieces that share a structure: a body with several lives */
export type Family = "full-height" | "stacked" | "folding" | "seating";

export const FAMILIES: Record<Family, { name: string; blurb: string }> = {
  "full-height": {
    name: "Full-height organisers",
    blurb: "One upright body: by the door, beside the desk, or as a screen.",
  },
  stacked: {
    name: "Stacked storage",
    blurb: "40 cm tiers that stack: bedside, trolley, sideboard, bookwall.",
  },
  folding: {
    name: "Folding screens",
    blurb: "Framed leaves on hinges. No storage, quick to move.",
  },
  seating: {
    name: "Seating",
    blurb: "A dedicated seat over storage. Load-tested separately.",
  },
};

/** what a piece lets you do */
export type Does =
  | "hang"
  | "put down"
  | "sit"
  | "hide"
  | "divide"
  | "work"
  | "charge"
  | "display";

/** how far along a recipe is: no recipe is buyable until it is costed
    and validated on samples */
export type Status = "buyable" | "adjustable" | "concept";

export const STATUS: Record<Status, { label: string; blurb: string }> = {
  buyable: {
    label: "Buyable",
    blurb: "Costed and validated on samples. Can be ordered.",
  },
  adjustable: {
    label: "Adjustable",
    blurb:
      "A configurable design preview. Parts and drawings are real; the price is an estimate and the load rating is not yet released.",
  },
  concept: {
    label: "Concept",
    blurb: "A direction we are still checking. Save it, compare it, ask us.",
  },
};

/** where a piece is for, in the words of the house */
export type Spot =
  | "Entryway"
  | "Bedroom"
  | "Workspace"
  | "Kitchen & dining"
  | "Living room"
  | "Shared spaces";

export type Product = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  family: Family;
  shape: Shape;
  /** mm; a folding screen's depth is its leaves' fold, so none */
  width: number;
  height: number;
  depth: number | null;
  tiers: number;
  bays: number;
  rooms: Spot[];
  /** one line on what it is for */
  use: string;
  /** one line on what it gives */
  benefit: string;
  /** what the piece is, in a few words */
  fit: string;
  /** what to check in the room before it comes */
  space: string;
  description: string;
  /** the assembly record's entry */
  source: string;
  /** a door can go on it */
  door: boolean;
  defaultAccessories: string[];
  optionalAccessories: string[];
  does: Does[];
  status: Status;
};

const base = {
  door: false,
  defaultAccessories: [] as string[],
  optionalAccessories: [] as string[],
  status: "adjustable" as Status,
};

export const products: Product[] = [
  {
    ...base,
    id: "entry",
    name: "Entry organiser",
    category: "storage",
    subcategory: "Freestanding organisers",
    family: "full-height",
    shape: "organiser",
    width: 600,
    height: 1200,
    depth: 400,
    tiers: 3,
    bays: 1,
    rooms: ["Entryway"],
    use: "Hang, set down, head out.",
    benefit: "Coats, keys and shoes in one place.",
    fit: "Freestanding entry storage",
    space:
      "Measure the full base and leave access in front for coats and shoes.",
    description:
      "A freestanding landing place for bags, keys and everyday shoes. Hanging space above, a shoe shelf below, and a small tray for the things that travel with you.",
    source: "1.1",
    defaultAccessories: ["coat-hook", "key-tray"],
    optionalAccessories: ["headphone-hook"],
    does: ["hang", "put down"],
  },
  {
    ...base,
    id: "desk",
    name: "Desk-side organiser",
    category: "storage",
    subcategory: "Freestanding organisers",
    family: "full-height",
    shape: "organiser",
    width: 600,
    height: 1200,
    depth: 400,
    tiers: 3,
    bays: 1,
    rooms: ["Workspace"],
    use: "Your tools, an arm's reach away.",
    benefit: "More storage. Keep your desk.",
    fit: "Added storage · desk not included",
    space:
      "Allow for your chair and reaching the shelves. Your desk stands independently.",
    description:
      "An independent organising surface beside the desk you already like. Open shelves and a functional panel keep the everyday visible without using your desktop.",
    source: "1.2",
    defaultAccessories: ["headphone-hook"],
    optionalAccessories: ["key-tray", "coat-hook"],
    does: ["hang", "put down", "work", "charge"],
  },
  {
    ...base,
    id: "bedside",
    name: "Bedside cabinet",
    category: "storage",
    subcategory: "Bedside storage",
    family: "stacked",
    shape: "cabinet",
    width: 600,
    height: 400,
    depth: 400,
    tiers: 1,
    bays: 1,
    rooms: ["Bedroom", "Living room"],
    use: "Last thing at night. First thing in the morning.",
    benefit: "The little things, close at hand.",
    fit: "Low storage · open or with a door",
    space:
      "Compare the final top height with your mattress. Allow space for an optional door.",
    description:
      "One tabletop and an open compartment for the things you keep close. Explore an open front or a door, then compare the preliminary body height with your bedside space.",
    source: "1.3",
    door: true,
    optionalAccessories: ["key-tray"],
    does: ["put down", "hide", "charge"],
  },
  {
    ...base,
    id: "kitchen",
    name: "Kitchen trolley",
    category: "tables",
    subcategory: "Storage trolleys",
    family: "stacked",
    shape: "trolley",
    width: 600,
    height: 800,
    depth: 400,
    tiers: 2,
    bays: 1,
    rooms: ["Kitchen & dining"],
    use: "A little extra room for preparation.",
    benefit: "A surface that comes to you.",
    fit: "Mobile storage with a worktop",
    space:
      "Check final worktop height and allow a clear path around the caster base.",
    description:
      "A two-tier storage body with a worktop and a caster base. Keep everyday supplies nearby and see how two units could form an island.",
    source: "1.4",
    defaultAccessories: ["kitchen-rail"],
    optionalAccessories: ["key-tray"],
    does: ["put down", "work"],
  },
  {
    ...base,
    id: "work-cart",
    name: "Work cart",
    category: "tables",
    subcategory: "Storage trolleys",
    family: "stacked",
    shape: "trolley",
    width: 600,
    height: 800,
    depth: 400,
    tiers: 2,
    bays: 1,
    rooms: ["Workspace"],
    use: "Bring the useful things closer.",
    benefit: "Keep supplies close. Roll them away.",
    fit: "Added storage · desk not included",
    space:
      "Allow room to move the cart and open any doors, separate from your chair.",
    description:
      "Open storage for tools and materials beside your work area. Compare it with an upright organiser when you want to keep your existing desk.",
    source: "1.6",
    door: true,
    defaultAccessories: ["headphone-hook"],
    optionalAccessories: ["key-tray"],
    does: ["put down", "hide", "work"],
  },
  {
    ...base,
    id: "sideboard",
    name: "Three-bay sideboard",
    category: "storage",
    subcategory: "Cabinets & sideboards",
    family: "stacked",
    shape: "cabinet",
    width: 1800,
    height: 800,
    depth: 400,
    tiers: 2,
    bays: 3,
    rooms: ["Living room", "Entryway", "Workspace"],
    use: "One continuous place for everyday things.",
    benefit: "A longer home for everyday things.",
    fit: "Three connected storage bays",
    space:
      "Check the full 180 cm body width, final base footprint and access to the front.",
    description:
      "Three storage bays form a longer piece for a living room, hallway or workspace. Explore open compartments or doors across the front.",
    source: "1.10",
    door: true,
    does: ["put down", "hide", "display"],
  },
  {
    ...base,
    id: "bookwall",
    name: "Bookwall",
    category: "storage",
    subcategory: "Shelving & bookcases",
    family: "stacked",
    shape: "shelf",
    width: 1200,
    height: 1600,
    depth: 400,
    tiers: 4,
    bays: 2,
    rooms: ["Living room", "Workspace", "Shared spaces"],
    use: "A place for books. A boundary between spaces.",
    benefit: "A boundary you can use on both sides.",
    fit: "Double-sided shelving",
    space:
      "Shelves on either side are shallower than the full body depth. Keep both sides accessible.",
    description:
      "Shallower shelves on either side of a central panel let this piece work between two areas. Compare it with a screen if storage on both sides matters.",
    source: "2.9",
    does: ["divide", "display", "put down"],
  },
  {
    ...base,
    id: "workstation",
    name: "Organiser workstation",
    category: "tables",
    subcategory: "Desks & workstations",
    family: "full-height",
    shape: "desk",
    width: 1200,
    height: 1600,
    depth: 1000,
    tiers: 4,
    bays: 1,
    rooms: ["Workspace", "Shared spaces"],
    use: "A place to work, with everything around it.",
    benefit: "A desk and storage, together.",
    fit: "Desk surface and support included",
    space:
      "Allow chair and legroom in front of the desk, plus access to the organiser.",
    description:
      "A desk surface, independent supports and an upright organising body form one workspace. Unlike a desk-side organiser, this design includes the desk.",
    source: "2.11",
    defaultAccessories: ["headphone-hook"],
    optionalAccessories: ["key-tray"],
    does: ["work", "hang", "charge"],
  },
  {
    ...base,
    id: "mobile-screen",
    name: "Mobile screen",
    category: "screens",
    subcategory: "Mobile screens",
    family: "full-height",
    shape: "screen",
    width: 600,
    height: 1200,
    depth: 400,
    tiers: 3,
    bays: 1,
    rooms: ["Shared spaces", "Workspace", "Bedroom"],
    use: "One piece. Two sides to your day.",
    benefit: "A little separation, wherever it helps.",
    fit: "Mobile divider with storage",
    space:
      "Check the base footprint and allow access to the storage side. This screen does not fold.",
    description:
      "A full-height panel body with storage on one side and a quieter face on the other. Use it as a background or a temporary visual boundary.",
    source: "3.1",
    optionalAccessories: ["coat-hook", "headphone-hook"],
    does: ["divide", "hang", "work"],
  },
  {
    ...base,
    id: "folding-screen",
    name: "Folding screen",
    category: "screens",
    subcategory: "Folding screens",
    family: "folding",
    shape: "folding",
    width: 1800,
    height: 1200,
    depth: null,
    tiers: 3,
    bays: 3,
    rooms: ["Shared spaces", "Bedroom", "Workspace"],
    use: "A little separation, when you want it.",
    benefit: "Open up. Make a little room.",
    fit: "Three folding leaves · no storage",
    space:
      "The 180 cm span is fully unfolded. Fold angle changes both width and depth.",
    description:
      "Three framed leaves connected by hinges. Its construction is separate from the storage and mobile-screen families.",
    source: "3.3",
    does: ["divide"],
  },
  {
    ...base,
    id: "island",
    name: "Preparation island",
    category: "tables",
    subcategory: "Prep tables & islands",
    family: "stacked",
    shape: "island",
    width: 1200,
    height: 800,
    depth: 400,
    tiers: 2,
    bays: 2,
    rooms: ["Kitchen & dining"],
    use: "Two pieces. A shared surface.",
    benefit: "Two bodies. One generous surface.",
    fit: "Complete two-unit arrangement",
    space:
      "Check the shared top, final worktop height and access around both caster bases.",
    description:
      "Two trolley bodies sit beneath a longer worktop. The short worktops are set aside; a connecting assembly is also needed.",
    source: "1.11",
    does: ["work", "put down"],
    status: "concept",
  },
  {
    ...base,
    id: "bench",
    name: "Storage bench",
    category: "seating",
    subcategory: "Benches",
    family: "seating",
    shape: "bench",
    width: 1200,
    height: 450,
    depth: 400,
    tiers: 1,
    bays: 2,
    rooms: ["Entryway", "Living room"],
    use: "A place to pause on your way out.",
    benefit: "Sit down. Put things away.",
    fit: "Dedicated seat and storage",
    space:
      "Final seat height and seating load are still being validated. Ordinary cabinet tops are not seats.",
    description:
      "A storage-and-seating study with a dedicated seat surface. Seat support and load testing are separate from the storage system.",
    source: "1.12",
    does: ["sit", "hide"],
    status: "concept",
  },
  {
    ...base,
    id: "coat-rack",
    name: "Coat stand",
    category: "storage",
    subcategory: "Clothes & entry racks",
    family: "full-height",
    shape: "organiser",
    width: 600,
    height: 1600,
    depth: 400,
    tiers: 4,
    bays: 1,
    rooms: ["Entryway", "Bedroom"],
    use: "Make room for what you wear.",
    benefit: "Make space for what you wear.",
    fit: "Taller hanging storage",
    space:
      "Compare the available hanging height with your clothes, and check the final base footprint.",
    description:
      "A taller organising piece for clothes and bags, with a hanging rail and a lower storage shelf.",
    source: "1.17",
    defaultAccessories: ["clothes-rail"],
    optionalAccessories: ["coat-hook"],
    does: ["hang", "put down"],
    status: "concept",
  },
];

export const productOf = (id: string) => products.find((p) => p.id === id);

/** the add-ons that hang on a functional panel's holes */
export const ACCESSORIES: Record<
  string,
  { name: string; description: string }
> = {
  "coat-hook": {
    name: "Coat hook set",
    description: "Three hooks on the working face.",
  },
  "key-tray": {
    name: "Small tray",
    description: "A shallow resting place for everyday small items.",
  },
  "headphone-hook": {
    name: "Utility hook",
    description: "A place for headphones or a small everyday item.",
  },
  "kitchen-rail": {
    name: "Side rail",
    description: "A rail beside the kitchen worktop.",
  },
  "clothes-rail": {
    name: "Clothes rail assembly",
    description: "A hanging rail and its supports.",
  },
};

/** how one piece is configured: open or with doors, and its add-ons */
export type Configuration = {
  doors: boolean;
  accessories: string[];
};

export const defaultConfig = (p: Product): Configuration => ({
  doors: false,
  accessories: [...p.defaultAccessories],
});

/** on casters: a trolley, a mobile screen, an island */
export const isMobile = (p: Pick<Product, "shape">) =>
  ["trolley", "screen", "island"].includes(p.shape);

/** "60 × 120 × 40 cm" */
export const dimensionSummary = (p: Product) =>
  p.shape === "folding"
    ? `${p.width / 10} W × ${p.height / 10} H cm unfolded · depth varies`
    : `${p.width / 10} W × ${p.height / 10} H × ${(p.depth ?? 0) / 10} D cm`;

/** the footprint a piece takes on the floor, mm: a folding screen's
    leaves stand at an angle, so it takes some depth */
export const FOLDED_DEPTH = 300;
export const depthOf = (p: Pick<Product, "depth">) => p.depth ?? FOLDED_DEPTH;

/* ---------- how the pieces relate ---------- */

/** same-body and combination relations: design studies, not validated */
export const RELATIONSHIPS = [
  {
    id: "entry-to-desk",
    from: "entry",
    to: "desk",
    quantity: 1,
    kind: "same-body" as const,
    title: "From hallway to workday",
    summary:
      "The full-height body is the common starting point. The shoe shelf, shelves and accessories differ.",
  },
  {
    id: "kitchen-to-work",
    from: "kitchen",
    to: "work-cart",
    quantity: 1,
    kind: "same-body" as const,
    title: "From preparation to making",
    summary: "The two-tier body stays; the everyday accessories change.",
  },
  {
    id: "two-trolleys-to-island",
    from: "kitchen",
    to: "island",
    quantity: 2,
    kind: "combine" as const,
    title: "Two trolleys. One shared surface.",
    summary:
      "Keep two bodies and bases, set aside the two short worktops, add a long worktop and a connecting assembly.",
  },
];

export type RecommendationType = "alternative" | "family" | "companion";

export const RECOMMENDATION_LABELS: Record<RecommendationType, string> = {
  alternative: "Another way to solve this",
  family: "Same family, another size",
  companion: "Goes beside it, not joined",
};

/** for each piece, the others worth a look and why */
export const RECOMMENDATIONS: Record<
  string,
  { id: string; type: RecommendationType; reason: string }[]
> = {
  entry: [
    {
      id: "coat-rack",
      type: "family",
      reason:
        "More hanging height and a clothes rail. The taller uprights are different parts.",
    },
    {
      id: "bench",
      type: "companion",
      reason:
        "A separate place to sit in the entryway. The two pieces are not joined.",
    },
  ],
  desk: [
    {
      id: "work-cart",
      type: "alternative",
      reason:
        "Keep the existing desk, but put your supplies in a lower mobile unit instead.",
    },
    {
      id: "workstation",
      type: "alternative",
      reason:
        "A complete desk arrangement if you need a new work surface as well as storage.",
    },
  ],
  bedside: [
    {
      id: "work-cart",
      type: "family",
      reason: "A taller two-tier body with a mobile base. A different piece.",
    },
  ],
  kitchen: [
    {
      id: "island",
      type: "family",
      reason: "Two of these under one long worktop make the island.",
    },
  ],
  "work-cart": [
    {
      id: "desk",
      type: "alternative",
      reason: "An upright, visible place for your tools beside the same desk.",
    },
    {
      id: "sideboard",
      type: "alternative",
      reason:
        "More storage across a longer fixed piece, when floor space matters less.",
    },
  ],
  sideboard: [
    {
      id: "bookwall",
      type: "alternative",
      reason:
        "Height and access from two sides instead of a long, low surface.",
    },
  ],
  bookwall: [
    {
      id: "mobile-screen",
      type: "alternative",
      reason: "A movable visual boundary over shelves on both sides.",
    },
    {
      id: "folding-screen",
      type: "alternative",
      reason: "Folding leaves with no storage, when the boundary is temporary.",
    },
  ],
  workstation: [
    {
      id: "desk",
      type: "alternative",
      reason: "Keep your own desk and add an independent organiser.",
    },
    {
      id: "bookwall",
      type: "companion",
      reason: "Separate storage beside your work area. Not connected.",
    },
  ],
  "mobile-screen": [
    {
      id: "folding-screen",
      type: "alternative",
      reason: "Folding leaves for a visual boundary, with no storage body.",
    },
    {
      id: "bookwall",
      type: "alternative",
      reason: "A taller boundary that holds books on both sides.",
    },
  ],
  "folding-screen": [
    {
      id: "mobile-screen",
      type: "alternative",
      reason: "A movable body with storage, instead of folding leaves.",
    },
  ],
  island: [
    {
      id: "kitchen",
      type: "family",
      reason: "One trolley on its own, with its short worktop.",
    },
  ],
  bench: [
    {
      id: "entry",
      type: "companion",
      reason: "Coats and keys get their own upright place beside a seat.",
    },
  ],
  "coat-rack": [
    {
      id: "entry",
      type: "family",
      reason: "A lower body for hooks, shoes and keys.",
    },
  ],
};
