import { describe, expect, it } from "vitest";
import type { Run } from "./books";
import { shelfObjectsGeometry } from "./shelf-objects";
import { dressShelves, SPARE_SHARE } from "./shelf-style";

/** a bookcase's shelves: six, 760 mm across, 320 mm apart */
const shelves = (seed: number): Run[] =>
  Array.from({ length: 6 }, (_, i) => ({
    x0: -0.38,
    y: 0.1 + i * 0.34,
    bayW: 0.76,
    z: -0.02,
    deep: 0.26,
    room: 0.32,
    seed: seed * 10 + i,
  }));
const pieces = Array.from({ length: 60 }, (_, p) =>
  dressShelves(shelves(p + 1), p + 1),
);
const all = pieces.flat();

describe("the shelf stylist (round 8, Part 4)", () => {
  it("dresses a piece the same every time", () => {
    expect(dressShelves(shelves(3), 3)).toEqual(dressShelves(shelves(3), 3));
    expect(dressShelves(shelves(3), 3)).not.toEqual(
      dressShelves(shelves(3), 4),
    );
  });
  it("sets things in odd numbers, no two neighbours alike", () => {
    for (const d of all) {
      if (d.group.length > 0) expect(d.group.length % 2).toBe(1);
      for (let i = 1; i < d.group.length; i++)
        expect(d.group[i]).not.toBe(d.group[i - 1]);
      expect(d.books.length + d.objects.length).toBe(d.group.length);
    }
  });
  it("mixes books standing and flat with vases, plants and boxes", () => {
    const kinds = new Set(all.flatMap((d) => d.group));
    for (const k of ["books", "stack", "vase", "plant", "box"] as const)
      expect(kinds).toContain(k);
    expect(all.filter((d) => d.group.length >= 3).length).toBeGreaterThan(
      all.length / 3,
    );
  });
  it("turns each object 5° to 15° off square", () => {
    for (const o of all.flatMap((d) => d.objects)) {
      const deg = (Math.abs(o.turn) * 180) / Math.PI;
      expect(deg).toBeGreaterThanOrEqual(5);
      expect(deg).toBeLessThanOrEqual(15);
    }
  });
  it("leaves about one shelf in three empty or nearly so", () => {
    const spare = all.filter((d) => d.group.length <= 1).length / all.length;
    expect(spare).toBeGreaterThanOrEqual(SPARE_SHARE - 0.05);
    expect(spare).toBeLessThanOrEqual(SPARE_SHARE + 0.12);
    expect(all.some((d) => d.group.length === 0)).toBe(true);
  });
  it("keeps everything on its shelf and under the one above", () => {
    pieces.forEach((piece, p) =>
      piece.forEach((d, i) => {
        const s = shelves(p + 1)[i]!;
        for (const o of d.objects) {
          expect(o.x - o.w / 2).toBeGreaterThanOrEqual(s.x0 - 1e-9);
          expect(o.x + o.w / 2).toBeLessThanOrEqual(s.x0 + s.bayW + 1e-9);
          expect(o.h).toBeLessThan(s.room);
          expect(o.y).toBe(s.y);
        }
        for (const b of d.books) {
          expect(b.x0).toBeGreaterThanOrEqual(s.x0 - 1e-9);
          expect(b.x0 + b.bayW).toBeLessThanOrEqual(s.x0 + s.bayW + 1e-9);
        }
      }),
    );
  });
  it("sets no books on a shelf too low for them, and nothing on one too low for anything", () => {
    const low = (room: number) =>
      dressShelves(
        shelves(5).map((s) => ({ ...s, room })),
        5,
      );
    for (const d of low(0.16))
      expect(d.group.filter((k) => k === "books" || k === "stack")).toEqual([]);
    for (const d of low(0.08)) expect(d.group).toEqual([]);
  });
  it("draws a piece's objects as one mesh with their colours and roughness", () => {
    const objects = all.flatMap((d) => d.objects).slice(0, 12);
    const g = shelfObjectsGeometry(objects)!;
    expect(g.getAttribute("color").count).toBe(
      g.getAttribute("position").count,
    );
    expect(g.getAttribute("rough").count).toBe(
      g.getAttribute("position").count,
    );
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(
      Math.min(...objects.map((o) => o.y)) - 1e-6,
    );
    expect(shelfObjectsGeometry([])).toBeNull();
  });
});
