import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { describe, expect, it } from "vitest";
import {
  asStudio,
  CLEAN,
  dropStrays,
  openShare,
  partsOf,
  refuseMesh,
  texelsPerMetre,
} from "./mesh-clean";

/** a closed box, its faces' corners apart as three makes them */
const box = (s = 1, x = 0) => new BoxGeometry(s, s, s).translate(x, 0, 0);

describe("a generated mesh made fit for the room", () => {
  it("tells its parts apart once its corners are welded", () => {
    const g = mergeGeometries([box(), box(0.1, 3)]);
    const parts = new Set(partsOf(g));
    expect(parts.size).toBe(2);
  });
  it("drops the stray parts and keeps the object", () => {
    // the object in one piece, and a crumb a hundredth of its triangles
    const big = new BoxGeometry(1, 1, 1, 10, 10, 10);
    const g = mergeGeometries([big, box(0.05, 5)]);
    const { geometry, dropped } = dropStrays(g);
    expect(dropped).toBe(1);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.x).toBeLessThan(1);
  });
  it("keeps a quantized model's coordinates as floats WebGPU can read", () => {
    const g = mergeGeometries([
      new BoxGeometry(1, 1, 1, 10, 10, 10),
      box(0.05, 5),
    ]);
    // as a Khronos model has them: normalized 16-bit integers
    const uv = g.attributes.uv!;
    const q = new Uint16Array(uv.count * 2);
    for (let i = 0; i < q.length; i++)
      q[i] = Math.round((uv.array[i] as number) * 65535);
    g.setAttribute("uv", new BufferAttribute(q, 2, true));
    const got = dropStrays(g).geometry.attributes.uv as BufferAttribute;
    // WebGPU has no vertex format for normalized float32
    expect(got.normalized).toBe(false);
    expect(got.array).toBeInstanceOf(Float32Array);
    expect(Math.max(...got.array)).toBeLessThanOrEqual(1);
    expect(Math.max(...got.array)).toBeGreaterThan(0.9);
  });
  it("finds the holes in an open mesh, none in a closed one", () => {
    expect(openShare(box())).toBe(0);
    const open = new BufferGeometry();
    open.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    expect(openShare(open)).toBe(1);
    expect(openShare(open)).toBeGreaterThan(CLEAN.holes);
  });
  it("reads its texels a metre and turns away a coarse one", () => {
    // a 1 m box's six faces, each over the whole picture: the picture
    // counted once, over 6 m²
    expect(texelsPerMetre(box(), [1024, 1024])).toBeCloseTo(
      1024 / Math.sqrt(6),
      0,
    );
    const coarse = new Group().add(
      new Mesh(
        box(),
        new MeshStandardMaterial({
          map: Object.assign(Object.create(null), {
            image: { width: 32, height: 32 },
          }),
        }),
      ),
    );
    expect(refuseMesh(coarse, 1)).toMatch(/coarse/);
    expect(refuseMesh(new Group().add(new Mesh(box())), 1)).toBeNull();
  });
  it("takes the studio's surface for what it is made of", () => {
    const own = new MeshStandardMaterial({ roughness: 0.2, metalness: 0.9 });
    const m = asStudio(own, "fabric");
    expect([m.roughness, m.metalness]).toEqual([0.92, 0]);
    expect(own.roughness).toBe(0.2);
  });
});
