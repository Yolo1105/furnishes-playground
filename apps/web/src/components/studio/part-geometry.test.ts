import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  batchesOf,
  cushionGeometry,
  type Part,
  slabGeometry,
} from "./part-geometry";

describe("a board's geometry for the bake (round 8)", () => {
  it("carries a second UV set and an open light, and no edge line (round 10)", () => {
    const g = slabGeometry([0.6, 0.018, 0.3]);
    for (const name of ["uv1", "lm"])
      expect(g.getAttribute(name), name).toBeTruthy();
    // the edge lift's nearness is gone with the lift: one fewer layer
    // over the light, and four floats a vertex fewer
    expect(g.getAttribute("edge")).toBeUndefined();
  });
  it("keeps where each part's vertices lie in its batch", () => {
    const f = { colour: "#a07850", rough: 1 };
    const parts: Part[] = [
      { f, at: [0, 0.009, 0], dims: [0.6, 0.018, 0.3] },
      { f, at: [0, 0.3, 0], rod: [0.01, 0.2] },
    ];
    const [batch] = batchesOf(parts);
    const total = batch!.faces.getAttribute("position").count;
    const [a, b] = batch!.ranges;
    expect(a![0]).toBe(0);
    expect(b![0]).toBe(a![1]);
    expect(b![0] + b![1]).toBe(total);
  });
});

describe("a cushion as an upholsterer makes it (round 8, 1f)", () => {
  const shape = {
    dims: [0.6, 0.14, 0.55] as [number, number, number],
    radius: 0.035,
    crown: 0.018,
    facing: "up" as const,
    seed: null,
  };
  it("crowns its top in the middle", () => {
    const g = cushionGeometry(shape);
    g.computeBoundingBox();
    // the top's middle stands the crown above the box's half height
    expect(g.boundingBox!.max.y).toBeGreaterThan(0.07 + 0.015);
    expect(g.boundingBox!.max.y).toBeLessThan(0.07 + 0.02);
  });
  it("points every normal out of the cushion", () => {
    const g = cushionGeometry(shape);
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const p = new Vector3();
    const n = new Vector3();
    for (let i = 0; i < pos.count; i += 7) {
      p.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nor, i);
      expect(n.dot(p), `vertex ${i}`).toBeGreaterThan(0);
    }
  });
  it("draws a darker welt round its seams, and sags where it is sat on", () => {
    const g = cushionGeometry({ ...shape, seed: 7 });
    const tone = g.getAttribute("color");
    let least = 1;
    for (let i = 0; i < tone.count; i++) least = Math.min(least, tone.getX(i));
    expect(least).toBeLessThan(0.9);
    g.computeBoundingBox();
    const sat = g.boundingBox!.max.y;
    // the seeded sag takes some of the crown away
    const plain = cushionGeometry(shape);
    plain.computeBoundingBox();
    expect(sat).toBeLessThanOrEqual(plain.boundingBox!.max.y + 1e-6);
  });
});
