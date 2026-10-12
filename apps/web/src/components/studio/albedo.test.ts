import { describe, expect, it } from "vitest";
import {
  DARKEST,
  LIGHTEST,
  plausible,
  PUREST,
  TONE_SPREAD,
  toned,
  toneOf,
} from "./albedo";
import { COLOURS, ROOM_ITEM_HEX } from "./piece-detail";

/** a hex's HSL lightness and saturation */
const ls = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const hi = Math.max(...c);
  const lo = Math.min(...c);
  const l = (hi + lo) / 2;
  const s = hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * l - 1));
  return { l, s };
};

describe("a colour as a real surface carries it", () => {
  it("draws a pure white, a pure black and a full hue inside the bounds", () => {
    for (const hex of ["#ffffff", "#000000", "#ff0000", "#00ff00", "#1e00ff"]) {
      const { l, s } = ls(plausible(hex));
      // a step of the 8-bit channels either side
      expect(l, hex).toBeLessThanOrEqual(LIGHTEST + 0.004);
      expect(l, hex).toBeGreaterThanOrEqual(DARKEST - 0.004);
      expect(s, hex).toBeLessThanOrEqual(PUREST + 0.01);
    }
  });
  it("keeps the palette's colours and the room items' tone as they are", () => {
    for (const c of COLOURS) expect(plausible(c.hex), c.name).toBe(c.hex);
    expect(plausible(ROOM_ITEM_HEX)).toBe(ROOM_ITEM_HEX);
  });
  it("keeps a colour's hue", () => {
    const red = plausible("#ff0000");
    const n = parseInt(red.slice(1), 16);
    expect(n >> 16).toBeGreaterThan((n >> 8) & 255);
    expect((n >> 8) & 255).toBe(n & 255);
  });
  it("gives each part a steady tone of its own, within the spread", () => {
    const ks = [
      [0, 0.2, 0],
      [0.4, 0.2, 0],
      [0.8, 0.2, 0.1],
      [1.2, 0.45, -0.3],
    ].map(toneOf);
    for (const k of ks) {
      expect(k).toBeGreaterThanOrEqual(1 - TONE_SPREAD);
      expect(k).toBeLessThanOrEqual(1 + TONE_SPREAD);
    }
    expect(new Set(ks).size).toBe(ks.length);
    expect(toneOf([0.4, 0.2, 0])).toBe(ks[1]);
    expect(toned("#808080", 1.1)).toBe("#8d8d8d");
    expect(toned("#ffffff", 1.1)).toBe("#ffffff");
  });
});
