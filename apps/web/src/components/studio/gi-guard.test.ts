import {
  BufferAttribute,
  type BufferGeometry,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import { describe, expect, it } from "vitest";
import { guardShape, shapeOf } from "./gi-material";

/**
 * A shell's shader is made again when its geometry's set of attributes
 * changes (a wall swapping shape, `giuv` given or taken back): its
 * material's version moves before the draw, so three compares its keys
 * and WebGPU never draws a geometry with a pipeline made for another.
 */
const draw = (m: Mesh) =>
  m.onBeforeRender(
    ...([null, null, null, m.geometry, m.material, null] as unknown as Parameters<
      Mesh["onBeforeRender"]
    >),
  );

describe("the shell's shape guard", () => {
  it("moves the material's version only when the attributes change", () => {
    const a = new BoxGeometry();
    const b = new PlaneGeometry();
    const mat = new MeshStandardMaterial();
    const mesh = new Mesh<BufferGeometry, MeshStandardMaterial>(a, mat);
    guardShape(mesh);
    guardShape(mesh); // once only
    draw(mesh);
    const first = mat.version;
    expect(first).toBe(1);
    draw(mesh);
    expect(mat.version).toBe(first);
    // the same attributes on another geometry: no new shader asked
    mesh.geometry = b;
    draw(mesh);
    expect(mat.version).toBe(first);
    // giuv given: the shader made again
    b.setAttribute(
      "giuv",
      new BufferAttribute(new Float32Array(b.attributes.position!.count * 3), 3),
    );
    draw(mesh);
    expect(mat.version).toBe(first + 1);
    // back to a shape without it (a wall's other end): again
    mesh.geometry = a;
    draw(mesh);
    expect(mat.version).toBe(first + 2);
    expect(shapeOf(a)).toBe("normal,position,uv");
  });
});
