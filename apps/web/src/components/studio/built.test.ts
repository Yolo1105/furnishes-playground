import { describe, expect, it } from "vitest";
import { benchLines, type BenchReport } from "./bench";
import type { Finish } from "./finish";
import { batchesOf, type Part } from "./part-geometry";

const PANEL = 0.018;

const tris = (g: {
  index: { count: number } | null;
  getAttribute: (n: string) => { count: number };
}) => (g.index?.count ?? g.getAttribute("position").count) / 3;

describe("a built piece's parts in batches", () => {
  const f: Finish = {
    colour: "#c8a77e",
    rough: 0.45,
    coat: 0.25,
    grain: "wood",
  };
  const handle: Finish = { colour: "#8d8780", rough: 0.35, metal: 0.85 };
  const board = (x: number, colour?: string): Part => ({
    f,
    at: [x, 0.4, 0],
    dims: [PANEL, 0.8, 0.4],
    ...(colour ? { colour } : {}),
  });
  it("draws the boards of one finish and colour as one mesh", () => {
    const parts = [board(-0.3), board(0), board(0.3, f.colour)];
    const batches = batchesOf(parts);
    expect(batches).toHaveLength(1);
    const one = batchesOf([board(0)])[0]!;
    expect(tris(batches[0]!.faces)).toBe(3 * tris(one.faces));
    // the joint lines are merged too, one set for the batch
    expect(batches[0]!.joints!.getAttribute("position").count).toBe(
      3 * one.joints!.getAttribute("position").count,
    );
  });
  it("keeps a bay in its own colour, and the handles apart", () => {
    const parts: Part[] = [
      board(-0.3),
      board(0, "#556b5d"),
      { f: handle, at: [0.1, 0.4, 0.21], rod: [0.005, 0.11] },
      { f: handle, at: [-0.1, 0.4, 0.21], rod: [0.005, 0.11] },
    ];
    const batches = batchesOf(parts);
    expect(batches).toHaveLength(3);
    const rods = batches.find((b) => b.f.metal !== undefined)!;
    // a batch of rods has no joint lines to draw
    expect(rods.joints).toBeNull();
    expect(batches.every((b) => b.faces.getAttribute("color"))).toBe(true);
  });
  it("merges a rod with the boards of its finish", () => {
    // a rounded slab has no index and a rod has one
    const batches = batchesOf([
      board(0),
      { f, at: [0, 0.05, 0], rod: [0.02, 0.1] },
    ]);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.faces).not.toBeNull();
    expect(batches[0]!.joints!.getAttribute("position").count).toBeGreaterThan(
      0,
    );
  });
  it("places a turned part where it stands", () => {
    const [b] = batchesOf([
      { f, at: [1, 2, 3], dims: [1, 0.1, 0.1], rotation: [0, Math.PI / 2, 0] },
    ]);
    b!.faces.computeBoundingBox();
    const box = b!.faces.boundingBox!;
    // a metre-long board turned a quarter about the upright lies along z
    expect(box.max.z - box.min.z).toBeCloseTo(1, 2);
    expect(box.max.x - box.min.x).toBeCloseTo(0.1, 2);
    expect((box.max.y + box.min.y) / 2).toBeCloseTo(2, 5);
  });
});

describe("the bench's opening lines", () => {
  const report: BenchReport = {
    at: "",
    backend: "webgpu",
    tier: "phone",
    dpr: 3,
    canvas: { width: 1170, height: 2532 },
    frames: 600,
    seconds: 20,
    p50: 30,
    p95: 40,
    p99: 50,
    fps: 30,
    post: { p50: 3, p95: 4 },
    gpu: null,
    budgets: [],
  };
  it("says what opening the room held the page for", () => {
    const lines = benchLines({
      ...report,
      opening: {
        longTasks: 4,
        blockedMs: 1800,
        longestMs: 900,
        programs: 22,
        meshes: 254,
        casters: 198,
        triangles: 150276,
      },
    });
    expect(lines).toContain(
      "opening: main thread held 1800 ms in 4 long tasks · longest 900 ms",
    );
    expect(lines).toContain(
      "opening: 22 shader programs · 254 meshes (198 cast shadows) · 150276 triangles",
    );
  });
  it("says so where the browser keeps no long tasks", () => {
    const lines = benchLines({
      ...report,
      opening: {
        longTasks: null,
        blockedMs: null,
        longestMs: null,
        programs: null,
        meshes: 1,
        casters: 1,
        triangles: 12,
      },
    });
    expect(lines).toContain("opening: long tasks not reported by this browser");
  });
});
