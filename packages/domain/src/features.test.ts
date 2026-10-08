import { describe, expect, it } from "vitest";
import {
  backGroove,
  featureLabel,
  featureMark,
  featureRect,
  hingeCups,
  innerFace,
  middleCutout,
  onFace,
  SYSTEM,
  systemHoles,
} from "./features";

const side = { length: 400, width: 740 };

describe("systemHoles", () => {
  it("drills two rows at the system's pitch, in from each long edge", () => {
    const holes = systemHoles(side);
    const us = new Set(holes.map((h) => h.u));
    expect([...us]).toEqual([SYSTEM.inset, side.length - SYSTEM.inset]);
    const vs = holes.filter((h) => h.u === SYSTEM.inset).map((h) => h.v);
    expect(vs[0]).toBe(SYSTEM.pitch);
    expect(vs[1]! - vs[0]!).toBe(SYSTEM.pitch);
    expect(vs.at(-1)!).toBeLessThanOrEqual(side.width - SYSTEM.pitch);
    expect(
      holes.every((h) => h.d === SYSTEM.d && h.depth === SYSTEM.depth),
    ).toBe(true);
    expect(new Set(holes.map((h) => h.id)).size).toBe(holes.length);
    expect(holes.every((h) => onFace(side, h))).toBe(true);
  });
  it("numbers on from the holes already there", () => {
    const first = systemHoles(side);
    const more = systemHoles(side, first);
    expect(more[0]!.id).toBe(`pin-${first.length + 1}`);
  });
});

describe("hingeCups and backGroove", () => {
  it("puts two cups on a short door and three on a tall one, on the back", () => {
    expect(hingeCups({ length: 400, width: 700 })).toHaveLength(2);
    const tall = hingeCups({ length: 400, width: 1800 });
    expect(tall).toHaveLength(3);
    expect(tall.every((c) => c.face === "back" && c.d === 35)).toBe(true);
  });
  it("runs a groove the length of the panel near its back edge", () => {
    const g = backGroove(side);
    expect([g.u0, g.u1]).toEqual([0, side.length]);
    expect(g.v0).toBe(g.v1);
    expect(featureRect(g)).toEqual({ u: 0, v: 10, w: 400, h: 6 });
  });
  it("cuts a quarter out of the middle", () => {
    const c = middleCutout(side);
    expect(onFace(side, c)).toBe(true);
    expect(c.w).toBe(100);
  });
  it("reads as a line", () => {
    expect(featureLabel(systemHoles(side)[0]!)).toBe(
      "5 mm hole, 13 deep at 37, 32",
    );
  });
});

describe("innerFace and featureMark", () => {
  it("looks into the piece: a side at -x has its inner face at +x", () => {
    expect(innerFace({ normal: "x", position: [-291, 350, 0] })).toBe("front");
    expect(innerFace({ normal: "x", position: [291, 350, 0] })).toBe("back");
    expect(innerFace({ normal: "z", position: [0, 450, 191] })).toBe("back");
  });
  it("puts a hole's mark on the face, a hair out of it", () => {
    const side = {
      normal: "x" as const,
      length: 400,
      width: 740,
      thickness: 18,
      position: [-291, 370, 0] as [number, number, number],
    };
    const [pin] = systemHoles(side);
    const mark = featureMark(side, pin!);
    expect(mark.round).toBe(true);
    expect(mark.centre[0]).toBeCloseTo(-291 + 9.3, 5);
    // u runs along z from the face's left (-z), v up
    expect(mark.centre[2]).toBeCloseTo(-200 + pin!.u, 5);
    expect(mark.centre[1]).toBeCloseTo(0 + pin!.v, 5);
    expect(mark.size).toEqual([1, 5, 5]);
  });
});
