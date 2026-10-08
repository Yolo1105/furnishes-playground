import { describe, expect, it } from "vitest";
import { blocksOf, wallTriangles } from "./wall-solid";

describe("blocksOf", () => {
  it("is the whole wall when nothing is cut from it", () => {
    expect(blocksOf(4, 2.6, [])).toEqual([{ x0: 0, x1: 4, y0: 0, y1: 2.6 }]);
  });
  it("leaves a doorway open to the floor and a window its sill", () => {
    const blocks = blocksOf(6, 2.6, [
      { x0: 1, x1: 1.9, y0: 0, y1: 2.1 },
      { x0: 3, x1: 4.5, y0: 0.9, y1: 2.2 },
    ]);
    expect(blocks).toEqual([
      { x0: 0, x1: 1, y0: 0, y1: 2.6 },
      { x0: 1, x1: 1.9, y0: 2.1, y1: 2.6 },
      { x0: 1.9, x1: 3, y0: 0, y1: 2.6 },
      { x0: 3, x1: 4.5, y0: 0, y1: 0.9 },
      { x0: 3, x1: 4.5, y0: 2.2, y1: 2.6 },
      { x0: 4.5, x1: 6, y0: 0, y1: 2.6 },
    ]);
  });
  it("clips an opening that runs past the wall's end", () => {
    expect(blocksOf(2, 2.6, [{ x0: 1.5, x1: 3, y0: 0, y1: 2.1 }])).toEqual([
      { x0: 0, x1: 1.5, y0: 0, y1: 2.6 },
      { x0: 1.5, x1: 2, y0: 2.1, y1: 2.6 },
    ]);
  });
});

describe("wallTriangles", () => {
  it("builds six faces a block, and runs the outer face past a convex corner", () => {
    const { positions, normals } = wallTriangles(
      [{ x0: 0, x1: 4, y0: 0, y1: 2.6 }],
      4,
      0.3,
      0.3,
      -0.3,
    );
    // six quads, two triangles each, three points each
    expect(positions.length).toBe(6 * 2 * 3 * 3);
    expect(normals.length).toBe(positions.length);
    const xs = Array.from(positions).filter((_, i) => i % 3 === 0);
    const zs = Array.from(positions).filter((_, i) => i % 3 === 2);
    // the outer face (z 0.3) starts a thickness before the inner and
    // stops a thickness short of it
    expect(Math.min(...xs)).toBeCloseTo(-0.3);
    expect(Math.max(...xs)).toBeCloseTo(4);
    expect(Math.max(...zs)).toBeCloseTo(0.3);
    const inner = Array.from(positions).filter(
      (_, i) => i % 3 === 0 && zs[Math.floor(i / 3)] === 0,
    );
    expect(Math.min(...inner)).toBeCloseTo(0);
  });
  it("mirrors the wall when its outside lies along -z, normals with it", () => {
    const { positions, normals } = wallTriangles(
      [{ x0: 0, x1: 1, y0: 0, y1: 1 }],
      1,
      0.2,
      0,
      0,
      -1,
    );
    const zs = Array.from(positions).filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(-0.2);
    expect(Math.max(...zs)).toBeCloseTo(0);
    // the inner face (z 0) faces +z, the inside of the room
    const innerNormalZ = Array.from(normals).filter(
      (_, i) =>
        i % 3 === 2 && positions[i]! === 0 && Math.abs(normals[i - 2]!) < 1e-6,
    );
    expect(innerNormalZ.some((z) => z > 0.99)).toBe(true);
  });
});
