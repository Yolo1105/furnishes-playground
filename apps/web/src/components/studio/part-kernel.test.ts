import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cutCornerSketch,
  outlineOf,
  rectangleSketch,
  rounded,
  sketchSize,
  solved,
  toPrimitives,
  withDistance,
} from "@furnishes/domain";

/**
 * The two kernels the part worker runs, here in Node with their wasm
 * files read from the packages: the constraint solver settles a
 * sketch whose held length was typed anew, within the gate (50 ms);
 * Open CASCADE makes the profile solid, meshes it and writes STEP.
 */
const require = createRequire(import.meta.url);
const wasmOf = (pkg: string, file: string) =>
  path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file);

describe("the constraint solver", () => {
  it("settles a typed length within the gate", async () => {
    const { make_gcs_wrapper } = await import("@salusoft89/planegcs");
    const gcs = await make_gcs_wrapper(
      wasmOf("@salusoft89/planegcs", "dist/planegcs_dist/planegcs.wasm"),
    );
    const asked = withDistance(cutCornerSketch(600, 400, 80), "len", 700);
    const t0 = performance.now();
    gcs.push_primitives_and_params(toPrimitives(asked));
    gcs.solve();
    gcs.apply_solution();
    const back = solved(asked, gcs.sketch_index.get_primitives() as never);
    const ms = performance.now() - t0;
    expect(sketchSize(back)).toEqual({ length: 700, width: 400 });
    // the cut corner followed: still square at the far edge
    expect(outlineOf(back)[2]![0]).toBeCloseTo(700, 3);
    expect(ms).toBeLessThan(50);
    gcs.destroy_gcs_module();
  }, 60_000);
});

describe("the kernel", () => {
  it("makes the profile solid, meshes it and writes STEP", async () => {
    const replicad = await import("replicad");
    const { default: opencascade } = await import("replicad-opencascadejs");
    const wasm = wasmOf("replicad-opencascadejs", "dist/replicad_single.wasm");
    replicad.setOC(await opencascade({ locateFile: () => wasm }));
    const sketch = rounded(rectangleSketch(600, 400), 30);
    const pts = outlineOf(sketch);
    let pen = replicad.draw(pts[0]);
    for (const p of pts.slice(1)) pen = pen.lineTo(p);
    const t0 = performance.now();
    const shape = pen.close().fillet(30).sketchOnPlane("XY").extrude(18);
    const mesh = shape.mesh({ tolerance: 0.2, angularTolerance: 0.3 });
    const step = await shape.blobSTEP().text();
    const ms = performance.now() - t0;
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.triangles.length % 3).toBe(0);
    expect(step.startsWith("ISO-10303-21")).toBe(true);
    expect(ms).toBeLessThan(5000);
  }, 120_000);
});
