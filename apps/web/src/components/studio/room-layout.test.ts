import { describe, expect, it } from "vitest";
import { layoutPlans } from "./room-layout";
import { defaultProps } from "./piece-detail";
import { rulesFor } from "./room-data";
import type { Room } from "./room-health";

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
