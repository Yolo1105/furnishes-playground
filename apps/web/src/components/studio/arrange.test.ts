import { describe, expect, it } from "vitest";
import { turnAbout } from "./piece-detail";
import { againstWall, wallGaps } from "./room-layout";
import { useScene } from "./scene-store";

/**
 * The picked piece's bar: Against wall turns a piece's back to the
 * nearest wall and sets it flush there; a turn keeps the piece's
 * middle; the readout while dragging is the distance to the walls;
 * Duplicate sets a second beside it, numbered after its name.
 */
const box = (W: number, D: number) =>
  [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ] as const;
const sofa = { width: 2000, depth: 900, rotation: 0 };

describe("against the wall", () => {
  it("turns the back to the nearest wall and stands flush", () => {
    // nearest the east wall of a 4 m by 3 m room
    const to = againstWall({ x: 2500, y: 1000 }, sofa, box(4000, 3000))!;
    expect(to.rotation).toBe(90);
    // turned, the sofa is 900 wide on the plan, flush to x = 4000
    expect(to.x).toBe(4000 - 900);
    // its middle stays where it was along the wall
    expect(to.y + 1000).toBe(1000 + 450);
    // nearest the south wall
    const south = againstWall({ x: 1000, y: 2000 }, sofa, box(4000, 3000))!;
    expect(south).toEqual({ x: 1000, y: 3000 - 900, rotation: 180 });
    // nearest the north wall
    const north = againstWall({ x: 1500, y: 100 }, sofa, box(4000, 3000))!;
    expect(north).toEqual({ x: 1500, y: 0, rotation: 0 });
    // past the north-east corner, nearest the east wall: turned along
    // it and kept within its length
    const east = againstWall({ x: 3500, y: -100 }, sofa, box(4000, 3000))!;
    expect(east).toEqual({ x: 4000 - 900, y: 0, rotation: 90 });
  });

  it("finds the near wall of an L", () => {
    // an L: the notch's wall at y = 2000 runs from x = 2000 to 4000
    const l = [
      [0, 0],
      [4000, 0],
      [4000, 2000],
      [2000, 2000],
      [2000, 4000],
      [0, 4000],
    ] as const;
    const to = againstWall({ x: 2600, y: 1300 }, sofa, l)!;
    expect(to.rotation).toBe(180);
    expect(to.y).toBe(2000 - 900);
  });
});

describe("a turn about the middle", () => {
  it("keeps the middle where it was", () => {
    const p = { ...sofa, height: 800 } as Parameters<typeof turnAbout>[1];
    const t = turnAbout({ x: 1000, y: 1000 }, p, 90);
    // 2000 × 900 about (2000, 1450) turned: 900 × 2000 about the same
    expect(t).toEqual({ rotation: 90, x: 2000 - 450, y: 1450 - 1000 });
    expect(turnAbout({ x: 0, y: 0 }, p, -90).rotation).toBe(270);
  });
});

describe("the distance to the walls", () => {
  it("is the nearest wall each way, none past the walls", () => {
    const g = wallGaps(
      { x: 300, y: 1000 },
      { w: 900, d: 600 },
      box(4000, 3000),
    );
    expect(g).toEqual({ across: 300, along: 1000 });
    const past = wallGaps(
      { x: -200, y: 1000 },
      { w: 900, d: 600 },
      box(4000, 3000),
    );
    // past the west wall, the east one is the nearest it stands inside
    expect(past.across).toBe(4000 - 700);
  });
});

describe("duplicate", () => {
  it("sets a second beside the piece, picked, numbered after its name", () => {
    const s = useScene.getState();
    const n = s.groups.flatMap((g) => g.items).find((x) => x.kind === "piece")!;
    const before = s.groups.flatMap((g) => g.items).length;
    const id = s.duplicate(n.id, { x: 1234, y: 567 })!;
    const after = useScene.getState();
    const all = after.groups.flatMap((g) => g.items);
    expect(all.length).toBe(before + 1);
    const copy = all.find((x) => x.id === id)!;
    expect(copy.name.startsWith(n.name.replace(/ \d+$/, ""))).toBe(true);
    expect(copy.name).not.toBe(n.name);
    expect(after.selectedId).toBe(id);
    expect(after.overrides[id]).toMatchObject({ x: 1234, y: 567 });
    // one undo takes it out again
    after.undo();
    expect(useScene.getState().groups.flatMap((g) => g.items).length).toBe(
      before,
    );
  });
});
