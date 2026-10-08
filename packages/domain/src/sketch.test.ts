import { describe, expect, it } from "vitest";
import {
  cutCornerSketch,
  outlineOf,
  outlineWithCorners,
  rectangleSketch,
  rounded,
  sketchSize,
  solved,
  taperSketch,
  toPrimitives,
  withDistance,
} from "./sketch";

describe("the presets", () => {
  it("draw a rectangle held square at its size", () => {
    const s = rectangleSketch(600, 400);
    expect(outlineOf(s)).toEqual([
      [0, 0],
      [600, 0],
      [600, 400],
      [0, 400],
    ]);
    expect(sketchSize(s)).toEqual({ length: 600, width: 400 });
    expect(s.points[0]!.fixed).toBe(true);
    expect(s.constraints.filter((c) => c.kind === "distance")).toHaveLength(2);
  });
  it("cut a corner and narrow a top, within the panel", () => {
    const cut = cutCornerSketch(600, 400, 80);
    expect(outlineOf(cut)).toContainEqual([600, 320]);
    expect(outlineOf(cut)).toContainEqual([520, 400]);
    expect(sketchSize(cut)).toEqual({ length: 600, width: 400 });
    const taper = taperSketch(600, 400, 150);
    expect(outlineOf(taper)[2]).toEqual([450, 400]);
    // a cut past half is held to half
    expect(outlineOf(cutCornerSketch(600, 400, 900))[2]).toEqual([600, 200]);
  });
});

describe("the solver's words", () => {
  it("name the points, an edge a line, then the constraints", () => {
    const prims = toPrimitives(rectangleSketch(600, 400));
    expect(prims.slice(0, 4).every((p) => p.type === "point")).toBe(true);
    expect(prims.filter((p) => p.type === "line")).toHaveLength(4);
    expect(prims.find((p) => p.id === "len")).toEqual({
      id: "len",
      type: "p2p_distance",
      p1_id: "a",
      p2_id: "b",
      distance: 600,
    });
    expect(prims.find((p) => p.id === "ab")?.type).toBe("horizontal_pp");
  });
  it("take the solved points back, and a distance typed anew", () => {
    const s = withDistance(rectangleSketch(600, 400), "len", 700);
    expect(s.constraints.find((c) => c.id === "len")).toMatchObject({
      mm: 700,
    });
    const back = solved(s, [
      { id: "b", type: "point", x: 700, y: 0, fixed: false },
      { id: "c", type: "point", x: 700, y: 400, fixed: false },
    ]);
    expect(sketchSize(back)).toEqual({ length: 700, width: 400 });
  });
});

describe("rounded corners", () => {
  it("draw each corner as an arc that stays inside the box", () => {
    const s = rounded(rectangleSketch(600, 400), 50);
    const pts = outlineWithCorners(s, 4);
    expect(pts.length).toBe(4 * 5);
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(600 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(400 + 1e-6);
    }
    // the first corner's arc starts on the left edge 50 up and ends on
    // the bottom edge 50 in
    expect(pts[0]![0]).toBeCloseTo(0, 6);
    expect(pts[0]![1]).toBeCloseTo(50, 6);
    expect(pts[4]![0]).toBeCloseTo(50, 6);
    expect(pts[4]![1]).toBeCloseTo(0, 6);
  });
});
