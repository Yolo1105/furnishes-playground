import { describe, expect, it } from "vitest";
import { benchStats, budgetsFor, percentile } from "./bench";

describe("the frame bench", () => {
  it("takes percentiles by the nearest rank", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 95)).toBe(5);
    expect(percentile([], 50)).toBe(0);
  });
  it("sums a run up, with the post's and the GPU's shares", () => {
    const frames = Array.from({ length: 100 }, (_, i) => ({
      ms: 10 + (i % 10),
      post: 2 + (i % 3),
      gpu: 8,
    }));
    const r = benchStats(frames, {
      backend: "webgpu",
      tier: "desktop",
      dpr: 2,
      canvas: { width: 2560, height: 1440 },
    });
    expect(r.frames).toBe(100);
    expect(r.p50).toBe(14);
    expect(r.p95).toBe(19);
    expect(r.fps).toBeGreaterThan(60);
    expect(r.post.p95).toBe(4);
    expect(r.gpu).toEqual({ p50: 8, p95: 8 });
    expect(r.budgets.map((b) => b.pass)).toEqual([false, true]);
  });
  it("judges each tier against its own budget", () => {
    expect(
      budgetsFor("laptop", 1080, { p95: 20, fps: 50, postP95: 9 })[0]!.pass,
    ).toBe(true);
    expect(
      budgetsFor("phone", 800, { p95: 40, fps: 25, postP95: 0 })[0]!.pass,
    ).toBe(false);
    expect(
      budgetsFor(null, 900, { p95: 40, fps: 31, postP95: 0 })[0]!.pass,
    ).toBe(true);
  });
});
