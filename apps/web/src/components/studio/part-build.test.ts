import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  boxPart,
  bracketPart,
  knobPart,
  type Part,
  type PartFeature,
  rectangleSketch,
  updateSketch,
} from "@furnishes/domain";
import type * as Replicad from "replicad";
import { buildPart, hullOf, meshOf } from "./part-build";

/**
 * The part builder on the real kernel, in Node with its wasm read from
 * the package: the prompt's gates for the feature history. The kernel
 * loads once for the file; its loading is not counted in any time.
 */
const require = createRequire(import.meta.url);
const wasmOf = (pkg: string, file: string) =>
  path.join(path.dirname(require.resolve(`${pkg}/package.json`)), file);

let r: typeof Replicad;
beforeAll(async () => {
  r = await import("replicad");
  const { default: opencascade } = await import("replicad-opencascadejs");
  const wasm = wasmOf("replicad-opencascadejs", "dist/replicad_single.wasm");
  r.setOC(await opencascade({ locateFile: () => wasm }));
}, 120_000);

/** a box 100 × 50 × 18 with a 10 mm hole cut through and its top edges
    filleted */
const holedBox = (width = 50): Part => {
  const p = boxPart("Block", 100, width, 18);
  return {
    ...p,
    sketches: [
      ...p.sketches,
      {
        id: "s2",
        name: "Hole",
        plane: "XY",
        at: 0,
        sketch: {
          points: [{ id: "ctr", x: 30, y: 20, fixed: true }],
          loop: [],
          geometry: [{ id: "c1", kind: "circle", centre: "ctr", radius: 5 }],
          constraints: [{ id: "c1-r", kind: "radius", c: "c1", mm: 5 }],
          corners: {},
        },
      },
    ],
    features: [
      ...p.features,
      {
        id: "f2",
        name: "Hole",
        kind: "extrude",
        sketch: "s2",
        distance: 18,
        direction: "one",
        op: "cut",
      },
      {
        id: "f3",
        name: "Round the top",
        kind: "fillet",
        edges: { rules: [{ rule: "inPlane", plane: "XY", at: 18 }] },
        radius: 3,
      },
    ],
  };
};

const states = (b: Awaited<ReturnType<typeof buildPart>>) =>
  b.statuses.map((s) => s.state);

describe("the part builder", () => {
  it("builds a box with a cut hole and filleted top edges", async () => {
    const built = await buildPart(r, holedBox());
    expect(states(built)).toEqual(["ok", "ok", "ok"]);
    const mesh = meshOf(built.body!);
    expect(mesh.bounds[0].map((v) => Math.round(v) || 0)).toEqual([0, 0, 0]);
    expect(mesh.bounds[1].map((v) => Math.round(v) || 0)).toEqual([
      100, 50, 18,
    ]);
    // the hole: a cylinder face, not flat; the fillet: curved faces
    // along the top; the box's six faces are flat
    const curved = mesh.faces.filter((f) => !f.normal);
    expect(curved.length).toBeGreaterThan(4);
    expect(
      mesh.faces.some((f) => f.plane?.plane === "XY" && f.plane.at === 18),
    ).toBe(true);
    // every triangle belongs to a face, and each face id is one of the
    // body's faces in order
    const ids = mesh.faceGroups.map((g) => g.faceId);
    expect(new Set(ids).size).toBe(mesh.faces.length);
    expect(Math.max(...ids)).toBe(mesh.faces.length - 1);
    expect(mesh.outline.length).toBe(4);
  }, 60_000);

  it("keeps the fillet on the top edges when the first sketch's width changes", async () => {
    const narrow = meshOf((await buildPart(r, holedBox(50))).body!);
    const wide = await buildPart(r, holedBox(80));
    expect(states(wide)).toEqual(["ok", "ok", "ok"]);
    const mesh = meshOf(wide.body!);
    expect(mesh.bounds[1].map((v) => Math.round(v) || 0)).toEqual([
      100, 80, 18,
    ]);
    // the same count of curved faces: the fillet found the top edges
    // again, four of them, by the plane they lie in
    const curvedOf = (m: typeof mesh) => m.faces.filter((f) => !f.normal);
    expect(curvedOf(mesh).length).toBe(curvedOf(narrow).length);
    // and they lie along the top, within the radius of z = 18
    for (const f of curvedOf(mesh))
      if (f.centre[2] > 9) expect(f.centre[2]).toBeGreaterThan(18 - 3);
    // the hole stayed where its sketch put it
    const hole = curvedOf(mesh).find((f) => f.centre[2] < 9);
    expect(hole).toBeDefined();
  }, 60_000);

  it("builds a ten-feature part under a second", async () => {
    const box = boxPart("Block", 200, 100, 30);
    const features: PartFeature[] = [...box.features];
    const sketches = [...box.sketches];
    for (let i = 0; i < 5; i++) {
      sketches.push({
        id: `h${i}`,
        name: `Hole ${i}`,
        plane: "XY",
        at: 0,
        sketch: {
          points: [{ id: "ctr", x: 30 + i * 30, y: 50, fixed: true }],
          loop: [],
          geometry: [{ id: "c1", kind: "circle", centre: "ctr", radius: 6 }],
          constraints: [{ id: "c1-r", kind: "radius", c: "c1", mm: 6 }],
          corners: {},
        },
      });
      features.push({
        id: `c${i}`,
        kind: "extrude",
        sketch: `h${i}`,
        distance: 30,
        direction: "one",
        op: "cut",
      });
    }
    features.push(
      {
        id: "fil",
        kind: "fillet",
        edges: { rules: [{ rule: "inPlane", plane: "XY", at: 30 }] },
        radius: 4,
      },
      {
        id: "cha",
        kind: "chamfer",
        edges: { rules: [{ rule: "inPlane", plane: "XY", at: 0 }] },
        distance: 2,
      },
      { id: "mir", kind: "mirror", plane: "YZ", at: 200 },
      {
        id: "pat",
        kind: "pattern",
        mode: "linear",
        axis: "y",
        count: 2,
        spacing: 120,
      },
    );
    const part: Part = { ...box, sketches, features };
    expect(part.features).toHaveLength(10);
    const t0 = performance.now();
    const built = await buildPart(r, part);
    const ms = performance.now() - t0;
    expect(states(built).every((s) => s === "ok")).toBe(true);
    expect(ms).toBeLessThan(1000);
    const mesh = meshOf(built.body!);
    expect(mesh.bounds[1].map((v) => Math.round(v) || 0)).toEqual([
      400, 220, 30,
    ]);
  }, 60_000);

  it("reports a failing fillet's words and leaves the rest not built, without throwing", async () => {
    const part = holedBox();
    part.features[2] = { ...part.features[2]!, radius: 1000 } as PartFeature;
    part.features.push({
      id: "f4",
      kind: "chamfer",
      edges: { rules: [] },
      distance: 1,
    });
    const built = await buildPart(r, part);
    expect(states(built)).toEqual(["ok", "ok", "failed", "notBuilt"]);
    expect(built.statuses[2]!.message).toBeTruthy();
    // the body stands as it was before the fillet
    expect(built.body).not.toBeNull();
    expect(
      meshOf(built.body!).bounds[1].map((v) => Math.round(v) || 0),
    ).toEqual([100, 50, 18]);
    // a rule that finds no edge says so
    const none = await buildPart(r, {
      ...holedBox(),
      features: [
        holedBox().features[0]!,
        {
          id: "f9",
          kind: "fillet",
          edges: { rules: [{ rule: "inPlane", plane: "XY", at: 99 }] },
          radius: 1,
        },
      ],
    });
    expect(none.statuses[1]).toMatchObject({
      state: "failed",
      message: "no edge matches the rule",
    });
  }, 60_000);

  it("rolls back and suppresses", async () => {
    const part = holedBox();
    expect(states(await buildPart(r, part, 1))).toEqual([
      "ok",
      "notBuilt",
      "notBuilt",
    ]);
    part.features[1] = { ...part.features[1]!, suppressed: true };
    expect(states(await buildPart(r, part))).toEqual([
      "ok",
      "suppressed",
      "ok",
    ]);
  }, 60_000);

  it("the drawer knob (revolve + fillet) and the shelf bracket (extrude + cut + fillet + chamfer) build, and an early edit rebuilds them", async () => {
    const knob = await buildPart(r, knobPart());
    expect(states(knob)).toEqual(["ok", "ok"]);
    const km = meshOf(knob.body!);
    expect(km.bounds[1].map((v) => Math.round(v) || 0)).toEqual([15, 15, 26]);
    expect(km.bounds[0].map((v) => Math.round(v) || 0)).toEqual([-15, -15, 0]);
    const bracket = await buildPart(r, bracketPart());
    expect(states(bracket)).toEqual(["ok", "ok", "ok", "ok"]);
    const bm = meshOf(bracket.body!);
    expect(bm.bounds[1].map((v) => Math.round(v) || 0)).toEqual([30, 120, 120]);
    // the first sketch's reach typed anew: the bracket is longer, the
    // hole, the rounded corner and the chamfer all still there
    const longer = updateSketch(bracketPart(), "s1", {
      sketch: {
        ...bracketPart().sketches[0]!.sketch,
        points: bracketPart().sketches[0]!.sketch.points.map((p) =>
          p.id === "b" || p.id === "c" ? { ...p, x: 160 } : p,
        ),
      },
    });
    const built = await buildPart(r, longer);
    expect(states(built)).toEqual(["ok", "ok", "ok", "ok"]);
    const lm = meshOf(built.body!);
    expect(lm.bounds[1].map((v) => Math.round(v) || 0)).toEqual([30, 160, 120]);
    expect(lm.faces.filter((f) => !f.normal).length).toBe(
      bm.faces.filter((f) => !f.normal).length,
    );
    // the knob's top at 26 pulled up to 30: the rim's fillet follows
    const taller = updateSketch(knobPart(), "s1", {
      sketch: {
        ...knobPart().sketches[0]!.sketch,
        points: knobPart().sketches[0]!.sketch.points.map((p) =>
          p.id === "e" || p.id === "f" ? { ...p, y: 30 } : p,
        ),
      },
    });
    const tall = await buildPart(r, {
      ...taller,
      features: taller.features.map((f) =>
        f.kind === "fillet"
          ? {
              ...f,
              edges: { rules: [{ rule: "inPlane", plane: "XY", at: 30 }] },
            }
          : f,
      ),
    });
    expect(states(tall)).toEqual(["ok", "ok"]);
    expect(meshOf(tall.body!).bounds[1].map((v) => Math.round(v) || 0)).toEqual(
      [15, 15, 30],
    );
  }, 120_000);

  it("writes STEP and reads it back within a tenth of a millimetre", async () => {
    const built = await buildPart(r, bracketPart());
    const step = await built.body!.blobSTEP().text();
    expect(step.startsWith("ISO-10303-21")).toBe(true);
    const back = await buildPart(r, {
      id: "in",
      name: "Imported",
      units: "mm",
      sketches: [],
      features: [],
      base: { name: "bracket.step", step },
    });
    const a = meshOf(built.body!).bounds;
    const b = meshOf(back.body!).bounds;
    for (const i of [0, 1] as const)
      for (const k of [0, 1, 2] as const)
        expect(Math.abs(a[i][k] - b[i][k])).toBeLessThan(0.1);
  }, 120_000);
});

describe("the hull", () => {
  it("rings the points counter-clockwise", () => {
    expect(
      hullOf([
        [0, 0],
        [2, 0],
        [1, 1],
        [2, 2],
        [0, 2],
        [1, 0.5],
      ]),
    ).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]);
    expect(
      hullOf(rectangleSketch(10, 5).points.map((p) => [p.x, p.y])),
    ).toHaveLength(4);
  });
});
