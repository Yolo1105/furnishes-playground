import { describe, expect, it } from "vitest";
import {
  constraintIdOf,
  cutCornerSketch,
  edgeId,
  freeDof,
  holesOf,
  notchSketch,
  outlineOf,
  outlineWithCorners,
  type Primitive,
  rectangleSketch,
  rounded,
  roundsOf,
  type Sketch,
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
  it("an L: the far corner notched out, held by its two distances", () => {
    const l = notchSketch(600, 400, 200, 100);
    expect(outlineOf(l)).toEqual([
      [0, 0],
      [600, 0],
      [600, 300],
      [400, 300],
      [400, 400],
      [0, 400],
    ]);
    expect(sketchSize(l)).toEqual({ length: 600, width: 400 });
    expect(freeDof(l) - l.constraints.length).toBe(0);
    expect(l.constraints.find((c) => c.id === "cut")?.name).toBe("notch");
    // a notch past half is held to half
    expect(outlineOf(notchSketch(600, 400, 900, 900))[3]).toEqual([300, 200]);
  });
  it("roundsOf: every circle drawn is a round hole", () => {
    const s: Sketch = {
      ...rectangleSketch(600, 400),
      geometry: [{ id: "c1", kind: "circle", centre: "ctr", radius: 20 }],
    };
    s.points.push({ id: "ctr", x: 100, y: 200, fixed: false });
    expect(roundsOf(s)).toEqual([{ x: 100, y: 200, r: 20 }]);
    expect(roundsOf(rectangleSketch(1, 1))).toEqual([]);
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

describe("geometry beyond the outline and the wider constraints", () => {
  const withHole = () => {
    const s = rectangleSketch(600, 400);
    s.points.push(
      { id: "ctr", x: 300, y: 200, fixed: false },
      { id: "h1", x: 100, y: 100, fixed: false },
      { id: "h2", x: 200, y: 100, fixed: false },
      { id: "h3", x: 200, y: 180, fixed: false },
      { id: "h4", x: 100, y: 180, fixed: false },
    );
    s.geometry = [{ id: "ring", kind: "circle", centre: "ctr", radius: 50 }];
    s.holes = [["h1", "h2", "h3", "h4"]];
    s.constraints.push(
      { id: "r", kind: "radius", c: "ring", mm: 40, name: "ring" },
      { id: "hh", kind: "horizontal", a: "h1", b: "h2" },
      {
        id: "par",
        kind: "parallel",
        l1: edgeId("h1", "h2"),
        l2: edgeId("a", "b"),
      },
      { id: "sym", kind: "symmetric", a: "h1", b: "h2", l: edgeId("b", "c") },
      { id: "fx", kind: "fix", p: "ctr", x: 300, y: 200 },
      { id: "tan", kind: "tangent", l: edgeId("h3", "h4"), c: "ring" },
    );
    return s;
  };
  it("speaks the solver's words for circles, holes and the constraints", () => {
    const prims = toPrimitives(withHole());
    const types = prims.map((p) => p.type);
    expect(types).toContain("circle");
    expect(prims.filter((p) => p.type === "line")).toHaveLength(8);
    expect(types).toContain("circle_radius");
    expect(types).toContain("parallel");
    expect(types).toContain("p2p_symmetric_ppl");
    expect(types).toContain("coordinate_x");
    expect(types).toContain("coordinate_y");
    expect(types).toContain("tangent_lc");
    expect(constraintIdOf("fx-x")).toBe("fx");
  });
  it("draws an arc with its rules, radius and angles from its points", () => {
    const s = rectangleSketch(600, 400);
    s.points.push(
      { id: "c", x: 300, y: 200, fixed: false },
      { id: "s", x: 350, y: 200, fixed: false },
      { id: "e", x: 300, y: 250, fixed: false },
    );
    s.geometry = [
      { id: "bow", kind: "arc", centre: "c", start: "s", end: "e" },
    ];
    s.constraints.push({ id: "r", kind: "radius", c: "bow", mm: 50 });
    const prims = toPrimitives(s);
    const arc = prims.find((p) => p.type === "arc") as Extract<
      Primitive,
      { type: "arc" }
    >;
    expect(arc.radius).toBeCloseTo(50);
    expect(arc.start_angle).toBeCloseTo(0);
    expect(arc.end_angle).toBeCloseTo(Math.PI / 2);
    expect(prims.map((p) => p.type)).toContain("arc_rules");
    expect(prims.map((p) => p.type)).toContain("arc_radius");
  });
  it("takes a circle's radius back from the solver, and counts the freedom", () => {
    const s = withHole();
    const back = solved(s, [
      { id: "ring", type: "circle", c_id: "c", radius: 40 },
    ]);
    expect(back.geometry![0]).toMatchObject({ kind: "circle", radius: 40 });
    expect(holesOf(s)).toEqual([
      [
        [100, 100],
        [200, 100],
        [200, 180],
        [100, 180],
      ],
    ]);
    // 3 free corners of the rectangle, 5 more points, a circle's radius
    expect(freeDof(s)).toBe((3 + 5) * 2 + 1);
  });
  it("still reads an old sketch, with no geometry or holes", () => {
    const s = rectangleSketch(600, 400);
    expect(toPrimitives(s)).toHaveLength(4 + 4 + 6);
    expect(holesOf(s)).toEqual([]);
  });
});
