import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  batchesOf,
  cushionGeometry,
  faceOfNormal,
  type Part,
  slabGeometry,
} from "./part-geometry";

describe("a board's geometry for the bake (round 8)", () => {
  it("carries a second UV set, an open light and its edges' nearness", () => {
    const g = slabGeometry([0.6, 0.018, 0.3]);
    for (const name of ["uv1", "lm", "edge"])
      expect(g.getAttribute(name), name).toBeTruthy();
    // a point in the middle of the top stands about 0.3 m from its
    // nearest edges across, 0.15 m along (1 less the distance)
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const edge = g.getAttribute("edge");
    let seen = 0;
    for (let i = 0; i < pos.count; i++) {
      if (faceOfNormal(nor.getX(i), nor.getY(i), nor.getZ(i)) !== 3) continue;
      const d = [0, 1, 2, 3].map((k) => 1 - edge.getComponent(i, k));
      // the four distances to its face's edges sum to the face's size
      expect(d[0]! + d[1]!).toBeCloseTo(0.6, 2);
      expect(d[2]! + d[3]!).toBeCloseTo(0.3, 2);
      seen++;
    }
    expect(seen).toBeGreaterThan(3);
  });
  it("sets far an edge another board covers, so it draws no line", () => {
    const f = { colour: "#a07850", rough: 1 };
    // a side standing on a bottom board: the side's foot is covered
    const parts: Part[] = [
      { f, at: [0, 0.009, 0], dims: [0.6, 0.018, 0.3] },
      { f, at: [-0.291, 0.218, 0], dims: [0.018, 0.4, 0.3] },
    ];
    const [batch] = batchesOf(parts);
    const [from, count] = batch!.ranges[1]!;
    const pos = batch!.faces.getAttribute("position");
    const nor = batch!.faces.getAttribute("normal");
    const edge = batch!.faces.getAttribute("edge");
    let covered = 0;
    let open = 0;
    for (let i = from; i < from + count; i++) {
      // the side's inner face (+x)
      if (faceOfNormal(nor.getX(i), nor.getY(i), nor.getZ(i)) !== 1) continue;
      if (pos.getX(i) < -0.29) continue;
      // its −v (low y) edge sits on the bottom board; its +v (top) is open
      if (edge.getComponent(i, 2) < -5) covered++;
      if (edge.getComponent(i, 3) > -5) open++;
    }
    expect(covered).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(0);
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
