import { describe, expect, it } from "vitest";
import {
  type Box,
  cornerShot,
  nearestInShot,
  SHOT,
  shotCorner,
  walkStart,
} from "./camera-bookmarks";

/** a room 5.7 m × 6.3 m, as the living room */
const W = 5.7;
const D = 6.3;

describe("the room as a photograph takes it", () => {
  it("stands level in the corner, the frame shifted down", () => {
    const p = cornerShot(W, D, [1, 1], 1);
    expect(p.pos[1]).toBe(SHOT.height);
    // level: it looks at its own height, so the verticals stay vertical
    expect(p.at[1]).toBe(p.pos[1]);
    expect(p.shift).toBeGreaterThanOrEqual(0.1);
    expect(p.shift).toBeLessThanOrEqual(0.15);
    expect(p.pos[0]).toBeCloseTo(W / 2 - SHOT.inset);
    expect(p.pos[2]).toBeCloseTo(D / 2 - SHOT.inset);
  });
  it("sees a piece in the frame and not one behind it", () => {
    // a chair a metre into the room along the diagonal, and one behind
    // the camera's own wall line
    const ahead: Box = { x: W / 2 - 1.2, z: D / 2 - 1.2, w: 0.6, d: 0.6 };
    const aside: Box = { x: -W / 2 + 0.3, z: D / 2 - 0.3, w: 0.6, d: 0.6 };
    expect(nearestInShot(W, D, [1, 1], [ahead], 1)).toBeLessThan(1.2);
    // seen from the other south corner it is far
    expect(nearestInShot(W, D, [-1, 1], [ahead], 1)).toBeGreaterThan(3);
    expect(nearestInShot(W, D, [1, 1], [aside], 1)).toBeGreaterThan(4);
  });
  it("keeps to the window's side while a corner there is clear", () => {
    const chair: Box = { x: -W / 2 + 0.8, z: D / 2 - 0.8, w: 0.6, d: 0.6 };
    // the photographed corner (south-west) is blocked: its neighbour on
    // the same side (south-east) comes next, not the north
    expect(shotCorner(W, D, [chair], [-1, 1], 1, "z").corner).toEqual([1, 1]);
    // a window on an east or west wall keeps to that side along x
    expect(shotCorner(W, D, [chair], [-1, 1], 1, "x").corner).toEqual([-1, -1]);
    // nothing in the way: the photographed corner, square
    expect(shotCorner(W, D, [], [-1, 1], 1)).toEqual({
      corner: [-1, 1],
      framing: { slide: 0, lens: 1, along: "x" },
    });
  });
  it("steps along its wall rather than turning from the window", () => {
    // the living room as the first project furnishes it: dining chairs
    // by the south-west corner and a plant by the south-east, a window
    // on the north wall (the Corner view turned its back on the window)
    const boxes: Box[] = [
      { x: 0.25, z: 2.95, w: 1.8, d: 0.4 },
      { x: 2.65, z: 1.85, w: 0.4, d: 0.6 },
      { x: 0.1, z: 0.05, w: 0.9, d: 2.4 },
      { x: 1.45, z: 1.675, w: 0.8, d: 0.85 },
      { x: -2.01, z: 1.675, w: 0.48, d: 0.45 },
      { x: -2.01, z: 2.175, w: 0.48, d: 0.45 },
      { x: -0.66, z: 1.675, w: 0.48, d: 0.45 },
      { x: -0.66, z: 2.175, w: 0.48, d: 0.45 },
      { x: -1.35, z: 1.85, w: 0.8, d: 1.2 },
    ];
    expect(nearestInShot(W, D, [-1, 1], boxes, 1)).toBeLessThan(SHOT.clear);
    expect(nearestInShot(W, D, [1, 1], boxes, 1)).toBeLessThan(SHOT.clear);
    const s = shotCorner(W, D, boxes, [-1, 1], 1, "z");
    // still facing the window (south side, looking north)
    expect(s.corner[1]).toBe(1);
    expect(s.framing.slide > 0 || s.framing.lens < 1).toBe(true);
    // a room without a window may turn to a clear corner across
    const across = shotCorner(W, D, boxes, [-1, 1], 1, "z", false);
    expect(
      nearestInShot(W, D, across.corner, boxes, 1, across.framing),
    ).toBeGreaterThanOrEqual(SHOT.clear);
  });
  it("walks in level", () => {
    const s = walkStart(W, D, 1.6, [1, 1]);
    expect(s.at[1]).toBeCloseTo(s.pos[1]);
  });
});
