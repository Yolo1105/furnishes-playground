import { describe, expect, it } from "vitest";
import {
  ATLAS,
  bookLayout,
  booksGeometry,
  PAGE_CELLS,
  pageCell,
  type Run,
  SPINE_CELLS,
} from "./books";

const shelf = (seed: number): Run => ({
  x0: -0.3,
  y: 0.4,
  bayW: 0.6,
  z: 0,
  deep: 0.3,
  room: 0.36,
  seed,
});
const runs = Array.from({ length: 60 }, (_, i) => bookLayout(shelf(i + 1)));

describe("books on a shelf", () => {
  it("cuts 30 to 50 spines from one picture, none past its edge", () => {
    expect(SPINE_CELLS.length).toBeGreaterThanOrEqual(30);
    expect(SPINE_CELLS.length).toBeLessThanOrEqual(50);
    for (const c of [...SPINE_CELLS, pageCell(PAGE_CELLS - 1)]) {
      expect(c.x + c.w).toBeLessThanOrEqual(ATLAS);
      expect(c.y + c.h).toBeLessThanOrEqual(ATLAS);
    }
  });
  it("stands books of real sizes within the shelf", () => {
    for (const books of runs)
      for (const b of books) {
        if (!b.flat) {
          expect(b.h).toBeGreaterThanOrEqual(0.15);
          expect(b.h).toBeLessThanOrEqual(0.3);
          expect(b.h).toBeLessThanOrEqual(0.36);
        }
        expect(b.t).toBeGreaterThanOrEqual(0.012);
        expect(b.t).toBeLessThanOrEqual(0.06);
        expect(b.d).toBeLessThanOrEqual(0.3);
        // along the shelf a standing book spans its thickness, a flat
        // one its height
        const half = (b.flat ? b.h : b.t) / 2;
        expect(b.x - half).toBeGreaterThanOrEqual(-0.3);
        expect(b.x + half).toBeLessThanOrEqual(0.3 + 1e-9);
      }
  });
  it("varies heights and leaves the last one leaning a few degrees", () => {
    const standing = runs.filter((r) => r.length > 2 && !r[0]!.flat);
    expect(standing.length).toBeGreaterThan(20);
    const heights = new Set(standing.flat().map((b) => b.h.toFixed(3)));
    expect(heights.size).toBeGreaterThan(30);
    const leaning = standing.filter((r) => r[r.length - 1]!.lean > 0);
    expect(leaning.length).toBeGreaterThan(standing.length / 2);
    for (const r of leaning) {
      const a = (r[r.length - 1]!.lean * 180) / Math.PI;
      expect(a).toBeGreaterThanOrEqual(3);
      expect(a).toBeLessThanOrEqual(8);
      // only the last leans
      expect(r.slice(0, -1).every((b) => b.lean === 0)).toBe(true);
    }
  });
  it("lays a stack flat on some shelves, each book on the one below", () => {
    const flat = runs.filter((r) => r[0]?.flat);
    expect(flat.length).toBeGreaterThan(5);
    for (const r of flat)
      for (let i = 1; i < r.length; i++)
        expect(r[i]!.y).toBeCloseTo(r[i - 1]!.y + r[i - 1]!.t, 6);
  });
  it("draws a shelf as one geometry, its faces turned out", () => {
    const books = runs.find((r) => r.length > 3 && !r[0]!.flat)!;
    const g = booksGeometry(books)!;
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    // every triangle winds the way its normal points
    for (let i = 0; i < pos.count; i += 3) {
      const p = [0, 1, 2].map((k) => [
        pos.getX(i + k),
        pos.getY(i + k),
        pos.getZ(i + k),
      ]);
      const e1 = p[1]!.map((v, k) => v - p[0]![k]!);
      const e2 = p[2]!.map((v, k) => v - p[0]![k]!);
      const n = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const dot =
        n[0]! * nor.getX(i) + n[1]! * nor.getY(i) + n[2]! * nor.getZ(i);
      expect(dot).toBeGreaterThan(0);
    }
    const flat = runs.find((r) => r[0]?.flat)!;
    expect(booksGeometry(flat)!.getAttribute("position").count).toBeGreaterThan(
      0,
    );
  });
});
