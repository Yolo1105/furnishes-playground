import type { RoomId } from "./room-data";
import { mustHaveMatch } from "./room-data";

/**
 * How a room of each kind is usually laid out: the placement rules an
 * interior designer starts from, in the studio's own words. The bed
 * centred on the longest wall with the bedsides flanking it and the
 * wardrobe opposite; the desk at the window; the sofa across from the
 * media wall with the coffee table in front; the bookwall along the
 * longest free wall; the dining table in the middle. Two readers: the
 * model is told them as guidance when the box is on the layout lens,
 * and the planner's fourth layout, By the book, places by them, in
 * order of priority, falling through to the ordinary placement for
 * anything a rule cannot seat. A rule names a thing by the words in
 * its name, as the must-haves do.
 */
export type Placement =
  /** centred along the longest wall, its back to it */
  | "longest-wall"
  /** either side of the target, touching it */
  | "flanking"
  /** against the wall across from the target */
  | "opposite"
  /** under the window, facing it */
  | "window"
  /** across the room from the target, facing it */
  | "facing"
  /** in front of the target, a step away */
  | "in-front"
  /** against the longest wall that is still free */
  | "free-wall"
  /** in the middle of the room */
  | "middle";

export type Rule = {
  /** the thing, by the words in its name */
  what: RegExp;
  /** what it is called in guidance */
  name: string;
  place: Placement;
  /** the rule's target, another rule's name */
  target?: string;
  /** mm between the piece and its target, for flanking, facing and in front */
  gap?: number;
  /** the words that make it as a room item, when no catalogue piece is it */
  item?: string;
};

type Archetype = { name: string; rules: Rule[] };

const BED = mustHaveMatch("bed");
const BEDSIDE = /bedside|nightstand/i;
const WARDROBE = /wardrobe|clothes|coat/i;
const DESK = /\bdesk\b(?!-side| lamp)/i;
const SOFA = /sofa|couch|settee/i;
const MEDIA = /sideboard|tv|media|console/i;
const COFFEE = /coffee table/i;
const BOOKS = /bookwall|bookshelf|bookcase|shelv/i;
const DINING = /dining/i;
const DESK_SIDE = /desk-side|work cart|trolley/i;

export const ARCHETYPES: Record<RoomId, Archetype> = {
  master: {
    name: "The bed on the longest wall",
    rules: [
      { what: BED, name: "bed", place: "longest-wall", item: "A double bed" },
      {
        what: BEDSIDE,
        name: "bedside",
        place: "flanking",
        target: "bed",
        gap: 0,
      },
      { what: WARDROBE, name: "wardrobe", place: "opposite", target: "bed" },
      { what: DESK, name: "desk", place: "window", item: "A desk" },
    ],
  },
  "bedroom-1": {
    name: "The bed on the longest wall",
    rules: [
      { what: BED, name: "bed", place: "longest-wall", item: "A single bed" },
      {
        what: BEDSIDE,
        name: "bedside",
        place: "flanking",
        target: "bed",
        gap: 0,
      },
      { what: DESK, name: "desk", place: "window", item: "A desk" },
      { what: WARDROBE, name: "wardrobe", place: "opposite", target: "bed" },
    ],
  },
  "bedroom-2": {
    name: "The bed on the longest wall",
    rules: [
      { what: BED, name: "bed", place: "longest-wall", item: "A single bed" },
      {
        what: BEDSIDE,
        name: "bedside",
        place: "flanking",
        target: "bed",
        gap: 0,
      },
      { what: DESK, name: "desk", place: "window", item: "A desk" },
      { what: WARDROBE, name: "wardrobe", place: "opposite", target: "bed" },
    ],
  },
  living: {
    name: "The sofa facing the media wall",
    rules: [
      { what: MEDIA, name: "sideboard", place: "longest-wall" },
      {
        what: SOFA,
        name: "sofa",
        place: "facing",
        target: "sideboard",
        gap: 2400,
        item: "A three-seat sofa",
      },
      {
        what: COFFEE,
        name: "coffee table",
        place: "in-front",
        target: "sofa",
        gap: 450,
        item: "A coffee table",
      },
      { what: BOOKS, name: "bookwall", place: "free-wall" },
      {
        what: DINING,
        name: "dining table",
        place: "middle",
        item: "A dining table",
      },
    ],
  },
  study: {
    name: "The desk at the window",
    rules: [
      { what: DESK, name: "desk", place: "window", item: "A desk" },
      {
        what: DESK_SIDE,
        name: "desk-side",
        place: "flanking",
        target: "desk",
        gap: 0,
      },
      { what: BOOKS, name: "bookwall", place: "free-wall" },
      { what: WARDROBE, name: "storage", place: "opposite", target: "desk" },
    ],
  },
  kitchen: {
    name: "The trolley at the counter's end",
    rules: [
      { what: /trolley|cart|island/i, name: "trolley", place: "free-wall" },
      {
        what: DINING,
        name: "dining table",
        place: "middle",
        item: "A dining table",
      },
    ],
  },
  bathroom: {
    name: "The trolley by the basin",
    rules: [
      { what: /trolley|cart|caddy/i, name: "trolley", place: "free-wall" },
    ],
  },
};

const SAID: Record<Placement, (r: Rule) => string> = {
  "longest-wall": (r) =>
    `the ${r.name} centred on the longest wall, its back to it`,
  flanking: (r) => `a ${r.name} either side of the ${r.target}, touching it`,
  opposite: (r) => `the ${r.name} on the wall across from the ${r.target}`,
  window: (r) => `the ${r.name} under the window, facing it`,
  facing: (r) => `the ${r.name} across from the ${r.target}, facing it`,
  "in-front": (r) => `the ${r.name} in front of the ${r.target}, a step away`,
  "free-wall": (r) => `the ${r.name} along the longest wall still free`,
  middle: (r) => `the ${r.name} in the middle of the room`,
};

/** the room's archetype as guidance, one line per rule in order */
export const archetypeText = (room: RoomId) => {
  const a = ARCHETYPES[room];
  return `How a ${a.name.toLowerCase()} room is usually laid out, in order: ${a.rules
    .map(SAID_OF)
    .join("; ")}.`;
};
const SAID_OF = (r: Rule) => SAID[r.place](r);
