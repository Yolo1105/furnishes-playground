import { describe, expect, it } from "vitest";
import {
  blocksOf,
  CAP,
  cornerEnd,
  CUT_END,
  OUTER_IN,
  PLASTER,
  REVEAL,
  wallTriangles,
} from "./wall-solid";

const CUT = [CUT_END, CUT_END] as const;

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
  it("builds six faces a block, square at both ends: on through a convex corner it takes, short of a concave one it does not", () => {
    const { positions, normals } = wallTriangles(
      [{ x0: 0, x1: 4, y0: 0, y1: 2.6 }],
      4,
      0.3,
      [cornerEnd(0.3, true), cornerEnd(-0.3, false)],
    );
    // six quads, two triangles each, three points each
    expect(positions.length).toBe(6 * 2 * 3 * 3);
    expect(normals.length).toBe(positions.length);
    const xs = Array.from(positions).filter((_, i) => i % 3 === 0);
    const zs = Array.from(positions).filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBeCloseTo(0.3);
    // both faces run a thickness before the inner corner and stop a
    // thickness short of the concave one: every point at one of the
    // two ends, so no end is slanted
    const ends = [...new Set(xs.map((x) => x.toFixed(4)))].sort();
    expect(ends).toEqual(["-0.3000", "3.7000"]);
  });

  it("draws a corner's lines where the solid's outline is, not across the joint", () => {
    const block = [{ x0: 0, x1: 4, y0: 0, y1: 2.6 }];
    const segments = (lines: Float32Array) => {
      const out: number[][] = [];
      for (let i = 0; i < lines.length; i += 6)
        out.push(Array.from(lines.slice(i, i + 6)));
      return out;
    };
    // the lines are Float32: compared to a ten-thousandth
    const near = (p: number | undefined, q: number) =>
      Math.abs((p ?? NaN) - q) < 1e-4;
    const top = (lines: Float32Array) =>
      segments(lines).filter((l) => near(l[1], 2.6) && near(l[4], 2.6));
    // the owner of a convex corner at its end: its inner top edge stops
    // at the inner corner (past it lies the other wall's top), its outer
    // edge and its end run to the outer corner
    const owner = wallTriangles(
      block,
      4,
      0.3,
      [CUT_END, cornerEnd(0.3, true)],
      1,
      2.6,
    );
    const ownerTop = top(owner.capLines);
    const along = (z: number) =>
      ownerTop.find((l) => near(l[2], z) && near(l[5], z) && l[0] !== l[3])!;
    expect(Math.max(along(0)[0]!, along(0)[3]!)).toBeCloseTo(4);
    // (the outer face a hair in, off the face of the room beyond)
    const outer = along(0.3 - OUTER_IN);
    expect(Math.max(outer[0]!, outer[3]!)).toBeCloseTo(4.3);
    expect(
      ownerTop.some((l) => l[0]! > 4.29 && l[3]! > 4.29 && l[2] !== l[5]),
    ).toBe(true);
    // its end is plaster, the corner's own face, not a cut
    const plaster = owner.groups.find((g) => g.materialIndex === PLASTER)!;
    expect(plaster.count).toBe(3 * 6);
    // the other wall stops square at the inner corner and draws no line
    // across the joint; with the owner down, its end is seen
    const other = wallTriangles(
      block,
      4,
      0.3,
      [cornerEnd(0.3, false), CUT_END],
      1,
      2.6,
    );
    expect(top(other.capLines).some((l) => l[0] === 0 && l[3] === 0)).toBe(
      false,
    );
    const open = wallTriangles(
      block,
      4,
      0.3,
      [cornerEnd(0.3, false, true), CUT_END],
      1,
      2.6,
    );
    expect(top(open.capLines).some((l) => l[0] === 0 && l[3] === 0)).toBe(true);
  });
  it("mirrors the wall when its outside lies along -z, normals with it", () => {
    const { positions, normals } = wallTriangles(
      [{ x0: 0, x1: 1, y0: 0, y1: 1 }],
      1,
      0.2,
      CUT,
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

  it("groups the faces by material: plaster on the faces, the reveal inside an opening, the cap on the top and the ends; the cap's edges as lines", () => {
    const h = 2.6;
    const blocks = blocksOf(4, h, [{ x0: 1, x1: 2, y0: 0.9, y1: 2.1 }]);
    const tri = wallTriangles(blocks, 4, 0.1, CUT, 1, h);
    const byGroup = Object.fromEntries(
      tri.groups.map((g) => [g.materialIndex, g.count]),
    );
    // every block has two plaster faces; the window's head and sill,
    // the two jambs beside it and the four hidden faces where the
    // sill and head blocks meet their neighbours are reveals; the three
    // tops at the wall's height, the three bottoms and the wall's two
    // ends are caps
    expect(byGroup[PLASTER]).toBe(blocks.length * 2 * 6);
    expect(byGroup[REVEAL]).toBe(8 * 6);
    expect(byGroup[CAP]).toBe(8 * 6);
    expect(tri.colors.length).toBe(tri.positions.length);
    expect(tri.capLines.length).toBeGreaterThan(0);
    // a run that meets the next run of its wall at both ends: its two
    // end faces are joints, not cuts, and draw no lines there (a line
    // on the next run's face flickered through it)
    const joined = wallTriangles(blocks, 4, 0.1, CUT, 1, h, undefined, [
      true,
      true,
    ]);
    const joinedGroups = Object.fromEntries(
      joined.groups.map((g) => [g.materialIndex, g.count]),
    );
    expect(joinedGroups[CAP]).toBe(6 * 6);
    expect(joinedGroups[REVEAL]).toBe(10 * 6);
    // each end face drew its top edge alone, two points of three numbers
    expect(joined.capLines.length).toBe(tri.capLines.length - 2 * 6);
    // a cut at waist height leaves no reveal above the sill
    const low = wallTriangles(
      blocksOf(4, 1.1, [{ x0: 1, x1: 2, y0: 0.9, y1: 2.1 }]),
      4,
      0.1,
      CUT,
      1,
      1.1,
    );
    expect(low.groups.find((g) => g.materialIndex === REVEAL)?.count).toBe(
      5 * 6,
    );
  });

  it("divides the inner face at the shading's lines and colours it by the shading", () => {
    const tri = wallTriangles(
      [{ x0: 0, x1: 4, y0: 0, y1: 2.6 }],
      4,
      0.1,
      CUT,
      1,
      2.6,
      {
        grade: (x, y) => [y / 2.6, x / 4, 1],
        xs: [1, 3],
        ys: [1.3],
      },
    );
    const plaster = tri.groups.find((g) => g.materialIndex === PLASTER)!;
    // the inner face in six cells, the outer face in one
    expect(plaster.count).toBe((6 + 1) * 6);
    // a corner at the top takes the shading's colour there
    const reds = [...tri.colors].filter((_, i) => i % 3 === 0);
    expect(Math.max(...reds)).toBeCloseTo(1);
    expect(Math.min(...reds)).toBeCloseTo(0);
  });
});
