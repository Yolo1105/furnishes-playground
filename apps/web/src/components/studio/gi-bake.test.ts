import { describe, expect, it } from "vitest";
import { DataUtils } from "three";
import {
  atlasUv,
  bakeGi,
  buildTree,
  copyLayer,
  fadeOn,
  waitBehindFade,
  giKey,
  halfOf,
  layoutGi,
  trace,
  writeLayer,
  type GiJob,
  type V3,
} from "./gi-bake";

/** two triangles of a quad a–b–c–d, wound so the normal is (b−a)×(d−a) */
const quad = (a: V3, b: V3, c: V3, d: V3) => [
  ...a,
  ...b,
  ...c,
  ...a,
  ...c,
  ...d,
];

/**
 * A white box, 4 × 2.6 × 4 m, its north wall (z = −2) holed by a window
 * 1.6 × 1.2 m from 0.9 m up, every face turned in. The sky outside is
 * light above the horizon and the ground black, so a ceiling (looking
 * down) can only be lit by the light the floor and the walls give back.
 */
const W = 4;
const H = 2.6;
const room = (extra: number[] = []) => {
  const h = W / 2;
  const win = { x0: -0.8, x1: 0.8, y0: 0.9, y1: 2.1 };
  const tris = [
    // floor, up
    ...quad([-h, 0, -h], [-h, 0, h], [h, 0, h], [h, 0, -h]),
    // ceiling, down
    ...quad([-h, H, -h], [h, H, -h], [h, H, h], [-h, H, h]),
    // south wall z = +h, facing −z
    ...quad([-h, 0, h], [-h, H, h], [h, H, h], [h, 0, h]),
    // west wall x = −h, facing +x
    ...quad([-h, 0, -h], [-h, H, -h], [-h, H, h], [-h, 0, h]),
    // east wall x = +h, facing −x
    ...quad([h, 0, h], [h, H, h], [h, H, -h], [h, 0, -h]),
    // north wall z = −h, facing +z, round the window
    ...quad([-h, 0, -h], [h, 0, -h], [h, win.y0, -h], [-h, win.y0, -h]),
    ...quad([-h, win.y1, -h], [h, win.y1, -h], [h, H, -h], [-h, H, -h]),
    ...quad(
      [-h, win.y0, -h],
      [win.x0, win.y0, -h],
      [win.x0, win.y1, -h],
      [-h, win.y1, -h],
    ),
    ...quad(
      [win.x1, win.y0, -h],
      [h, win.y0, -h],
      [h, win.y1, -h],
      [win.x1, win.y1, -h],
    ),
  ];
  const shell = tris.length / 9;
  const all = new Float32Array([...tris, ...extra]);
  return { tris: all, shell, win, h };
};

/** a box's six faces, outward */
const boxTris = (lo: V3, hi: V3) => {
  const [x0, y0, z0] = lo;
  const [x1, y1, z1] = hi;
  return [
    ...quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]), // top
    ...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]), // +z
    ...quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]), // −z
    ...quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]), // +x
    ...quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]), // −x
  ];
};

const jobOf = (
  r: ReturnType<typeof room>,
  bounces: number,
  colours?: (t: number) => V3,
): GiJob => {
  const receivers = Array.from({ length: r.shell }, (_, i) => i);
  const lay = layoutGi(r.tris, receivers, 6, 512);
  const n = r.tris.length / 9;
  const albedo = new Float32Array(n * 3);
  for (let t = 0; t < n; t++)
    albedo.set(colours?.(t) ?? [0.8, 0.8, 0.8], t * 3);
  return {
    tris: r.tris,
    albedo,
    chart: lay.chart,
    charts: lay.charts,
    size: lay.size,
    windows: [
      {
        o: [r.win.x0, r.win.y0, -r.h],
        u: [r.win.x1 - r.win.x0, 0, 0],
        v: [0, r.win.y1 - r.win.y0, 0],
      },
    ],
    sky: { up: [1, 1, 1], horizon: [1, 1, 1], ground: [0, 0, 0] },
    sun: null,
    lamps: [],
    away: [0, 0, 0],
    rays: 48,
    bounces,
  };
};

/** the mean irradiance (R, G, B) over a chart's texels whose point passes */
const meanOver = (
  job: GiJob,
  out: Float32Array,
  normalY: number,
  where: (p: V3) => boolean = () => true,
): V3 => {
  const [Wt] = job.size;
  const s: V3 = [0, 0, 0];
  let n = 0;
  for (const c of job.charts) {
    if (Math.abs(c.n[1] - normalY) > 0.01) continue;
    if (normalY === 0 && Math.abs(c.n[1]) > 0.01) continue;
    for (let j = 0; j < c.h; j++)
      for (let i = 0; i < c.w; i++) {
        const k = (c.y + j) * Wt + c.x + i;
        if (!out[k * 4 + 3]) continue;
        const p: V3 = [
          c.o[0] + c.u[0] * (i + 0.5) + c.v[0] * (j + 0.5),
          c.o[1] + c.u[1] * (i + 0.5) + c.v[1] * (j + 0.5),
          c.o[2] + c.u[2] * (i + 0.5) + c.v[2] * (j + 0.5),
        ];
        if (!where(p)) continue;
        for (let a = 0; a < 3; a++) s[a]! += out[k * 4 + a]!;
        n++;
      }
  }
  return [s[0] / n, s[1] / n, s[2] / n];
};

describe("the room's bounced light (round 9, Part 1)", () => {
  it("finds a ray's first triangle through the tree", () => {
    const r = room();
    const tree = buildTree(r.tris);
    // straight down from the middle: the floor, 1.3 m away
    const down = trace(tree, 0, 1.3, 0, 0, -1, 0);
    expect(down.t).toBeCloseTo(1.3, 5);
    // out through the window's middle: nothing in the room
    const out = trace(tree, 0, 1.5, 0, 0, 0, -1);
    expect(out.tri).toBe(-1);
    // at the wall beside the window: the north wall, 2 m away
    const wall = trace(tree, -1.5, 1.5, 0, 0, 0, -1);
    expect(wall.t).toBeCloseTo(2, 5);
  });

  it("lays each flat surface as a chart, the window's hole left out", () => {
    const r = room();
    const receivers = Array.from({ length: r.shell }, (_, i) => i);
    const lay = layoutGi(r.tris, receivers, 6, 512);
    // floor, ceiling and four walls
    expect(lay.charts.length).toBe(6);
    expect([...lay.chart].every((c) => c >= 0)).toBe(true);
    // a vertex's place in the atlas lies within its chart's rectangle
    const north = lay.charts.find((c) => c.n[2] > 0.99)!;
    const [u, v] = atlasUv(north, lay.size, [0, 0.5, -2]);
    expect(u * lay.size[0]).toBeGreaterThanOrEqual(north.x - 0.01);
    expect(u * lay.size[0]).toBeLessThanOrEqual(north.x + north.w + 0.01);
    expect(v * lay.size[1]).toBeGreaterThanOrEqual(north.y - 0.01);
    expect(v * lay.size[1]).toBeLessThanOrEqual(north.y + north.h + 0.01);
    const job = jobOf(r, 1);
    const out = bakeGi(job).irradiance;
    // the window's texels on the north wall are not the wall's
    const [Wt] = job.size;
    const s = (0 - north.o[0]) / north.u[0];
    const t = (1.5 - north.o[1]) / north.v[1];
    const k = (north.y + Math.floor(t)) * Wt + north.x + Math.floor(s);
    expect(out[k * 4 + 3]).toBe(0);
  });

  it("lights a ceiling only by what the room gives back: dark after one gather, lit after two", () => {
    const r = room();
    const one = jobOf(r, 1);
    const two = jobOf(r, 2);
    const ceilingOne = meanOver(one, bakeGi(one).irradiance, -1);
    const ceilingTwo = meanOver(two, bakeGi(two).irradiance, -1);
    // looking down through the window it sees the black ground only
    expect(ceilingOne[0]).toBeLessThan(0.02);
    expect(ceilingTwo[0]).toBeGreaterThan(0.02);
    expect(ceilingTwo[0]).toBeGreaterThan(ceilingOne[0] * 5);
  });

  it("falls off away from the window", () => {
    const r = room();
    const job = jobOf(r, 2);
    const out = bakeGi(job).irradiance;
    const near = meanOver(job, out, 1, (p) => p[2] < -1.2);
    const far = meanOver(job, out, 1, (p) => p[2] > 1.2);
    expect(near[0]).toBeGreaterThan(far[0] * 1.5);
  });

  it("carries a coloured piece's colour onto the floor beside it", () => {
    // a red box by the window's side of the room, 0.8 m wide, 0.6 high
    const red = boxTris([-1.2, 0, -1.2], [-0.4, 0.6, -0.4]);
    const r = room(red);
    const job = jobOf(r, 2, (t) =>
      t >= r.shell ? [0.7, 0.08, 0.05] : [0.8, 0.8, 0.8],
    );
    const out = bakeGi(job).irradiance;
    const near = meanOver(
      job,
      out,
      1,
      (p) => p[0] > -0.35 && p[0] < -0.05 && p[2] > -1.2 && p[2] < -0.4,
    );
    const away = meanOver(
      job,
      out,
      1,
      (p) => p[0] > 0.6 && p[0] < 1.2 && p[2] > -1.2 && p[2] < -0.4,
    );
    // redder by the box than across the room, at the same distance from
    // the window
    expect(near[0] / near[1]).toBeGreaterThan((away[0] / away[1]) * 1.03);
  });

  it("keys a job by what it reads", () => {
    const r = room();
    const a = jobOf(r, 2);
    const b = jobOf(r, 2);
    expect(giKey(a)).toBe(giKey(b));
    const moved = room(boxTris([0, 0, 0], [0.5, 0.5, 0.5]));
    expect(giKey(jobOf(moved, 2))).not.toBe(giKey(a));
    const dusk = jobOf(r, 2);
    dusk.sky = {
      up: [0.1, 0.1, 0.2],
      horizon: [0.1, 0.1, 0.2],
      ground: [0, 0, 0],
    };
    expect(giKey(dusk)).not.toBe(giKey(a));
  });

  it("writes half floats three reads back", () => {
    for (const x of [0, 1e-6, 0.0004, 0.5, 1, 2.4, 13.7, 600])
      expect(
        Math.abs(DataUtils.fromHalfFloat(halfOf(x)) - x),
      ).toBeLessThanOrEqual(x * 0.001 + 1e-7);
    // rounded to the nearest (three's own truncates): never further
    // than three's from the number
    for (const x of [0.5, 2.4, 13.7, 600])
      expect(
        Math.abs(DataUtils.fromHalfFloat(halfOf(x)) - x),
      ).toBeLessThanOrEqual(
        Math.abs(DataUtils.fromHalfFloat(DataUtils.toHalfFloat(x)) - x),
      );
  });

  it("keeps a room's whole bake waiting when its quick first look comes after it", () => {
    const whole = { id: "a", whole: true, n: 1 };
    const quick = { id: "a", whole: false, n: 2 };
    const other = { id: "b", whole: false, n: 3 };
    // the first look second: the whole bake stays
    expect(waitBehindFade([whole], quick)).toEqual([whole]);
    // another room's bake waits beside it
    expect(waitBehindFade([whole], other)).toEqual([whole, other]);
    // a newer whole bake takes the place of the room's last one
    const newer = { id: "a", whole: true, n: 4 };
    expect(waitBehindFade([whole, other], newer)).toEqual([other, newer]);
    // and a whole bake takes the place of a first look
    expect(waitBehindFade([quick], whole)).toEqual([whole]);
  });

  it("lays a bake in its layer and fades the next one in only while the camera is still", () => {
    const side = 8;
    const data = new Uint16Array(side * side * 4 * 3);
    // a 3 × 2 atlas into layer 1, row by row
    const half = new Uint16Array(3 * 2 * 4).map((_, i) => i + 1);
    writeLayer(data, side, 1, half, [3, 2]);
    const base = side * side * 4;
    expect([...data.subarray(base, base + 12)]).toEqual([
      ...half.subarray(0, 12),
    ]);
    expect([...data.subarray(base + side * 4, base + side * 4 + 12)]).toEqual([
      ...half.subarray(12, 24),
    ]);
    expect(data[base + 12]).toBe(0);
    // the fade: held while the camera moves, done in its time
    let t = 0;
    t = fadeOn(t, 100, 400, true);
    expect(t).toBe(0);
    t = fadeOn(t, 100, 400, false);
    expect(t).toBeCloseTo(0.25);
    for (let i = 0; i < 10; i++) t = fadeOn(t, 100, 400, false);
    expect(t).toBe(1);
    // done: the spare (2) made the room's own (1)
    writeLayer(
      data,
      side,
      2,
      half.map((x) => x * 2),
      [3, 2],
    );
    copyLayer(data, side, 2, 1);
    expect(data[base]).toBe(2);
    expect(data[base + side * 4]).toBe(26);
  });
});
