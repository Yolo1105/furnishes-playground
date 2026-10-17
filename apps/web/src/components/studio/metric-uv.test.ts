import { defaultConfig, depthOf, products } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { grainShiftOf } from "./albedo";
import { furnishesForm } from "./furnishes-forms";
import { batchesOf, slabGeometry } from "./part-geometry";
import { WOOD_M } from "./textures";

/**
 * Round 10, Part 2: every board's texture in metres, the grain along
 * its longer side, and every board cut from its own place in the sheet,
 * so no two boards of a piece show the same patch of figure.
 */
const m = (mm: number) => mm / 1000;
const formOf = (id: string) => {
  const r = products.find((p) => p.id === id)!;
  return furnishesForm({
    recipe: r,
    size: [m(r.width), m(r.height), m(depthOf(r))],
    doors: true,
    accessories: defaultConfig(r).accessories,
    colours: ["#d9b98a"],
    seed: 7,
  });
};
const span = (g: ReturnType<typeof slabGeometry>, k: 0 | 1) => {
  const uv = g.getAttribute("uv");
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const v = k ? uv.getY(i) : uv.getX(i);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi - lo;
};

describe("a board's texture in metres", () => {
  it("one tile is WOOD_M of wood whatever the board's size", () => {
    for (const dims of [
      [0.8, 0.018, 0.4],
      [0.018, 2, 0.36],
      [1.6, 0.018, 0.6],
    ] as [number, number, number][]) {
      const g = slabGeometry(dims);
      const [long, short] = [...dims].sort((a, b) => b - a);
      // the largest span (the face's long side) along U, in tiles
      expect(span(g, 0)).toBeCloseTo(long! / WOOD_M, 1);
      expect(span(g, 1)).toBeCloseTo(short! / WOOD_M, 1);
    }
  });
});

describe("each board's cut from the sheet", () => {
  it("never repeats within a piece, for every recipe", () => {
    for (const r of products) {
      const boards = formOf(r.id).parts.filter((p) => "dims" in p);
      const keys = boards.map((b) =>
        grainShiftOf(b.at)
          .map((x) => x.toFixed(4))
          .join("/"),
      );
      expect(new Set(keys).size, r.id).toBe(keys.length);
    }
  });
  it("is laid into the merged batch: two boards of a size differ", () => {
    const f = { colour: "#d9b98a", rough: 0.6 };
    const dims: [number, number, number] = [0.76, 0.018, 0.36];
    const [b] = batchesOf([
      { f, at: [0, 0.3, 0], dims },
      { f, at: [0, 0.7, 0], dims },
    ]);
    const uv = b!.faces.getAttribute("uv");
    const [[a0, n], [b0]] = b!.ranges as [[number, number], [number, number]];
    let same = 0;
    for (let i = 0; i < n; i++)
      if (
        Math.abs(uv.getX(a0 + i) - uv.getX(b0 + i)) < 1e-6 &&
        Math.abs(uv.getY(a0 + i) - uv.getY(b0 + i)) < 1e-6
      )
        same++;
    expect(same).toBe(0);
  });
});
