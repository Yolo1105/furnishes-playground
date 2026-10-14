import { describe, expect, it } from "vitest";
import {
  bake,
  type BakeBox,
  type BakeJob,
  bakeKey,
  facePoint,
  layoutCharts,
} from "./lightmap-bake";
import { coveredEdges } from "./part-geometry";
import { giveBack, resetAtlas, take } from "./lightmap";

/** a bay of 18 mm boards: two sides, a bottom, a top and a back, 0.6 m
    wide, 0.4 m high, 0.3 m deep, standing on the floor */
const T = 0.009;
const bay: BakeBox[] = [
  { c: [-0.3 + T, 0.2, 0], h: [T, 0.2, 0.15] },
  { c: [0.3 - T, 0.2, 0], h: [T, 0.2, 0.15] },
  { c: [0, T, 0], h: [0.3 - 2 * T, T, 0.15] },
  { c: [0, 0.4 - T, 0], h: [0.3 - 2 * T, T, 0.15] },
  { c: [0, 0.2, -0.15 + T], h: [0.3 - 2 * T, 0.2 - 2 * T, T] },
];
const jobOf = (boxes: BakeBox[], wall: number | null = null): BakeJob => {
  const boards = boxes.map((_, i) => i);
  const { charts, size } = layoutCharts(boxes, boards, 0);
  return {
    boxes,
    floor: 0,
    wall,
    charts,
    size,
    points: new Float32Array(0),
    owners: new Int32Array(0),
    foot: { x0: -0.5, z0: -0.35, x1: 0.5, z1: 0.35, nx: 40, nz: 28 },
  };
};
/** a face's texel value at (s, t), 0–1 */
const texel = (
  job: BakeJob,
  atlas: Uint8Array,
  box: number,
  face: number,
  s: number,
  t: number,
  channel = 0,
) => {
  const c = job.charts.find((c) => c.box === box && c.face === face)!;
  const x = c.x + Math.min(c.w - 1, Math.floor(s * c.w));
  const y = c.y + Math.min(c.h - 1, Math.floor(t * c.h));
  return atlas[(y * job.size[0] + x) * 4 + channel]! / 255;
};

describe("layoutCharts", () => {
  it("lays every seen face once, apart, inside the atlas", () => {
    const job = jobOf(bay);
    const { charts, size } = job;
    for (const a of charts) {
      expect(a.x).toBeGreaterThanOrEqual(2);
      expect(a.y).toBeGreaterThanOrEqual(2);
      expect(a.x + a.w).toBeLessThanOrEqual(size[0] - 2 + 2);
      expect(a.y + a.h).toBeLessThanOrEqual(size[1]);
      for (const b of charts) {
        if (a === b) continue;
        const apart =
          a.x + a.w + 2 <= b.x ||
          b.x + b.w + 2 <= a.x ||
          a.y + a.h + 2 <= b.y ||
          b.y + b.h + 2 <= a.y;
        expect(apart).toBe(true);
      }
    }
  });
  it("leaves out a face pressed against another board or the floor", () => {
    const { charts } = jobOf(bay);
    // the bottom board's underside lies on the floor
    expect(charts.some((c) => c.box === 2 && c.face === 2)).toBe(false);
    // the bottom's ends are pressed against the sides
    expect(charts.some((c) => c.box === 2 && c.face === 0)).toBe(false);
    expect(charts.some((c) => c.box === 2 && c.face === 1)).toBe(false);
    // its top is seen
    expect(charts.some((c) => c.box === 2 && c.face === 3)).toBe(true);
  });
});

describe("bake", () => {
  const job = jobOf(bay);
  const r = bake(job);
  it("darkens the back of a bay against its front", () => {
    // the bottom board's top, near the back against near the front
    const back = texel(job, r.atlas, 2, 3, 0.5, 0.06);
    const front = texel(job, r.atlas, 2, 3, 0.5, 0.94);
    expect(back).toBeLessThan(front * 0.8);
  });
  it("sees the whole sky on an open top", () => {
    expect(texel(job, r.atlas, 3, 3, 0.5, 0.5, 1)).toBeGreaterThan(0.95);
    // and little of it inside, at the back of the bay
    expect(texel(job, r.atlas, 4, 5, 0.5, 0.5, 1)).toBeLessThan(0.6);
  });
  it("darkens a side towards the floor", () => {
    // the left side's outer face, low against high
    const low = texel(job, r.atlas, 0, 0, 0.5, 0.04);
    const high = texel(job, r.atlas, 0, 0, 0.5, 0.96);
    expect(low).toBeLessThan(high);
  });
  it("leaves a footprint darkest at the piece", () => {
    const f = job.foot;
    const at = (x: number, z: number) => {
      const i = Math.floor(((x - f.x0) / (f.x1 - f.x0)) * f.nx);
      const j = Math.floor(((z - f.z0) / (f.z1 - f.z0)) * f.nz);
      return r.foot[j * f.nx + i]! / 255;
    };
    // just off the front edge, and well out
    expect(at(0, 0.17)).toBeLessThan(at(0, 0.33) - 0.05);
    expect(at(0.45, 0.33)).toBeGreaterThan(0.85);
  });
  it("is the same for the same job, and keyed by it", () => {
    const again = bake(jobOf(bay));
    expect(Buffer.from(again.atlas).equals(Buffer.from(r.atlas))).toBe(true);
    expect(bakeKey(jobOf(bay))).toBe(bakeKey(job));
    expect(bakeKey(jobOf(bay, -0.16))).not.toBe(bakeKey(job));
  });
  it("puts the face's points where the face is", () => {
    const { p, n } = facePoint(bay[3]!, 3, 0.5, 0.5);
    expect(p[1]).toBeCloseTo(0.4);
    expect(n).toEqual([0, 1, 0]);
  });
});

describe("coveredEdges", () => {
  it("finds the edge where one board meets another's face", () => {
    // the left side's top edge on its outer face is open; its inner
    // face's bottom edge meets the bottom board
    const covered = coveredEdges(0, bay);
    // face 1 (+x, the side's inner face), its −v edge (low y): the
    // bottom board sits there
    expect(covered[1 * 4 + 2]).toBe(true);
    // face 0 (−x, the outer face), its +v edge (the top): open air
    expect(covered[0 * 4 + 3]).toBe(false);
  });
});

describe("the atlas's room", () => {
  it("gives rectangles that never overlap, and takes them back", () => {
    resetAtlas();
    const got = Array.from({ length: 60 }, (_, i) => take(100 + i * 3, 80))!;
    for (const a of got)
      for (const b of got) {
        if (!a || !b || a === b) continue;
        const apart =
          a.x + a.w <= b.x ||
          b.x + b.w <= a.x ||
          a.y + a.h <= b.y ||
          b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    for (const r of got) if (r) giveBack(r);
    // all of it free again: the biggest rectangle fits once more
    expect(take(2048, 2040)).not.toBeNull();
    resetAtlas();
  });
});
