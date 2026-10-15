import { describe, expect, it } from "vitest";
import { FOOT_HEIGHT } from "./bake-defaults";
import {
  RUG_BAND,
  RUG_CONTACT,
  RUG_H,
  rugContactGeometry,
  rugGeometry,
} from "./rug";

const W = 2;
const D = 1.4;
const sheet = rugGeometry(W, D, 3);
const at = (i: number) => {
  const p = sheet.getAttribute("position");
  return [p.getX(i), p.getY(i), p.getZ(i)] as const;
};
const all = Array.from(
  { length: sheet.getAttribute("position").count },
  (_, i) => i,
);
const toneOf = (i: number) => sheet.getAttribute("color").getX(i);
const inFrom = (i: number) => {
  const [x, , z] = at(i);
  return Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
};

describe("a rug as it lies on a floor (round 8, Part 5)", () => {
  it("lies as thick as a rug, its edge rolled down to a hair over the floor", () => {
    for (const i of all) {
      const [, y] = at(i);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(RUG_H + 1e-6);
      if (inFrom(i) < 1e-6) {
        expect(y).toBeLessThan(RUG_H / 4);
        expect(y).toBeGreaterThan(FOOT_HEIGHT);
      }
      if (inFrom(i) >= RUG_H) expect(y).toBeCloseTo(RUG_H, 6);
    }
    // its face looks up
    const n = sheet.getAttribute("normal");
    const mid = all.find((i) => inFrom(i) > 0.3)!;
    expect(n.getY(mid)).toBeGreaterThan(0.99);
  });
  it("has a darker band round its border, with a light line each side", () => {
    const { wide, line, inset } = RUG_BAND;
    const onLine = (e: number) =>
      [inset, wide - inset - line].some((a) => e >= a && e <= a + line);
    const band = all.filter((i) => {
      const e = inFrom(i);
      return e > RUG_H && e < wide - 0.001 && !onLine(e);
    });
    const field = all.filter((i) => inFrom(i) > RUG_BAND.wide + 0.01);
    const lines = all.filter((i) => onLine(inFrom(i)));
    const mean = (xs: number[]) =>
      xs.reduce((a, b) => a + toneOf(b), 0) / xs.length;
    expect(mean(band)).toBeLessThan(mean(field) * 0.9);
    expect(mean(lines)).toBeGreaterThan(mean(band) * 1.05);
    // the field's mottle is faint
    for (const i of field) expect(Math.abs(toneOf(i) - 1)).toBeLessThan(0.06);
  });
  it("is the same rug for the same size and seed", () => {
    expect(rugGeometry(W, D, 3)).toBe(sheet);
    expect(rugGeometry(W, D, 4)).not.toBe(sheet);
  });
  it("lays a soft shadow on the floor round its edge, looking up", () => {
    const g = rugContactGeometry(W, D);
    const p = g.getAttribute("position");
    const shade = g.getAttribute("shade");
    for (let i = 0; i < p.count; i++) {
      const out = Math.max(
        Math.abs(p.getX(i)) - W / 2,
        Math.abs(p.getZ(i)) - D / 2,
      );
      expect(shade.getX(i)).toBeCloseTo(out < 1e-6 ? RUG_CONTACT.dark : 0, 6);
    }
    const ix = g.getIndex()!;
    for (let t = 0; t < ix.count; t += 3) {
      const [a, b, c] = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
      const e1 = [p.getX(b) - p.getX(a), p.getZ(b) - p.getZ(a)];
      const e2 = [p.getX(c) - p.getX(a), p.getZ(c) - p.getZ(a)];
      // the cross product's y: up
      expect(e1[1]! * e2[0]! - e1[0]! * e2[1]!).toBeGreaterThan(0);
    }
  });
});
