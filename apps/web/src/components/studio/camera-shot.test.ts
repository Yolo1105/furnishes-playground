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
    expect(shotCorner(W, D, [chair], [-1, 1], 1, "z")).toEqual([1, 1]);
    // a window on an east or west wall keeps to that side along x
    expect(shotCorner(W, D, [chair], [-1, 1], 1, "x")).toEqual([-1, -1]);
    // nothing in the way: the photographed corner
    expect(shotCorner(W, D, [], [-1, 1], 1)).toEqual([-1, 1]);
  });
  it("walks in level", () => {
    const s = walkStart(W, D, 1.6, [1, 1]);
    expect(s.at[1]).toBeCloseTo(s.pos[1]);
  });
});
