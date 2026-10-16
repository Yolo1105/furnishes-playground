import { describe, expect, it } from "vitest";
import { compareRegions, GI_GRID, regionMeans, type Picture } from "./gi-check";

const picture = (
  w: number,
  h: number,
  at: (x: number, y: number) => number,
): Picture => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = at(x, y);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { w, h, data };
};

describe("the bounce check (round 9, Part 4)", () => {
  it("cuts a picture into its regions", () => {
    // bright on the left half, dark on the right
    const p = picture(40, 30, (x) => (x < 20 ? 200 : 50));
    const m = regionMeans(p);
    expect(m.length).toBe(GI_GRID.cols * GI_GRID.rows);
    expect(m[0]).toBeGreaterThan(m[3]! * 5);
  });

  it("weighs where the light falls, not the exposure", () => {
    const traced = regionMeans(picture(40, 30, (x) => 40 + x * 4));
    // the same picture a stop brighter passes
    const brighter = regionMeans(
      picture(40, 30, (x) => Math.min(255, (40 + x * 4) * 1.37)),
    );
    expect(compareRegions(brighter, traced).worst).toBeLessThan(0.08);
    // light fallen the other way fails
    const flipped = regionMeans(picture(40, 30, (x) => 40 + (39 - x) * 4));
    const c = compareRegions(flipped, traced);
    expect(c.pass).toBe(false);
    expect(c.worst).toBeGreaterThan(0.15);
  });
});
