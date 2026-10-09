import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  backGroove,
  carcassPanels,
  type Feature,
  hingeCups,
  middleCutout,
  systemHoles,
} from "@furnishes/domain";
import type { ManifoldToplevel } from "manifold-3d";
import { cutMeshOf, slabManifold } from "./cut-solid";

/**
 * The real cuts on manifold-3d in Node, its wasm read from the
 * package: the prompt's gates. A hole's depth is right (the volume it
 * takes within 1%), and a twenty-panel cabinet's cuts come in under
 * half a second once the kernel is up: the kernel's load and its first
 * cut stay outside the clock, and the gate reads the median of five
 * runs, so one slow run on a busy machine does not fail it.
 */
/** a slower machine's allowance, for CI alone: PERF_FACTOR=2 doubles
    the half second. The gate itself does not move: a change that makes
    the cuts slower fails here on the machine they were tuned on. */
const PERF_FACTOR = Number(process.env.PERF_FACTOR) || 1;
const CABINET_MS = 500 * PERF_FACTOR;
const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const require = createRequire(import.meta.url);
let m: ManifoldToplevel;
beforeAll(async () => {
  const { default: Module } = await import("manifold-3d");
  const wasm = path.join(
    path.dirname(require.resolve("manifold-3d/manifold.js")),
    "manifold.wasm",
  );
  m = await Module({ locateFile: () => wasm });
  m.setup();
}, 60_000);

const side = { length: 400, width: 740, thickness: 18 };

describe("the cut solid", () => {
  it("takes out of the slab what the holes, the groove and the cut-out measure, within 1%", () => {
    const slab = slabManifold(m, side);
    const whole = slab.volume();
    const pins = systemHoles(side);
    const cut = cutMeshOf(m, side, pins, slab);
    // 5 mm holes, 13 mm deep: a cylinder's volume each
    const hole = Math.PI * 2.5 * 2.5 * 13;
    const taken = whole - cut.volume;
    expect(
      Math.abs(taken - pins.length * hole) / (pins.length * hole),
    ).toBeLessThan(0.01);
    // a 35 mm cup 13 mm deep on the back face, and a groove 6 × 10
    const cups = hingeCups(side);
    const groove = backGroove(side);
    const more = cutMeshOf(m, side, [...cups, groove], slab);
    const cupVol = Math.PI * 17.5 * 17.5 * 13 * cups.length;
    const along = Math.hypot(groove.u1 - groove.u0, groove.v1 - groove.v0);
    const grooveVol = along * groove.width * groove.depth;
    expect(
      Math.abs(whole - more.volume - cupVol - grooveVol) / (cupVol + grooveVol),
    ).toBeLessThan(0.01);
    // a cut-out goes through
    const out = middleCutout(side);
    const through = cutMeshOf(m, side, [out], slab);
    expect(
      Math.abs(whole - through.volume - out.w * out.h * side.thickness) /
        (out.w * out.h * side.thickness),
    ).toBeLessThan(0.01);
    // the mesh carries normals, texture coordinates and tones a vertex
    const n = cut.positions.length / 3;
    expect(cut.normals.length).toBe(n * 3);
    expect(cut.uvs.length).toBe(n * 2);
    expect(cut.tones.length).toBe(n);
    expect(cut.indices.length % 3).toBe(0);
    // a face vertex carries the face's tone, a hole wall the band's
    expect([...cut.tones].some((t) => t === 1)).toBe(true);
    expect([...cut.tones].some((t) => t < 1)).toBe(true);
  }, 60_000);

  it("cuts a twenty-panel cabinet's machining in under half a second", () => {
    const panels = [
      ...carcassPanels({
        width: 1200,
        depth: 400,
        height: 800,
        bays: 3,
        doors: true,
      }),
    ];
    while (panels.length < 20)
      panels.push({ ...panels[panels.length % 4]!, id: `p${panels.length}` });
    const features = (p: (typeof panels)[number]): Feature[] =>
      p.kind === "door" ? hingeCups(p) : [...systemHoles(p), backGroove(p)];
    const twenty = panels.slice(0, 20);
    // the kernel's first cut warms it up (the slabs made and kept, the
    // drills too); the gate is the cuts, the median of five runs
    cutMeshOf(m, panels[0]!, features(panels[0]!));
    const runs = Array.from({ length: 5 }, () => {
      const t0 = performance.now();
      for (const p of twenty) cutMeshOf(m, p, features(p));
      return performance.now() - t0;
    });
    expect(median(runs)).toBeLessThan(CABINET_MS);
  }, 60_000);
});
