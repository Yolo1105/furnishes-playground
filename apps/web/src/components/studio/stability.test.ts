import { describe, expect, it } from "vitest";
import { type Frame, hotRegions, shimmerOf, stillTest } from "./stability";

const frame = (
  w: number,
  h: number,
  at: (x: number, y: number) => number,
): Frame => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = at(x, y);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { w, h, data };
};

describe("a steady picture", () => {
  it("passes the still test when nothing moves past a step", () => {
    const frames = [0, 1, 0, 1].map((k) => frame(8, 8, () => 100 + k));
    expect(stillTest(frames).moved).toBe(0);
  });
  it("finds the pixel that keeps changing", () => {
    const frames = [0, 1, 2, 3].map((k) =>
      frame(8, 8, (x, y) => (x === 6 && y === 1 ? (k % 2) * 40 : 100)),
    );
    const t = stillTest(frames);
    expect(t.moved).toBeCloseTo(1 / 64);
    expect(t.worst).toBe(40);
    const [hot] = hotRegions(t.heat, 8, 8, 4, 1);
    expect(hot!.x).toBe(0.75);
    expect(hot!.y).toBe(0);
  });
  it("tells shimmer from a smooth move", () => {
    // a smooth ramp sliding one step a frame: no shimmer
    const smooth = [0, 1, 2, 3, 4].map((k) =>
      frame(16, 4, (x) => (x + k) * 10),
    );
    expect(shimmerOf(smooth).mean).toBeLessThan(1e-6);
    // one pixel blinking on and off over the same slide
    const blink = [0, 1, 2, 3, 4].map((k) =>
      frame(16, 4, (x, y) =>
        x === 3 && y === 2 && k % 2 ? 255 : (x + k) * 10,
      ),
    );
    expect(shimmerOf(blink).mean).toBeGreaterThan(1e-3);
  });
});
