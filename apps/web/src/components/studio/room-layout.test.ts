import { describe, expect, it } from "vitest";
import {
  CORNER_PLANT,
  freeCorner,
  layoutPlans,
  layoutRoom,
  REACH,
  settle,
} from "./room-layout";
import { defaultProps } from "./piece-detail";
import { rulesFor } from "./room-data";
import { WALL_MM } from "./room-geometry";
import type { Room } from "./room-health";
import { DESIGN, designOf } from "./design-rules";

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
  it("lays the rug under the sofa's front and the table, and stands the lamp at the sofa's end", () => {
    const group = [
      ...items,
      piece("rug", "Rug", 2000, 1400, 12),
      piece("lamp", "Floor lamp", 400, 400, 1600),
    ];
    const ids = ["sofa", "tv", "ct", "rug", "lamp"];
    const plan = layoutPlans(
      group,
      living,
      group.map(() => ({ x: 0, y: 0 })),
      "living",
    ).find((p) => p.id === "book")!;
    const placed = plan.places.map((p, i) => {
      const it = group[i]!;
      const turned = p.rotation % 180 !== 0;
      return {
        id: ids[i]!,
        name: it.name,
        x: p.x,
        y: p.y,
        w: turned ? it.depth : it.width,
        d: turned ? it.width : it.depth,
        h: it.height,
      };
    });
    const advice = designOf(placed, living.W, living.D).map((a) => a.rule);
    expect(advice).not.toContain("rug-size");
    expect(advice).not.toContain("lamp");
    // the sofa's front over the rug, the table on it, the lamp beside
    const [sofa, , table, rug, lamp] = placed;
    const over = (a: typeof rug, b: typeof rug) =>
      Math.min(
        Math.min(a!.x + a!.w, b!.x + b!.w) - Math.max(a!.x, b!.x),
        Math.min(a!.y + a!.d, b!.y + b!.d) - Math.max(a!.y, b!.y),
      );
    expect(over(sofa, rug)).toBeGreaterThanOrEqual(DESIGN.onRug);
    expect(over(table, rug)).toBeGreaterThan(0);
    expect(over(sofa, lamp)).toBeLessThan(0);
    expect(over(sofa, lamp)).toBeGreaterThan(-DESIGN.lampReach);
  });
});

describe("a lived-in room's plant", () => {
  it("stands in a free corner, clear of the pieces and the door", () => {
    const { size, inset } = CORNER_PLANT;
    // the door in the south wall at 600: its corner is kept clear
    const free = freeCorner(room, [], 3)!;
    expect(free).not.toBeNull();
    expect(free.w).toBe(size);
    const nearDoor = free.y > room.D / 2 && free.x < room.W / 2;
    expect(nearDoor).toBe(false);
    // a piece in each other corner leaves none
    const all = [
      { x: inset, y: inset, w: size, d: size },
      { x: room.W - inset - size, y: inset, w: size, d: size },
      { x: room.W - inset - size, y: room.D - inset - size, w: size, d: size },
    ];
    expect(freeCorner(room, all, 0)).toBeNull();
  });
});

/**
 * Along the walls, a room with more pieces than its walls take: the one
 * left over stands loose in the middle a walkway from everything else,
 * as the pieces along the walls stand from each other (a grid step only
 * when the room has no such spot).
 */
describe("along the walls, more pieces than the walls take", () => {
  const big: Room = {
    ...room,
    W: 4500,
    D: 4200,
    outline: [
      [0, 0],
      [4500, 0],
      [4500, 4200],
      [0, 4200],
    ],
  };
  const items = [
    piece("w1", "Wardrobe", 2400, 600, 2000),
    piece("w2", "Wardrobe 2", 2400, 600, 2000),
    piece("desk", "Desk", 2000, 700, 750),
    piece("chest", "Chest of drawers", 1800, 500, 900),
    piece("chair", "Armchair", 850, 850, 800),
  ];
  const now = items.map(() => ({ x: 0, y: 0 }));
  const walls = layoutPlans(items, big, now, "master").find(
    (p) => p.id === "walls",
  )!;
  const boxes = walls.places.map((p, i) => {
    const it = items[i]!;
    const turned = p.rotation % 180 !== 0;
    return {
      x: p.x,
      y: p.y,
      w: turned ? it.depth : it.width,
      d: turned ? it.width : it.depth,
    };
  });
  /** the clear distance between two boxes on the plan, mm */
  const apart = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
    Math.max(
      b.x - (a.x + a.w),
      a.x - (b.x + b.w),
      b.y - (a.y + a.d),
      a.y - (b.y + b.d),
    );
  it("stands the armchair loose, away from the walls", () => {
    const c = boxes[4]!;
    expect(
      Math.min(c.x, c.y, big.W - c.x - c.w, big.D - c.y - c.d),
    ).toBeGreaterThan(0);
  });
  it("keeps a walkway between every two of them", () => {
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(
          apart(boxes[i]!, boxes[j]!),
          `${items[i]!.name} and ${items[j]!.name}`,
        ).toBeGreaterThanOrEqual(big.rules.walkway);
  });
});

describe("past the walls, within reach", () => {
  const f = { w: 800, d: 400 };
  it("a drag flung far off stops within reach of the room", () => {
    // a 3D drag near the horizon meets the floor's plane metres away
    const to = settle({ x: 40000, y: -25000 }, f, room, false);
    expect(to.x + f.w).toBeLessThanOrEqual(room.W + REACH);
    expect(to.y).toBeGreaterThanOrEqual(-REACH);
  });
  it("a move just past a wall stands where it was put", () => {
    expect(settle({ x: 3700, y: 1000 }, f, room, false)).toEqual({
      x: 3700,
      y: 1000,
    });
  });
  it("a piece saved far outside comes back to the reach's edge", () => {
    const p = { ...piece("b", "Bench", f.w, f.d, 450), x: 9000, y: 1000 };
    const [at] = layoutRoom([p], room, 600);
    expect(at).toEqual({ x: room.W + REACH - f.w, y: 1000 });
  });
});
