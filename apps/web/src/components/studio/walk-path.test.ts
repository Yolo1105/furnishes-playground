import { describe, expect, it } from "vitest";
import {
  alongPath,
  clearLine,
  findPath,
  pathLength,
  type Free,
} from "./walk-path";

/** two rooms side by side, 4 m each, a wall between them at x 0 with a
    doorway from z 1 to z 2, and a 1 m block in the middle of the left */
const BOUNDS = { x0: -4, z0: 0, x1: 4, z1: 4 };
const WALL = 0.1;
const rooms: Free = (x, z) => {
  if (x < -4 || x > 4 || z < 0 || z > 4) return false;
  if (Math.abs(x) < WALL) return z > 1 && z < 2;
  return true;
};
const withBlock: Free = (x, z) =>
  rooms(x, z) && !(x > -2.5 && x < -1.5 && z > 1.5 && z < 2.5);

describe("findPath", () => {
  it("goes straight across an open room", () => {
    const p = findPath({ x: -3.5, z: 0.5 }, { x: -0.5, z: 3.5 }, rooms, BOUNDS);
    expect(p).not.toBeNull();
    expect(p).toHaveLength(2);
    expect(pathLength(p!)).toBeCloseTo(Math.hypot(3, 3), 5);
  });
  it("goes through the doorway to the next room", () => {
    const p = findPath({ x: -2, z: 3.5 }, { x: 2, z: 3.5 }, rooms, BOUNDS)!;
    expect(p).not.toBeNull();
    // every leg is clear, and some point of it is in the doorway
    for (let i = 1; i < p.length; i++)
      expect(clearLine(p[i - 1]!, p[i]!, rooms)).toBe(true);
    expect(
      p.some((s) => Math.abs(s.x) < 0.3 && s.z > 1 && s.z < 2) ||
        p.some(
          (s, i) =>
            i > 0 &&
            Math.sign(s.x) !== Math.sign(p[i - 1]!.x) &&
            Math.min(s.z, p[i - 1]!.z) < 2,
        ),
    ).toBe(true);
    expect(pathLength(p)).toBeGreaterThan(4);
  });
  it("goes round a piece in the way", () => {
    const p = findPath(
      { x: -3.5, z: 2 },
      { x: -0.5, z: 2 },
      withBlock,
      BOUNDS,
    )!;
    expect(p.length).toBeGreaterThan(2);
    for (let i = 1; i < p.length; i++)
      expect(clearLine(p[i - 1]!, p[i]!, withBlock)).toBe(true);
  });
  it("stops at the nearest standing room to a point on a piece", () => {
    const p = findPath({ x: -3.5, z: 2 }, { x: -2, z: 2 }, withBlock, BOUNDS)!;
    const end = p[p.length - 1]!;
    expect(withBlock(end.x, end.z)).toBe(true);
    expect(Math.hypot(end.x + 2, end.z - 2)).toBeLessThan(0.75);
  });
  it("finds no way into a shut room", () => {
    const shut: Free = (x, z) => rooms(x, z) && Math.abs(x) >= WALL;
    expect(findPath({ x: -2, z: 2 }, { x: 2, z: 2 }, shut, BOUNDS)).toBeNull();
  });
});

describe("alongPath", () => {
  it("walks the legs in turn, facing along each", () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 0, z: -2 },
      { x: 2, z: -2 },
    ];
    const a = alongPath(pts, 1);
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(-1);
    // towards −z: the camera's own forward
    expect(a.yaw).toBeCloseTo(0);
    const b = alongPath(pts, 3);
    expect(b.x).toBeCloseTo(1);
    expect(b.z).toBeCloseTo(-2);
    expect(b.yaw).toBeCloseTo(-Math.PI / 2);
    const end = alongPath(pts, 10);
    expect(end.x).toBeCloseTo(2);
  });
});
