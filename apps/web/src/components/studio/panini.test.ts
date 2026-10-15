import { describe, expect, it } from "vitest";
import { fromPanini, PANINI, paniniPicture, toPanini } from "./panini";

describe("the photo's Panini lens", () => {
  it("is the pinhole at no strength, and goes there and back at any", () => {
    for (const [x, y] of [
      [0.3, -0.2],
      [-0.9, 0.5],
      [1.2, 0.4],
    ] as const) {
      const [h0, v0] = toPanini(x, y, 0);
      expect(h0).toBeCloseTo(x, 9);
      expect(v0).toBeCloseTo(y, 9);
      const [h, v] = toPanini(x, y, PANINI);
      const [bx, by] = fromPanini(h, v, PANINI);
      expect(bx).toBeCloseTo(x, 9);
      expect(by).toBeCloseTo(y, 9);
    }
  });
  it("eases the stretch at the frame's sides", () => {
    // a point near the side lands nearer the middle than the pinhole has it
    expect(toPanini(1.2, 0, PANINI)[0]).toBeLessThan(1.2);
    expect(toPanini(0.05, 0, PANINI)[0]).toBeCloseTo(0.05, 3);
  });
  it("keeps a vertical vertical, and fills the frame", () => {
    // a picture of vertical stripes, a column a colour
    const w = 64;
    const h = 36;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const o = (j * w + i) * 4;
        src[o] = i * 4;
        src[o + 1] = 128;
        src[o + 2] = 0;
        src[o + 3] = 255;
      }
    const out = paniniPicture(src, w, h, (60 * Math.PI) / 180);
    for (let i = 0; i < w; i++) {
      const top = out[i * 4]!;
      const bottom = out[((h - 1) * w + i) * 4]!;
      expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1);
    }
    // the middle stays the middle, and nothing comes up empty
    expect(
      Math.abs(
        out[((h / 2) * w + w / 2) * 4]! - src[((h / 2) * w + w / 2) * 4]!,
      ),
    ).toBeLessThanOrEqual(4);
    for (let k = 3; k < out.length; k += 4) expect(out[k]).toBe(255);
  });
});
