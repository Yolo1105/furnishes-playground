import { hash01 } from "./seeded";

/**
 * The room's bounced light, baked (round 9, Part 1). The live view's
 * light is real time: the sun, the windows' area lights, a hemisphere's
 * fill and the probes. None of it carries light from one surface to
 * another, so the sunlit floor never lights the ceiling and an orange
 * sofa never warms the floor beside it. This bakes that light for the
 * room's own surfaces (its shell) whenever the room stops changing:
 *
 * - the triangles of the room as it is drawn (the shell, and its pieces
 *   as they stand, each with its colour), searched through a bounding
 *   box tree (`buildTree`);
 * - the sky through the window openings: a ray that leaves the room
 *   through a window returns the sky's radiance in its direction (the
 *   ground outside below the horizon); one that leaves by a doorway
 *   returns `away`, what the next room gives back;
 * - the direct light first (the sun through the openings, the lamps),
 *   which is not kept (the live view draws it, with its shadows), only
 *   carried on: each surface gives back its colour times the light on it;
 * - then `bounces` gathers: from every texel of the shell's charts,
 *   `rays` cosine-weighted rays, each returning what it meets (the
 *   radiance of the texel it lands on, a piece's estimate, the sky);
 * - a blur within each chart, and the charts' borders filled outward so
 *   the texture's filtering never reads the empty atlas.
 *
 * What is kept is irradiance (the light arriving, in the scene's light
 * units, as three's light map adds it): the sky's through the windows
 * and everything that has bounced at least once. Pure, so the bake
 * worker runs it and the tests read it.
 */

export type V3 = [number, number, number];
/** one of the shell's flat surfaces laid in the atlas: its corner, the
    step one texel takes across (u) and down (v), m, its normal, its
    size in texels and its place in the atlas */
export type GiChart = {
  o: V3;
  u: V3;
  v: V3;
  n: V3;
  w: number;
  h: number;
  x: number;
  y: number;
};
/** a window's opening: a rectangle `o + s·u + t·v`, s and t in 0–1 */
export type GiWindow = { o: V3; u: V3; v: V3 };
/** a lamp: a bulb (light all round), or a downlight whose light falls
    within `cone` (the cosine of its edge from straight down), softly to
    its edge as three's spot with its penumbra at 1 */
export type GiLamp = { at: V3; intensity: V3; reach: number; cone?: number };
export type GiJob = {
  /** the triangles, 9 numbers each (world, m) */
  tris: Float32Array;
  /** each triangle's colour, linear, 3 numbers each */
  albedo: Float32Array;
  /** each triangle's chart, or −1 for one that only casts and reflects
      (a piece, the trim) */
  chart: Int32Array;
  charts: GiChart[];
  /** the atlas's size, texels */
  size: [number, number];
  windows: GiWindow[];
  /** the sky's radiance seen straight up, at the horizon and the
      ground's below it, linear */
  sky: { up: V3; horizon: V3; ground: V3 };
  /** the sun: the way to it and its irradiance on a face square to it */
  sun: { to: V3; irradiance: V3 } | null;
  lamps: GiLamp[];
  /** what a doorway gives back: the next room's light, linear radiance */
  away: V3;
  rays: number;
  bounces: number;
  /** the texels either side a texel's light is smoothed over, within
      its chart (2 when not given: 5 × 5) */
  blur?: number;
};
export type GiResult = {
  /** RGBA, the irradiance in RGB and in A whether the texel is a
      surface's (1) or filled from one (0) */
  irradiance: Float32Array;
  /** the mean irradiance over the shell, for the report and the meter */
  mean: V3;
};

/* ---------- vectors ---------- */

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/* ---------- the tree ---------- */

/** a node of the bounding box tree: its box, and either its two
    children or its run of triangles in `order` */
type TreeNode = {
  lo: V3;
  hi: V3;
  a: number;
  b: number;
  from: number;
  count: number;
};
export type Tree = {
  nodes: TreeNode[];
  order: Int32Array;
  tris: Float32Array;
};
/** the most triangles a leaf holds */
const LEAF = 6;

/** a bounding box tree over the triangles, split at the middle of each
    node's longest axis of centroids */
export const buildTree = (tris: Float32Array): Tree => {
  const n = tris.length / 9;
  const order = new Int32Array(n);
  const centre = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    order[i] = i;
    for (let k = 0; k < 3; k++)
      centre[i * 3 + k] =
        (tris[i * 9 + k]! + tris[i * 9 + 3 + k]! + tris[i * 9 + 6 + k]!) / 3;
  }
  const nodes: TreeNode[] = [];
  const make = (from: number, count: number): number => {
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    const clo: V3 = [Infinity, Infinity, Infinity];
    const chi: V3 = [-Infinity, -Infinity, -Infinity];
    for (let i = from; i < from + count; i++) {
      const t = order[i]!;
      for (let v = 0; v < 3; v++)
        for (let k = 0; k < 3; k++) {
          const x = tris[t * 9 + v * 3 + k]!;
          if (x < lo[k]!) lo[k] = x;
          if (x > hi[k]!) hi[k] = x;
        }
      for (let k = 0; k < 3; k++) {
        const c = centre[t * 3 + k]!;
        if (c < clo[k]!) clo[k] = c;
        if (c > chi[k]!) chi[k] = c;
      }
    }
    const id = nodes.length;
    nodes.push({ lo, hi, a: -1, b: -1, from, count });
    if (count <= LEAF) return id;
    let axis = 0;
    for (let k = 1; k < 3; k++)
      if (chi[k]! - clo[k]! > chi[axis]! - clo[axis]!) axis = k;
    const mid = (clo[axis]! + chi[axis]!) / 2;
    // partition the run about the middle
    let i = from;
    let j = from + count - 1;
    while (i <= j) {
      if (centre[order[i]! * 3 + axis]! < mid) i++;
      else {
        const s = order[i]!;
        order[i] = order[j]!;
        order[j] = s;
        j--;
      }
    }
    let left = i - from;
    // all on one side (centroids at one point): split the run in half
    if (left === 0 || left === count) left = count >> 1;
    const a = make(from, left);
    const b = make(from + left, count - left);
    nodes[id] = { lo, hi, a, b, from, count: 0 };
    return id;
  };
  if (n > 0) make(0, n);
  return { nodes, order, tris };
};

const EPS = 1e-7;
/** a ray's first triangle, and how far along: Möller–Trumbore */
export const trace = (
  tree: Tree,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  far = Infinity,
): { t: number; tri: number } => {
  let best = far;
  let hit = -1;
  if (!tree.nodes.length) return { t: Infinity, tri: -1 };
  const ix = 1 / dx;
  const iy = 1 / dy;
  const iz = 1 / dz;
  const stack: number[] = [0];
  const tr = tree.tris;
  while (stack.length) {
    const node = tree.nodes[stack.pop()!]!;
    // the ray against the node's box
    let t0 = (node.lo[0] - ox) * ix;
    let t1 = (node.hi[0] - ox) * ix;
    let lo = Math.min(t0, t1);
    let hi = Math.max(t0, t1);
    t0 = (node.lo[1] - oy) * iy;
    t1 = (node.hi[1] - oy) * iy;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    t0 = (node.lo[2] - oz) * iz;
    t1 = (node.hi[2] - oz) * iz;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
    if (!(hi >= Math.max(lo, 0)) || lo > best) continue;
    if (node.a >= 0) {
      stack.push(node.a, node.b);
      continue;
    }
    for (let i = node.from; i < node.from + node.count; i++) {
      const t = tree.order[i]!;
      const o = t * 9;
      const ax = tr[o]!;
      const ay = tr[o + 1]!;
      const az = tr[o + 2]!;
      const e1x = tr[o + 3]! - ax;
      const e1y = tr[o + 4]! - ay;
      const e1z = tr[o + 5]! - az;
      const e2x = tr[o + 6]! - ax;
      const e2y = tr[o + 7]! - ay;
      const e2z = tr[o + 8]! - az;
      const px = dy * e2z - dz * e2y;
      const py = dz * e2x - dx * e2z;
      const pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (det > -EPS && det < EPS) continue;
      const inv = 1 / det;
      const sx = ox - ax;
      const sy = oy - ay;
      const sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d > EPS && d < best) {
        best = d;
        hit = t;
      }
    }
  }
  return { t: hit >= 0 ? best : Infinity, tri: hit };
};

/* ---------- the charts ---------- */

/** a point of a chart, from its texel coordinates (texels, from its
    corner) */
const chartPoint = (c: GiChart, s: number, t: number): V3 => [
  c.o[0] + c.u[0] * s + c.v[0] * t,
  c.o[1] + c.u[1] * s + c.v[1] * t,
  c.o[2] + c.u[2] * s + c.v[2] * t,
];
/** a point's texel coordinates on a chart */
const chartAt = (c: GiChart, p: V3): [number, number] => {
  const d = sub(p, c.o);
  return [dot(d, c.u) / dot(c.u, c.u), dot(d, c.v) / dot(c.v, c.v)];
};

/** whether a point on a triangle's plane lies within it (barycentric,
    with a margin) */
const within = (tr: Float32Array, t: number, p: V3, margin: number) => {
  const o = t * 9;
  const a: V3 = [tr[o]!, tr[o + 1]!, tr[o + 2]!];
  const b: V3 = [tr[o + 3]!, tr[o + 4]!, tr[o + 5]!];
  const c: V3 = [tr[o + 6]!, tr[o + 7]!, tr[o + 8]!];
  const v0 = sub(c, a);
  const v1 = sub(b, a);
  const v2 = sub(p, a);
  const d00 = dot(v0, v0);
  const d01 = dot(v0, v1);
  const d02 = dot(v0, v2);
  const d11 = dot(v1, v1);
  const d12 = dot(v1, v2);
  const den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-14) return false;
  const u = (d11 * d02 - d01 * d12) / den;
  const v = (d00 * d12 - d01 * d02) / den;
  return u >= -margin && v >= -margin && u + v <= 1 + margin;
};

/* ---------- the light ---------- */

/** the sky's radiance in a direction (a ray that left by a window) */
const skyIn = (job: GiJob, dy: number): V3 => {
  const { up, horizon, ground } = job.sky;
  if (dy < 0) return ground;
  const k = Math.min(1, dy);
  return [
    horizon[0] + (up[0] - horizon[0]) * k,
    horizon[1] + (up[1] - horizon[1]) * k,
    horizon[2] + (up[2] - horizon[2]) * k,
  ];
};
/** whether a ray from a point, once out of the room, passed through a
    window (and so sees the sky) */
const byWindow = (job: GiJob, p: V3, d: V3) => {
  for (const w of job.windows) {
    const n = cross(w.u, w.v);
    const den = dot(n, d);
    if (Math.abs(den) < 1e-9) continue;
    const t = dot(sub(w.o, p), n) / den;
    if (t <= 0) continue;
    const q: V3 = [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
    const r = sub(q, w.o);
    const s = dot(r, w.u) / dot(w.u, w.u);
    const tt = dot(r, w.v) / dot(w.v, w.v);
    if (s >= -0.01 && s <= 1.01 && tt >= -0.01 && tt <= 1.01) return true;
  }
  return false;
};

/** how far off a surface a ray starts, m */
const LIFT = 0.004;
/** the golden angle, for the rays' spiral */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** the direct light at a point facing `n`: the sun where it is seen
    through an opening, and each lamp it can see */
const directAt = (job: GiJob, tree: Tree, p: V3, n: V3): V3 => {
  const out: V3 = [0, 0, 0];
  const sun = job.sun;
  if (sun) {
    const c = dot(n, sun.to);
    if (c > 0) {
      const h = trace(tree, p[0], p[1], p[2], sun.to[0], sun.to[1], sun.to[2]);
      if (h.tri < 0 && byWindow(job, p, sun.to))
        for (let k = 0; k < 3; k++) out[k]! += sun.irradiance[k]! * c;
    }
  }
  for (const lamp of job.lamps) {
    const d = sub(lamp.at, p);
    const r = Math.hypot(d[0], d[1], d[2]);
    if (r < 1e-3 || r > lamp.reach) continue;
    const l: V3 = [d[0] / r, d[1] / r, d[2] / r];
    const c = dot(n, l);
    if (c <= 0) continue;
    // a downlight: the cosine from straight down is the way up to it
    let spot = 1;
    if (lamp.cone !== undefined) {
      const x = Math.min(1, Math.max(0, (l[1] - lamp.cone) / (1 - lamp.cone)));
      spot = x * x * (3 - 2 * x);
      if (spot <= 0) continue;
    }
    const h = trace(tree, p[0], p[1], p[2], l[0], l[1], l[2], r - 0.02);
    if (h.tri >= 0) continue;
    // the reach as three's point light falls to nothing at its distance
    const fall = Math.max(0, 1 - (r / lamp.reach) ** 4) ** 2;
    for (let k = 0; k < 3; k++)
      out[k]! += (lamp.intensity[k]! * c * fall * spot) / (r * r);
  }
  return out;
};

/** a triangle's area, m² */
const triArea = (tr: Float32Array, t: number) => {
  const o = t * 9;
  const a: V3 = [tr[o]!, tr[o + 1]!, tr[o + 2]!];
  const n = cross(
    sub([tr[o + 3]!, tr[o + 4]!, tr[o + 5]!], a),
    sub([tr[o + 6]!, tr[o + 7]!, tr[o + 8]!], a),
  );
  return Math.hypot(n[0], n[1], n[2]) / 2;
};

/** a triangle's normal and centre */
const triFrame = (tr: Float32Array, t: number) => {
  const o = t * 9;
  const a: V3 = [tr[o]!, tr[o + 1]!, tr[o + 2]!];
  const b: V3 = [tr[o + 3]!, tr[o + 4]!, tr[o + 5]!];
  const c: V3 = [tr[o + 6]!, tr[o + 7]!, tr[o + 8]!];
  const n = cross(sub(b, a), sub(c, a));
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return {
    n: [n[0] / l, n[1] / l, n[2] / l] as V3,
    c: [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ] as V3,
  };
};

/** a cosine-weighted direction about `n`, the k-th of `count` on a
    golden spiral turned by `turn` */
const cosineRay = (n: V3, k: number, count: number, turn: number): V3 => {
  const tx0 = Math.abs(n[0]) < 0.9 ? 1 : 0;
  const t = cross(n, [tx0, 1 - tx0, 0]);
  const tl = Math.hypot(t[0], t[1], t[2]) || 1;
  const tu: V3 = [t[0] / tl, t[1] / tl, t[2] / tl];
  const b = cross(n, tu);
  const r = Math.sqrt((k + 0.5) / count);
  const phi = k * GOLDEN + turn;
  const a = r * Math.cos(phi);
  const c = r * Math.sin(phi);
  const up = Math.sqrt(Math.max(0, 1 - r * r));
  return [
    tu[0] * a + b[0] * c + n[0] * up,
    tu[1] * a + b[1] * c + n[1] * up,
    tu[2] * a + b[2] * c + n[2] * up,
  ];
};

/** the bake */
export const bakeGi = (job: GiJob): GiResult => {
  const tree = buildTree(job.tris);
  const [W, H] = job.size;
  const tex = W * H;
  // the texels each chart's triangles cover, and where they stand
  const used = new Uint8Array(tex);
  const pts = new Float32Array(tex * 3);
  const nrm = new Float32Array(tex * 3);
  const albedoOf = new Float32Array(tex * 3);
  const byChart: number[][] = job.charts.map(() => []);
  for (let t = 0; t < job.chart.length; t++) {
    const c = job.chart[t]!;
    if (c >= 0) byChart[c]!.push(t);
  }
  job.charts.forEach((c, ci) => {
    const own = byChart[ci]!;
    for (let j = 0; j < c.h; j++)
      for (let i = 0; i < c.w; i++) {
        const p = chartPoint(c, i + 0.5, j + 0.5);
        // a texel is its surface's where its middle, or near enough to
        // it (half a texel round), falls on one of the chart's triangles
        const on = own.find((t) => within(job.tris, t, p, 0.02));
        if (on === undefined) continue;
        const k = (c.y + j) * W + c.x + i;
        used[k] = 1;
        for (let a = 0; a < 3; a++) {
          pts[k * 3 + a] = p[a]! + c.n[a]! * LIFT;
          nrm[k * 3 + a] = c.n[a]!;
          albedoOf[k * 3 + a] = job.albedo[on * 3 + a]!;
        }
      }
  });
  const point = (k: number): V3 => [
    pts[k * 3]!,
    pts[k * 3 + 1]!,
    pts[k * 3 + 2]!,
  ];
  const normal = (k: number): V3 => [
    nrm[k * 3]!,
    nrm[k * 3 + 1]!,
    nrm[k * 3 + 2]!,
  ];
  // the direct light at every texel, and at every other triangle's
  // middle (a piece's estimate)
  const direct = new Float32Array(tex * 3);
  for (let k = 0; k < tex; k++) {
    if (!used[k]) continue;
    const e = directAt(job, tree, point(k), normal(k));
    direct.set(e, k * 3);
  }
  const triCount = job.chart.length;
  const triDirect = new Float32Array(triCount * 3);
  const frames = Array.from({ length: triCount }, (_, t) =>
    triFrame(job.tris, t),
  );
  for (let t = 0; t < triCount; t++) {
    if (job.chart[t]! >= 0) continue;
    const f = frames[t]!;
    const p: V3 = [
      f.c[0] + f.n[0] * LIFT,
      f.c[1] + f.n[1] * LIFT,
      f.c[2] + f.n[2] * LIFT,
    ];
    triDirect.set(directAt(job, tree, p, f.n), t * 3);
  }
  // the gathers: what each texel receives from the rest
  let indirect = new Float32Array(tex * 3);
  let mean: V3 = [0, 0, 0];
  for (let pass = 0; pass < job.bounces; pass++) {
    const next = new Float32Array(tex * 3);
    for (let k = 0; k < tex; k++) {
      if (!used[k]) continue;
      const p = point(k);
      const n = normal(k);
      const turn = hash01(k + pass * 7919) * Math.PI * 2;
      const sum: V3 = [0, 0, 0];
      for (let r = 0; r < job.rays; r++) {
        const d = cosineRay(n, r, job.rays, turn);
        const h = trace(tree, p[0], p[1], p[2], d[0], d[1], d[2]);
        let L: V3;
        if (h.tri < 0) {
          L = byWindow(job, p, d) ? skyIn(job, d[1]) : job.away;
        } else {
          const ci = job.chart[h.tri]!;
          const al: V3 = [
            job.albedo[h.tri * 3]!,
            job.albedo[h.tri * 3 + 1]!,
            job.albedo[h.tri * 3 + 2]!,
          ];
          let e: V3;
          if (ci >= 0) {
            // the texel it lands on: its direct light and what it had
            // gathered by the last pass
            const c = job.charts[ci]!;
            const q: V3 = [
              p[0] + d[0] * h.t,
              p[1] + d[1] * h.t,
              p[2] + d[2] * h.t,
            ];
            const [s, t] = chartAt(c, q);
            const i = Math.min(c.w - 1, Math.max(0, Math.floor(s)));
            const j = Math.min(c.h - 1, Math.max(0, Math.floor(t)));
            const kk = (c.y + j) * W + c.x + i;
            e = used[kk]
              ? [
                  direct[kk * 3]! + indirect[kk * 3]!,
                  direct[kk * 3 + 1]! + indirect[kk * 3 + 1]!,
                  direct[kk * 3 + 2]! + indirect[kk * 3 + 2]!,
                ]
              : [mean[0], mean[1], mean[2]];
          } else {
            // a piece: its own direct light and the room's mean
            e = [
              triDirect[h.tri * 3]! + mean[0],
              triDirect[h.tri * 3 + 1]! + mean[1],
              triDirect[h.tri * 3 + 2]! + mean[2],
            ];
          }
          L = [
            (al[0] * e[0]) / Math.PI,
            (al[1] * e[1]) / Math.PI,
            (al[2] * e[2]) / Math.PI,
          ];
        }
        sum[0] += L[0];
        sum[1] += L[1];
        sum[2] += L[2];
      }
      // a cosine-weighted estimate of the irradiance: π times the mean
      for (let a = 0; a < 3; a++)
        next[k * 3 + a] = (Math.PI * sum[a]!) / job.rays;
    }
    indirect = next;
    let n = 0;
    const m: V3 = [0, 0, 0];
    for (let k = 0; k < tex; k++) {
      if (!used[k]) continue;
      n++;
      for (let a = 0; a < 3; a++) m[a]! += indirect[k * 3 + a]!;
    }
    mean = n ? [m[0] / n, m[1] / n, m[2] / n] : [0, 0, 0];
  }
  // smoothed within each chart, then the empty texels round each filled
  const smooth = smoothCharts(indirect, used, job.charts, W, job.blur ?? 2);
  const irradiance = new Float32Array(tex * 4);
  for (let k = 0; k < tex; k++) {
    irradiance[k * 4] = smooth[k * 3]!;
    irradiance[k * 4 + 1] = smooth[k * 3 + 1]!;
    irradiance[k * 4 + 2] = smooth[k * 3 + 2]!;
    irradiance[k * 4 + 3] = used[k]!;
  }
  dilate(irradiance, W, H, GI_PAD);
  return { irradiance, mean };
};

/** how many texels the charts' borders are filled outward */
export const GI_PAD = 2;

/** each chart's texels blurred over (2 `r` + 1)² among its own used
    texels (a texel never takes a neighbour chart's light, nor an empty
    one's) */
const smoothCharts = (
  v: Float32Array,
  used: Uint8Array,
  charts: GiChart[],
  W: number,
  r: number,
) => {
  const out = Float32Array.from(v);
  for (const c of charts)
    for (let j = 0; j < c.h; j++)
      for (let i = 0; i < c.w; i++) {
        const k = (c.y + j) * W + c.x + i;
        if (!used[k]) continue;
        const s: V3 = [0, 0, 0];
        let n = 0;
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= c.w || jj >= c.h) continue;
            const q = (c.y + jj) * W + c.x + ii;
            if (!used[q]) continue;
            for (let a = 0; a < 3; a++) s[a]! += v[q * 3 + a]!;
            n++;
          }
        for (let a = 0; a < 3; a++) out[k * 3 + a] = s[a]! / n;
      }
  return out;
};

/** the empty texels next to filled ones take their mean, a ring at a
    time, `rings` times (alpha stays 0: they are filled, not surfaces) */
const dilate = (rgba: Float32Array, W: number, H: number, rings: number) => {
  const filled = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) filled[k] = rgba[k * 4 + 3]! > 0 ? 1 : 0;
  for (let ring = 0; ring < rings; ring++) {
    const next = filled.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (filled[k]) continue;
        const s: V3 = [0, 0, 0];
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const q = yy * W + xx;
            if (!filled[q]) continue;
            for (let a = 0; a < 3; a++) s[a]! += rgba[q * 4 + a]!;
            n++;
          }
        if (!n) continue;
        for (let a = 0; a < 3; a++) rgba[k * 4 + a] = s[a]! / n;
        next[k] = 1;
      }
    filled.set(next);
  }
};

/* ---------- the charts laid out ---------- */

/** a flat surface to chart: its triangles, all in one plane */
export type GiSurface = { tris: number[]; n: V3 };

/**
 * The shell's triangles grouped into flat surfaces (the same plane,
 * to a millimetre and a degree or so), each laid as a chart at
 * `density` texels a metre, packed in rows into an atlas `max` texels
 * across at most (coarser if they would not fit), with `GI_PAD` round
 * each. Returns the charts and, for each triangle, its chart.
 */
export const layoutGi = (
  tris: Float32Array,
  receivers: number[],
  density: number,
  max: number,
) => {
  const planes: { n: V3; d: number; tris: number[] }[] = [];
  for (const t of receivers) {
    // a sliver with no area has no plane: it takes no light of its own
    if (triArea(tris, t) < 1e-8) continue;
    const f = triFrame(tris, t);
    const d = dot(f.n, f.c);
    const p = planes.find(
      (q) => dot(q.n, f.n) > 0.9995 && Math.abs(q.d - d) < 0.002,
    );
    if (p) p.tris.push(t);
    else planes.push({ n: f.n, d, tris: [t] });
  }
  // each plane's own axes, and its extent along them
  const frames = planes.map((p) => {
    const ref: V3 = Math.abs(p.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const a = cross(ref, p.n);
    const al = Math.hypot(a[0], a[1], a[2]);
    const ua: V3 = [a[0] / al, a[1] / al, a[2] / al];
    const va = cross(p.n, ua);
    let s0 = Infinity;
    let s1 = -Infinity;
    let t0 = Infinity;
    let t1 = -Infinity;
    let base: V3 = [0, 0, 0];
    for (const t of p.tris)
      for (let v = 0; v < 3; v++) {
        const q: V3 = [
          tris[t * 9 + v * 3]!,
          tris[t * 9 + v * 3 + 1]!,
          tris[t * 9 + v * 3 + 2]!,
        ];
        base = q;
        const s = dot(q, ua);
        const tt = dot(q, va);
        s0 = Math.min(s0, s);
        s1 = Math.max(s1, s);
        t0 = Math.min(t0, tt);
        t1 = Math.max(t1, tt);
      }
    // the plane's corner: base moved to (s0, t0) within the plane
    const bs = dot(base, ua);
    const bt = dot(base, va);
    const o: V3 = [
      base[0] + ua[0] * (s0 - bs) + va[0] * (t0 - bt),
      base[1] + ua[1] * (s0 - bs) + va[1] * (t0 - bt),
      base[2] + ua[2] * (s0 - bs) + va[2] * (t0 - bt),
    ];
    return { ua, va, o, size: [s1 - s0, t1 - t0] as [number, number] };
  });
  let dens = density;
  for (;;) {
    const sized = frames.map((f) => ({
      w: Math.max(2, Math.ceil(f.size[0] * dens)),
      h: Math.max(2, Math.ceil(f.size[1] * dens)),
    }));
    const order = sized
      .map((_, i) => i)
      .sort((a, b) => sized[b]!.h - sized[a]!.h);
    const placed: { x: number; y: number }[] = new Array(sized.length);
    let x = 0;
    let y = 0;
    let row = 0;
    let fits = true;
    for (const i of order) {
      const s = sized[i]!;
      const cw = s.w + 2 * GI_PAD;
      const ch = s.h + 2 * GI_PAD;
      if (cw > max) {
        fits = false;
        break;
      }
      if (x + cw > max) {
        x = 0;
        y += row;
        row = 0;
      }
      placed[i] = { x: x + GI_PAD, y: y + GI_PAD };
      x += cw;
      row = Math.max(row, ch);
    }
    const H = y + row;
    if (fits && H <= max) {
      const charts: GiChart[] = frames.map((f, i) => {
        const s = sized[i]!;
        // a texel's step: the chart's extent over its texels, so the
        // chart covers its plane's extent exactly
        const su = (f.size[0] || 1 / dens) / s.w;
        const sv = (f.size[1] || 1 / dens) / s.h;
        return {
          o: f.o,
          u: [f.ua[0] * su, f.ua[1] * su, f.ua[2] * su],
          v: [f.va[0] * sv, f.va[1] * sv, f.va[2] * sv],
          n: planes[i]!.n,
          w: s.w,
          h: s.h,
          x: placed[i]!.x,
          y: placed[i]!.y,
        };
      });
      const chart = new Int32Array(tris.length / 9).fill(-1);
      planes.forEach((p, i) => {
        for (const t of p.tris) chart[t] = i;
      });
      return {
        charts,
        chart,
        size: [max, Math.max(1, H)] as [number, number],
        density: dens,
      };
    }
    dens *= 0.85;
    if (dens < 0.5) {
      const area = frames.reduce((n, f) => n + f.size[0] * f.size[1], 0);
      const most = Math.max(...frames.map((f) => Math.max(...f.size)));
      throw new Error(
        `the room's surfaces do not fit the atlas: ${frames.length} planes, ${area.toFixed(1)} m², the longest ${most.toFixed(2)} m`,
      );
    }
  }
};

/** a point's place in the atlas, 0–1 (the light map's coordinates), for
    a vertex on a chart */
export const atlasUv = (
  c: GiChart,
  size: [number, number],
  p: V3,
): [number, number] => {
  const [s, t] = chartAt(c, p);
  return [(c.x + s) / size[0], (c.y + t) / size[1]];
};

/** a job's key: everything the bake reads, so a room unchanged finds its
    bake again (FNV-1a over the numbers, rounded to a millimetre) */
export const GI_VERSION = 1;
export const giKey = (job: GiJob) => {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    const n = Math.round(v * 1000) | 0;
    for (let s = 0; s < 32; s += 8) {
      h ^= (n >>> s) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  mix(GI_VERSION);
  mix(job.tris.length);
  for (let i = 0; i < job.tris.length; i++) mix(job.tris[i]!);
  for (let i = 0; i < job.albedo.length; i++) mix(job.albedo[i]!);
  for (let i = 0; i < job.chart.length; i++) mix(job.chart[i]!);
  job.size.forEach(mix);
  for (const w of job.windows) [...w.o, ...w.u, ...w.v].forEach(mix);
  [...job.sky.up, ...job.sky.horizon, ...job.sky.ground].forEach(mix);
  if (job.sun) [...job.sun.to, ...job.sun.irradiance].forEach(mix);
  for (const l of job.lamps)
    [...l.at, ...l.intensity, l.reach, l.cone ?? -2].forEach(mix);
  job.away.forEach(mix);
  mix(job.rays);
  mix(job.bounces);
  mix(job.blur ?? 2);
  return h.toString(36);
};

/* ---------- half floats ---------- */

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
/** a number as a half float's bits (the texture's own format, so the
    worker hands the page what it uploads) */
export const halfOf = (val: number) => {
  f32[0] = val;
  const x = u32[0]!;
  let bits = (x >> 16) & 0x8000;
  let m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) {
    bits |= 0x7c00;
    bits |= (e === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (e < 113) {
    m |= 0x0800;
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
    return bits;
  }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
};
/** a bake's irradiance as half floats, RGBA */
export const halves = (rgba: Float32Array) => {
  const out = new Uint16Array(rgba.length);
  for (let i = 0; i < rgba.length; i++) out[i] = halfOf(rgba[i]!);
  return out;
};

/* ---------- the texture's layers ---------- */

/** a bake's atlas written into a layer of the light's texture, row by
    row (the atlas in the layer's corner, texel for texel) */
export const writeLayer = (
  data: Uint16Array,
  side: number,
  layer: number,
  half: Uint16Array,
  size: [number, number],
) => {
  const [W, H] = size;
  const base = layer * side * side * 4;
  for (let j = 0; j < H; j++)
    data.set(half.subarray(j * W * 4, (j + 1) * W * 4), base + j * side * 4);
};
/** one layer copied whole onto another (a faded-in bake made the room's
    own) */
export const copyLayer = (
  data: Uint16Array,
  side: number,
  from: number,
  to: number,
) => {
  const n = side * side * 4;
  data.copyWithin(to * n, from * n, from * n + n);
};
/** the bakes waiting for a fade, with one more come: a room's newest
    bake waits in place of the one before it, but a room's quick first
    look (`whole` false) never takes the place of its whole bake. The
    two are asked for together and come back in either order: a first
    look that came second dropped the whole bake from the queue, laid
    itself, and the room stood unbaked for ever (the stage "baking",
    data-gi-hold 1/1/0/0) */
export const waitBehindFade = <D extends { id: string; whole: boolean }>(
  waiting: readonly D[],
  d: D,
): D[] =>
  !d.whole && waiting.some((w) => w.id === d.id && w.whole)
    ? [...waiting]
    : [...waiting.filter((w) => w.id !== d.id), d];

/** a fade's next share: on by the frame's time while the camera is
    still, held while it moves */
export const fadeOn = (
  t: number,
  ms: number,
  fadeMs: number,
  moving: boolean,
) => (moving ? t : Math.min(1, t + ms / fadeMs));
