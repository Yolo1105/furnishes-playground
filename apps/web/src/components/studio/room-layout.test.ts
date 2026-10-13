import { describe, expect, it } from "vitest";
import { layoutPlans } from "./room-layout";
import { defaultProps } from "./piece-detail";
import { rulesFor } from "./room-data";
import { WALL_MM } from "./room-geometry";
import type { Room } from "./room-health";
import { designOf } from "./design-rules";

/**
 * By the book: the archetype's anchors stand where the rules say. A
 * bedroom's bed is centred on its longest wall with its back to it, the
 * bedside touches it, and nothing stands outside the room.
 */
const room: Room = {
  W: 3600,
  D: 3300,
  outline: [
    [0, 0],
    [3600, 0],
    [3600, 3300],
    [0, 3300],
  ],
  openings: [
    { id: "d", kind: "door", wall: "south", at: 600, width: 900 },
    { id: "w", kind: "window", wall: "east", at: null, width: 1500 },
  ],
  rules: rulesFor("master"),
  thickness: WALL_MM,
};
const piece = (id: string, name: string, w: number, d: number, h: number) => ({
  ...defaultProps({
    id,
    name,
    kind: "decor" as const,
    category: "decor" as const,
  }),
  width: w,
  depth: d,
  height: h,
  name,
});

describe("by the book", () => {
  const items = [
    piece("bed", "Double bed", 1500, 2000, 500),
    piece("bs", "Bedside cabinet", 600, 400, 400),
    piece("desk", "Desk", 1200, 600, 750),
  ];
  const now = items.map(() => ({ x: 0, y: 0 }));
  const book = layoutPlans(items, room, now, "master").find(
    (p) => p.id === "book",
  )!;
  it("is the fourth layout, named for the archetype", () => {
    expect(layoutPlans(items, room, now, "master").map((p) => p.id)).toEqual([
      "rows",
      "across",
      "walls",
      "book",
    ]);
    expect(book.note).toBe("The bed on the longest wall");
  });
  it("centres the bed on the longest wall, its back to it", () => {
    const bed = book.places[0]!;
    // the north wall is the longest (3600): the bed's head to it, centred
    expect(bed.y).toBe(0);
    expect(bed.rotation).toBe(0);
    expect(Math.abs(bed.x + 1500 / 2 - 1800)).toBeLessThanOrEqual(100);
  });
  it("stands the bedside against the bed on the same wall", () => {
    const bed = book.places[0]!;
    const bs = book.places[1]!;
    expect(bs.y).toBe(0);
    const gap = Math.min(
      Math.abs(bs.x + 600 - bed.x),
      Math.abs(bed.x + 1500 - bs.x),
    );
    expect(gap).toBeLessThanOrEqual(50);
  });
  it("keeps every piece inside the room", () => {
    book.places.forEach((p, i) => {
      const it = items[i]!;
      const w = p.rotation % 180 === 0 ? it.width : it.depth;
      const d = p.rotation % 180 === 0 ? it.depth : it.width;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + w).toBeLessThanOrEqual(3600);
      expect(p.y + d).toBeLessThanOrEqual(3300);
    });
  });
});

/**
 * By the book keeps the designer's rules (design-rules.ts): the coffee
 * table stands 400–450 mm from the sofa's front, about two thirds of its
 * length, so the room's advice has nothing to say of either.
 */
describe("by the book, the living room", () => {
  const living: Room = {
    ...room,
    // deep enough for the sideboard, the 2400 mm to the sofa and the sofa
    W: 4200,
    D: 4500,
    outline: [
      [0, 0],
      [4200, 0],
      [4200, 4500],
      [0, 4500],
    ],
    rules: rulesFor("living"),
  };
  const items = [
    piece("sofa", "Three-seat sofa", 2200, 900, 820),
    piece("tv", "TV console", 1800, 400, 500),
    piece("ct", "Coffee table", 1200, 600, 400),
  ];
  const now = items.map(() => ({ x: 0, y: 0 }));
  const book = layoutPlans(items, living, now, "living").find(
    (p) => p.id === "book",
  )!;
  it("stands the coffee table a seated reach from the sofa", () => {
    const placed = book.places.map((p, i) => {
      const it = items[i]!;
      const turned = p.rotation % 180 !== 0;
      return {
        id: ["sofa", "tv", "ct"][i]!,
        name: it.name,
        x: p.x,
        y: p.y,
        w: turned ? it.depth : it.width,
        d: turned ? it.width : it.depth,
        h: it.height,
      };
    });
    const advice = designOf(placed, living.W, living.D);
    expect(advice.filter((a) => a.rule.startsWith("table"))).toEqual([]);
  });
});
