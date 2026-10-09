import { join } from "node:path";
import { GcsWrapper, init_planegcs_module } from "@salusoft89/planegcs";
import {
  cutCornerSketch,
  edgeId,
  outlineOf,
  rectangleSketch,
  type Sketch,
  taperSketch,
} from "@furnishes/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { solveWith } from "./part-solve";

/**
 * The solver itself, under Node: the same wasm the worker loads, so a
 * sketch's freedom and its conflicts are what the studio will show.
 */
let w: GcsWrapper;
beforeAll(async () => {
  const wasm = join(
    process.cwd(),
    "node_modules/@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm",
  );
  const mod = await init_planegcs_module({ locateFile: () => wasm });
  w = new GcsWrapper(new mod.GcsSystem());
});

describe("a sketch solved", () => {
  it("holds a rectangle with two dimensions fully: no freedom left", () => {
    const s = rectangleSketch(600, 400);
    s.points[1]!.x = 590; // nudged, to be pulled back
    const r = solveWith(w, s);
    expect(r.ok).toBe(true);
    expect(r.dof).toBe(0);
    expect(r.conflicting).toEqual([]);
    expect(outlineOf(r.sketch)[1]).toEqual([600, 0]);
  });
  it("reports dimensions that fight, named, and does not throw", () => {
    const s = rectangleSketch(600, 400);
    s.constraints.push({
      id: "again",
      kind: "distance",
      a: "a",
      b: "b",
      mm: 500,
    });
    const r = solveWith(w, s);
    expect(r.conflicting.length + r.redundant.length).toBeGreaterThan(0);
    expect([...r.conflicting, ...r.redundant]).toEqual(
      expect.arrayContaining([expect.stringMatching(/^(len|again)$/)]),
    );
  });
  it("leaves a sketch short of constraints with its freedom counted", () => {
    const s = rectangleSketch(600, 400);
    s.constraints = s.constraints.filter((c) => c.id !== "wid");
    const r = solveWith(w, s);
    expect(r.ok).toBe(true);
    expect(r.dof).toBe(1);
  });
  it("round-trips the old presets", () => {
    for (const s of [
      rectangleSketch(600, 400),
      cutCornerSketch(600, 400, 80),
      taperSketch(600, 400, 150),
    ]) {
      const r = solveWith(w, s);
      expect(r.ok).toBe(true);
      expect(outlineOf(r.sketch)).toEqual(outlineOf(s));
    }
  });
  it("holds a circle's radius and a hole square to the outline", () => {
    const s: Sketch = rectangleSketch(600, 400);
    s.points.push(
      { id: "ctr", x: 300, y: 210, fixed: false },
      { id: "h1", x: 100, y: 100, fixed: false },
      { id: "h2", x: 210, y: 95, fixed: false },
      { id: "h3", x: 200, y: 180, fixed: false },
      { id: "h4", x: 100, y: 180, fixed: false },
    );
    s.geometry = [{ id: "ring", kind: "circle", centre: "ctr", radius: 30 }];
    s.holes = [["h1", "h2", "h3", "h4"]];
    s.constraints.push(
      { id: "r", kind: "radius", c: "ring", mm: 40 },
      { id: "fx", kind: "fix", p: "ctr", x: 300, y: 200 },
      {
        id: "par",
        kind: "parallel",
        l1: edgeId("h1", "h2"),
        l2: edgeId("a", "b"),
      },
      {
        id: "hv",
        kind: "perpendicular",
        l1: edgeId("h2", "h3"),
        l2: edgeId("h1", "h2"),
      },
    );
    const r = solveWith(w, s);
    expect(r.ok).toBe(true);
    expect(r.sketch.geometry![0]).toMatchObject({ radius: 40 });
    const at = Object.fromEntries(r.sketch.points.map((p) => [p.id, p]));
    expect(at.ctr!.x).toBeCloseTo(300);
    expect(at.ctr!.y).toBeCloseTo(200);
    expect(at.h2!.y).toBeCloseTo(at.h1!.y);
    expect(at.h3!.x).toBeCloseTo(at.h2!.x);
  });
  it("solves a forty-entity sketch under fifty milliseconds", () => {
    // ten rectangles' worth of points and edges, each held square
    const s: Sketch = rectangleSketch(600, 400);
    for (let i = 0; i < 9; i++) {
      const ids = ["p", "q", "r", "s"].map((k) => `${k}${i}`);
      const x = 20 + i * 50;
      s.points.push(
        { id: ids[0]!, x, y: 20, fixed: false },
        { id: ids[1]!, x: x + 30, y: 20, fixed: false },
        { id: ids[2]!, x: x + 30, y: 60, fixed: false },
        { id: ids[3]!, x, y: 60, fixed: false },
      );
      s.holes = [...(s.holes ?? []), ids];
      s.constraints.push(
        { id: `h${i}`, kind: "horizontal", a: ids[0]!, b: ids[1]! },
        { id: `v${i}`, kind: "vertical", a: ids[1]!, b: ids[2]! },
        { id: `w${i}`, kind: "distance", a: ids[0]!, b: ids[1]!, mm: 30 },
      );
    }
    solveWith(w, s);
    const t0 = performance.now();
    const r = solveWith(w, s);
    const ms = performance.now() - t0;
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(50);
  });
});
