import { describe, expect, it } from "vitest";
import {
  ALBEDO,
  CLOTH_PUREST,
  clothColour,
  DARKEST,
  LIGHTEST,
  luminanceOf,
  plausible,
  variedWood,
  WOOD_SPREAD,
  PUREST,
  rugColour,
  RUG_PUREST,
  TONE_SPREAD,
  toned,
  toneOf,
} from "./albedo";
import { COLOURS, LIGHT_WOOD_HEX, ROOM_ITEM_HEX } from "./piece-detail";
import { FLOOR_TONES, WALL_TONES } from "./room-data";

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

describe("every finish within a real surface's albedo (round 8, 1c)", () => {
  const presets = [
    ...COLOURS.map((c) => c.hex),
    ROOM_ITEM_HEX,
    LIGHT_WOOD_HEX,
    ...Object.values(FLOOR_TONES),
    ...WALL_TONES.map((t) => t.hex),
  ];
  it("draws every preset between a black's and a white paint's", () => {
    for (const hex of presets) {
      const y = luminanceOf(plausible(hex));
      expect(y, hex).toBeGreaterThanOrEqual(ALBEDO.least - 0.002);
      expect(y, hex).toBeLessThanOrEqual(ALBEDO.most + 0.002);
    }
  });
  it("holds a pure white under 0.83 and a pure black over 0.035", () => {
    expect(luminanceOf(plausible("#ffffff"))).toBeLessThanOrEqual(
      ALBEDO.most + 0.002,
    );
    expect(luminanceOf(plausible("#000000"))).toBeGreaterThanOrEqual(
      ALBEDO.least - 0.002,
    );
    expect(luminanceOf(plausible("#000000"))).toBeLessThan(0.08);
  });
  it("keeps a cloth's dye less pure than a paint's", () => {
    const orange = clothColour("#e8641e");
    expect(ls(orange).s).toBeLessThanOrEqual(CLOTH_PUREST + 0.01);
    // a soft colour already within it stays as it is
    expect(clothColour("#c9bfb2")).toBe("#c9bfb2");
  });
  it("turns two pieces of one wood a little apart, the same each time", () => {
    const a = variedWood(LIGHT_WOOD_HEX, 1);
    const b = variedWood(LIGHT_WOOD_HEX, 2);
    expect(variedWood(LIGHT_WOOD_HEX, 1)).toBe(a);
    expect(a).not.toBe(b);
    for (const seed of [1, 2, 3, 99, 12345]) {
      const y = luminanceOf(variedWood(LIGHT_WOOD_HEX, seed));
      const y0 = luminanceOf(LIGHT_WOOD_HEX);
      // ±6 % of lightness is a little more of luminance: within a fifth
      expect(Math.abs(y / y0 - 1)).toBeLessThan(WOOD_SPREAD.value * 3);
    }
  });
});

describe("a rug's calmer dye (round 9, Part 3)", () => {
  it("holds a rug's saturation under a cloth's", () => {
    // a loud terracotta: a cloth keeps more of it than a rug does
    const loud = "#c0502a";
    const sat = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
      const hi = Math.max(...c);
      const lo = Math.min(...c);
      const l = (hi + lo) / 2;
      return hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * l - 1));
    };
    expect(sat(rugColour(loud))).toBeLessThanOrEqual(RUG_PUREST + 0.01);
    expect(sat(clothColour(loud))).toBeGreaterThan(sat(rugColour(loud)));
    // a calm one comes back as it was
    expect(rugColour("#8a8178")).toBe("#8a8178");
  });
});
