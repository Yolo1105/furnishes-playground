import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  SphereGeometry,
  Vector3,
} from "three";
import {
  boxRaycast,
  budgetModel,
  clusterGeometry,
  MODEL_BUDGET,
  trianglesOf,
} from "./model-budget";

describe("what a model may cost in the room", () => {
  it("leaves a model within the budget as it came", () => {
    const g = new SphereGeometry(0.5, 32, 16);
    expect(trianglesOf(g)).toBeLessThan(MODEL_BUDGET.triangles);
    expect(clusterGeometry(g, MODEL_BUDGET.triangles)).toBe(g);
  });

  it("brings a heavy mesh under the budget and keeps its size and its picture's coordinates", () => {
    // a generated mesh's weight: some 130,000 triangles
    const g = new SphereGeometry(0.5, 360, 180);
    expect(trianglesOf(g)).toBeGreaterThan(100_000);
    const out = clusterGeometry(g, 5000);
    expect(trianglesOf(out)).toBeLessThanOrEqual(5000);
    expect(trianglesOf(out)).toBeGreaterThan(500);
    out.computeBoundingBox();
    const size = out.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(0.9);
    expect(size.y).toBeGreaterThan(0.9);
    expect(out.attributes.uv).toBeDefined();
    expect(out.attributes.normal).toBeDefined();
  });

  it("gives a quantized model's coordinates back as floats WebGPU can read", () => {
    // a Khronos model's coordinates come as normalized 16-bit integers
    const g = new SphereGeometry(0.5, 200, 100);
    const uv = g.attributes.uv!;
    const q = new Uint16Array(uv.count * 2);
    for (let i = 0; i < q.length; i++)
      q[i] = Math.round((uv.array[i] as number) * 65535);
    g.setAttribute("uv", new BufferAttribute(q, 2, true));
    const got = clusterGeometry(g, 5000).attributes.uv as BufferAttribute;
    // WebGPU has no vertex format for normalized float32
    expect(got.normalized).toBe(false);
    expect(got.array).toBeInstanceOf(Float32Array);
    expect(Math.max(...got.array)).toBeLessThanOrEqual(1);
    expect(Math.max(...got.array)).toBeGreaterThan(0.9);
  });

  it("budgets a whole model once, shares it among its meshes, and picks it by its box", () => {
    const root = new Group();
    const heavy = new Mesh(
      new SphereGeometry(0.5, 300, 150),
      new MeshStandardMaterial(),
    );
    const light = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial(),
    );
    light.position.x = 2;
    root.add(heavy, light);
    const done = budgetModel(root);
    expect(done.from).toBeGreaterThan(MODEL_BUDGET.triangles);
    expect(done.to).toBeLessThanOrEqual(MODEL_BUDGET.triangles + 12);
    // the same model again: nothing more is done
    expect(budgetModel(root)).toBe(done);
    expect(heavy.raycast).toBe(boxRaycast);
    root.updateMatrixWorld();
    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    const hits = ray.intersectObject(root, true);
    expect(hits.length).toBe(1);
    expect(hits[0]!.object).toBe(heavy);
    expect(hits[0]!.distance).toBeCloseTo(4.5, 3);
  });
});
