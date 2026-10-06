import { counts, defaultConfig, priceOf, productOf } from "@furnishes/domain";

/**
 * What the landing opens with: a spot in a room as it is, and the same
 * spot with the piece we would put there, both stills at the same
 * camera (public/swaps/<id>-before.webp, <id>-after.webp). The problem
 * is in the visitor's own words; the answer's name, line and numbers
 * come from the catalogue, so nothing here is written twice. Only spots
 * whose piece is one the catalogue sells are shown.
 */
export type Swap = {
  id: string;
  /** the problem, in the visitor's words */
  say: string;
  /** "the flat · by the door" */
  where: string;
  name: string;
  line: string;
  /** "14 parts · 36 bolts · one key · about 22 min · one person" */
  build: string;
  /** S$, an estimate */
  price: number;
  before: string;
  after: string;
};

const SPOTS: [id: string, say: string, where: string][] = [
  ["entry", "Coats pile up on the chair by the door", "the flat · by the door"],
  [
    "bedside",
    "Phone and book on the floor by the bed",
    "the flat · beside the bed",
  ],
  ["work-cart", "The printer lives on the floor", "the loft · at the desk"],
  [
    "kitchen",
    "The counter is too short when I cook",
    "the flat · the end of the counter",
  ],
  [
    "bookwall",
    "Books and records with no wall to live on",
    "the loft · behind the sofa",
  ],
];

export const SWAPS: Swap[] = SPOTS.flatMap(([id, say, where]) => {
  const p = productOf(id);
  if (!p) return [];
  const n = counts(p, defaultConfig(p));
  return [
    {
      id,
      say,
      where,
      name: p.name,
      line: p.benefit,
      build: [
        `${n.parts} parts`,
        `${n.bolts} bolts`,
        "one key",
        `about ${n.minutes} min`,
        n.people === 1 ? "one person" : "two people",
      ].join(" · "),
      price: priceOf(p).sgd,
      before: `/swaps/${id}-before.webp`,
      after: `/swaps/${id}-after.webp`,
    },
  ];
});
