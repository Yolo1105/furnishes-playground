/**
 * A piece's light, baked (round 8, 1a): how much of the room each point
 * of the piece sees, worked out once for the piece as it is built and
 * kept, so a flat face is no longer one even tone. The piece is taken
 * as boxes (its boards exactly; a leg, a cushion or a book by its box),
 * standing on the floor and, when it stands against one, before a wall.
 * From each point rays go out over the half of the world its face
 * looks at, weighted to the cosine as light arrives, and what they hit
 * is read three ways:
 *
 * - **occlusion** (R): how much of what is near (`REACH`) is open, the
 *   darkening in a bay's corners, under a shelf, down by the floor and
 *   the wall. It scales the indirect light only (the fill, the probes,
 *   the room's reflection); the sun keeps its own shadow map.
 * - **sky** (G): of the light that would come from above the horizon,
 *   how much gets through at any distance: deep in a bay little, on a
 *   top all of it. It scales the window's area lights on the piece.
 * - **contact** (the footprint): on the floor round the piece, how
 *   much the piece covers of what is above it, within `FOOT_REACH`,
 *   the soft darkening a real piece leaves where it stands.
 *
 * Each board's six faces are laid into the piece's own small atlas
 * (`layoutCharts`), a face a rectangle of texels at `DENSITY` with a
 * border of `PAD` repeating its edge, so the filtering never reads a
 * neighbour; a face no one can see (pressed against another board, or
 * the floor) gets none. Parts that are not boards (a leg, a cushion, a
 * book) keep theirs at their vertices. Pure, so the bake worker
 * (lightmap.worker.ts) runs it and the tests read it.
 */

export type V3 = [number, number, number];
/** a box in the piece's frame: its centre, its half sizes, and its turn
    as a 3 × 3 matrix (rows), when it has one */
export type BakeBox = { c: V3; h: V3; m?: number[] | undefined };
/** one face of a board laid in the atlas: the box, the face (its axis
    times two, plus one for the + side), the texel rectangle it fills
    (its inner area; the pad lies round it) */
export type BakeChart = {
  box: number;
  face: number;
  x: number;
  y: number;
  w: number;
  h: number;
};
/** what a bake is given */
export type BakeJob = {
  boxes: BakeBox[];
  /** the floor's height in the piece's frame, or none (a wall cabinet
      still sees the floor, far off: it is always there) */
  floor: number;
  /** the wall behind the piece: the plane z = `wall` (the piece's back
      is −z), when it stands within `WALL_NEAR` of one */
  wall: number | null;
  charts: BakeChart[];
  /** the atlas's size, texels */
  size: [number, number];
  /** points kept at their vertices: x, y, z, nx, ny, nz each, and the
      box each belongs to (−1 for none), which they never hit */
  points: Float32Array;
  owners: Int32Array;
  /** the floor round the piece: its rectangle in the piece's frame and
      its texels across */
  foot: {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    nx: number;
    nz: number;
  };
};
export type BakeResult = {
  /** the atlas, RGBA: occlusion, sky, 255, 255 */
  atlas: Uint8Array;
  /** occlusion and sky for each point, 0–255 */
  points: Uint8Array;
  /** the floor's light round the piece, 0–255: 255 none of it taken */
  foot: Uint8Array;
};

/** texels a metre on a board's face: 2 cm a texel, finer than the
    screen shows a piece from across the room (a bookwall 2.4 m tall is
    about 100 px of a 480 px glance); the sharp things (an edge's line,
    a joint) are drawn by the geometry and the shader, not the map. The
    brief's 2–4 texels a centimetre would be 50–200 times the rays, and
    a light that changes over decimetres gains nothing by them */
export const DENSITY = 48;
/** the most texels one piece takes; a bigger piece is baked coarser */
export const PIECE_TEXELS = 48_000;
/** the fewest texels across a face, and the border round each */
export const MIN_TEXELS = 2;
export const PAD = 2;
/** how far occlusion reaches, m */
export const REACH = 0.4;
/** rays a texel and a point: a golden spiral turned per texel, which
    the 3 × 3 blur over each face evens out (a vertex has no blur, so
    more) */
export const RAYS = 14;
export const POINT_RAYS = 20;
/** the floor's darkening reaches this far up, m, and the footprint
    this far out round the piece */
export const FOOT_REACH = 0.35;
export const FOOT_OUT = 0.2;
/** footprint texels a metre */
export const FOOT_DENSITY = 40;
/** a wall this near the piece's back, m, is a wall it stands against */
export const WALL_NEAR = 0.05;
/** how far off a surface a ray starts, m */
const LIFT = 0.0015;
const POINT_LIFT = 0.004;

const axes = [0, 1, 2] as const;
/** a face's two in-plane axes, in order */
export const faceAxes = (face: number): [number, number] => {
  const a = face >> 1;
  return a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1];
};

/** a point of a box in the piece's frame */
const toPiece = (b: BakeBox, l: V3): V3 => {
  if (!b.m) return [b.c[0] + l[0], b.c[1] + l[1], b.c[2] + l[2]];
  const m = b.m;
  return [
    b.c[0] + m[0]! * l[0] + m[1]! * l[1] + m[2]! * l[2],
    b.c[1] + m[3]! * l[0] + m[4]! * l[1] + m[5]! * l[2],
    b.c[2] + m[6]! * l[0] + m[7]! * l[1] + m[8]! * l[2],
  ];
};
const dirToPiece = (b: BakeBox, l: V3): V3 => {
  if (!b.m) return l;
  const m = b.m;
  return [
    m[0]! * l[0] + m[1]! * l[1] + m[2]! * l[2],
    m[3]! * l[0] + m[4]! * l[1] + m[5]! * l[2],
    m[6]! * l[0] + m[7]! * l[1] + m[8]! * l[2],
  ];
};

/** a point is inside the box (by a hair less than its size) */
export const inside = (b: BakeBox, p: V3, by = 1e-4) => {
  let x = p[0] - b.c[0];
  let y = p[1] - b.c[1];
  let z = p[2] - b.c[2];
  if (b.m) {
    const m = b.m;
    const lx = m[0]! * x + m[3]! * y + m[6]! * z;
    const ly = m[1]! * x + m[4]! * y + m[7]! * z;
    const lz = m[2]! * x + m[5]! * y + m[8]! * z;
    x = lx;
    y = ly;
    z = lz;
  }
  return (
    Math.abs(x) < b.h[0] - by &&
    Math.abs(y) < b.h[1] - by &&
    Math.abs(z) < b.h[2] - by
  );
};

/** where on a face a point stands (0–1 across each in-plane axis), in
    the piece's frame, with its normal */
export const facePoint = (b: BakeBox, face: number, s: number, t: number) => {
  const a = face >> 1;
  const sign = face & 1 ? 1 : -1;
  const [u, v] = faceAxes(face);
  const l: V3 = [0, 0, 0];
  l[a] = sign * b.h[a]!;
  l[u] = (2 * s - 1) * b.h[u]!;
  l[v] = (2 * t - 1) * b.h[v]!;
  const n: V3 = [0, 0, 0];
  n[a] = sign;
  return { p: toPiece(b, l), n: dirToPiece(b, n) };
};

/** a face is out of sight: pressed against another box, or the floor,
    or the wall, at its middle and its four corners */
const hidden = (boxes: BakeBox[], k: number, face: number, floor: number) => {
  const b = boxes[k]!;
  for (const [s, t] of [
    [0.5, 0.5],
    [0.1, 0.1],
    [0.9, 0.1],
    [0.1, 0.9],
    [0.9, 0.9],
  ] as const) {
    const { p, n } = facePoint(b, face, s, t);
    const q: V3 = [
      p[0] + n[0] * 0.002,
      p[1] + n[1] * 0.002,
      p[2] + n[2] * 0.002,
    ];
    if (q[1] < floor) continue;
    if (!boxes.some((o, i) => i !== k && inside(o, q, 0))) return false;
  }
  return true;
};

/**
 * Each seen face of each board laid into one atlas for the piece: the
 * faces' rectangles at `DENSITY` (coarser if the piece would pass
 * `PIECE_TEXELS`), at least `MIN_TEXELS` across, `PAD` round each,
 * packed in rows tallest first. `boards` are the boxes that are boards
 * (the rest are kept at their vertices).
 */
export const layoutCharts = (
  boxes: BakeBox[],
  boards: number[],
  floor: number,
) => {
  const faces: { box: number; face: number; m: [number, number] }[] = [];
  let area = 0;
  for (const k of boards) {
    const b = boxes[k]!;
    for (let face = 0; face < 6; face++) {
      if (hidden(boxes, k, face, floor)) continue;
      const [u, v] = faceAxes(face);
      const m: [number, number] = [2 * b.h[u]!, 2 * b.h[v]!];
      faces.push({ box: k, face, m });
      area += m[0] * m[1];
    }
  }
  // the density the piece can have within its texels, counting the
  // pads and the narrow faces' least
  let density = DENSITY;
  const texels = (d: number) =>
    faces.reduce(
      (n, f) =>
        n +
        (Math.max(MIN_TEXELS, Math.ceil(f.m[0] * d)) + 2 * PAD) *
          (Math.max(MIN_TEXELS, Math.ceil(f.m[1] * d)) + 2 * PAD),
      0,
    );
  while (density > 8 && texels(density) > PIECE_TEXELS) density *= 0.85;
  const sized = faces.map((f) => ({
    ...f,
    w: Math.max(MIN_TEXELS, Math.ceil(f.m[0] * density)),
    h: Math.max(MIN_TEXELS, Math.ceil(f.m[1] * density)),
  }));
  // rows, tallest first, as wide as a square of the total would be
  const total = sized.reduce(
    (n, f) => n + (f.w + 2 * PAD) * (f.h + 2 * PAD),
    0,
  );
  const widest = sized.reduce((n, f) => Math.max(n, f.w + 2 * PAD), 0);
  const W = Math.max(widest, Math.ceil(Math.sqrt(total) * 1.15));
  const order = sized
    .map((f, i) => i)
    .sort((a, b) => sized[b]!.h - sized[a]!.h || sized[b]!.w - sized[a]!.w);
  const charts: BakeChart[] = new Array(sized.length);
  let x = 0;
  let y = 0;
  let row = 0;
  for (const i of order) {
    const f = sized[i]!;
    const cw = f.w + 2 * PAD;
    const ch = f.h + 2 * PAD;
    if (x + cw > W) {
      x = 0;
      y += row;
      row = 0;
    }
    charts[i] = {
      box: f.box,
      face: f.face,
      x: x + PAD,
      y: y + PAD,
      w: f.w,
      h: f.h,
    };
    x += cw;
    row = Math.max(row, ch);
  }
  return {
    charts,
    size: [W, Math.max(1, y + row)] as [number, number],
    density,
    area,
  };
};

/* ---------- the rays ---------- */

/** the ray's first hit on a box, or Infinity; 0 when it starts inside */
const hitBox = (
  b: BakeBox,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
) => {
  let px = ox - b.c[0];
  let py = oy - b.c[1];
  let pz = oz - b.c[2];
  if (b.m) {
    const m = b.m;
    const lx = m[0]! * px + m[3]! * py + m[6]! * pz;
    const ly = m[1]! * px + m[4]! * py + m[7]! * pz;
    const lz = m[2]! * px + m[5]! * py + m[8]! * pz;
    const ex = m[0]! * dx + m[3]! * dy + m[6]! * dz;
    const ey = m[1]! * dx + m[4]! * dy + m[7]! * dz;
    const ez = m[2]! * dx + m[5]! * dy + m[8]! * dz;
    px = lx;
    py = ly;
    pz = lz;
    dx = ex;
    dy = ey;
    dz = ez;
  }
  let lo = -Infinity;
  let hi = Infinity;
  const h = b.h;
  // x
  if (Math.abs(dx) < 1e-12) {
    if (Math.abs(px) > h[0]) return Infinity;
  } else {
    const a = (-h[0] - px) / dx;
    const c = (h[0] - px) / dx;
    lo = Math.max(lo, Math.min(a, c));
    hi = Math.min(hi, Math.max(a, c));
  }
  if (Math.abs(dy) < 1e-12) {
    if (Math.abs(py) > h[1]) return Infinity;
  } else {
    const a = (-h[1] - py) / dy;
    const c = (h[1] - py) / dy;
    lo = Math.max(lo, Math.min(a, c));
    hi = Math.min(hi, Math.max(a, c));
  }
  if (Math.abs(dz) < 1e-12) {
    if (Math.abs(pz) > h[2]) return Infinity;
  } else {
    const a = (-h[2] - pz) / dz;
    const c = (h[2] - pz) / dz;
    lo = Math.max(lo, Math.min(a, c));
    hi = Math.min(hi, Math.max(a, c));
  }
  if (hi < lo || hi <= 0) return Infinity;
  return lo < 0 ? 0 : lo;
};

/** the golden angle, for the rays' spiral */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** a texel's own turn of the rays, so neighbours sample differently and
    the blur evens them out */
const spin = (i: number) => {
  let x = (i * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return ((x >>> 0) / 4294967296) * Math.PI * 2;
};

type Scene = {
  boxes: BakeBox[];
  floor: number;
  wall: number | null;
};

/** the boxes a ray from a face can hit: those with some part in front
    of the face's plane (a box wholly behind it cannot be seen) */
const before = (s: Scene, p: V3, n: V3, own: number) => {
  const out: number[] = [];
  s.boxes.forEach((b, i) => {
    if (i === own) return;
    // the box's furthest reach along the normal
    const along =
      (b.c[0] - p[0]) * n[0] + (b.c[1] - p[1]) * n[1] + (b.c[2] - p[2]) * n[2];
    let r = 0;
    for (const k of axes) {
      const axis: V3 = [0, 0, 0];
      axis[k] = 1;
      const w = dirToPiece(b, axis);
      r += b.h[k]! * Math.abs(w[0] * n[0] + w[1] * n[1] + w[2] * n[2]);
    }
    if (along + r > 1e-5) out.push(i);
  });
  return out;
};

/**
 * Occlusion and sky from one point: `rays` cosine-weighted directions
 * about the normal on a golden spiral, turned by `turn`.
 */
const lightAt = (
  s: Scene,
  near: number[],
  p: V3,
  n: V3,
  rays: number,
  turn: number,
  reach: number,
) => {
  // the normal's frame
  const [nx, ny, nz] = n;
  const tx0 = Math.abs(nx) < 0.9 ? 1 : 0;
  const ty0 = tx0 ? 0 : 1;
  // t = normalize(cross(n, a)), b = cross(n, t)
  let tx = ny * 0 - nz * ty0;
  let ty = nz * tx0 - nx * 0;
  let tz = nx * ty0 - ny * tx0;
  const tl = Math.hypot(tx, ty, tz) || 1;
  tx /= tl;
  ty /= tl;
  tz /= tl;
  const bx = ny * tz - nz * ty;
  const by = nz * tx - nx * tz;
  const bz = nx * ty - ny * tx;
  let open = 0;
  let skyAll = 0;
  let skyOpen = 0;
  for (let k = 0; k < rays; k++) {
    const r = Math.sqrt((k + 0.5) / rays);
    const phi = k * GOLDEN + turn;
    const a = r * Math.cos(phi);
    const c = r * Math.sin(phi);
    const up = Math.sqrt(Math.max(0, 1 - r * r));
    const dx = tx * a + bx * c + nx * up;
    const dy = ty * a + by * c + ny * up;
    const dz = tz * a + bz * c + nz * up;
    let t = Infinity;
    for (const i of near) {
      const hit = hitBox(s.boxes[i]!, p[0], p[1], p[2], dx, dy, dz);
      if (hit < t) t = hit;
    }
    if (dy < -1e-6) t = Math.min(t, (s.floor - p[1]) / dy);
    if (s.wall !== null && dz < -1e-6) t = Math.min(t, (s.wall - p[2]) / dz);
    // a near hit takes nearly all of its share, a far one little: a
    // smooth step over the reach, so a gap goes dark and a bay's wide
    // middle stays light
    const x = Math.min(1, t / reach);
    open += x * x * (3 - 2 * x);
    if (dy > 0) {
      skyAll += dy;
      if (t === Infinity) skyOpen += dy;
    }
  }
  return {
    ao: open / rays,
    sky: skyAll > 1e-6 ? skyOpen / skyAll : 1,
  };
};

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** a chart's values blurred over 3 × 3 texels, within the chart */
const blur = (v: Float32Array, w: number, h: number) => {
  const a = new Float32Array(v.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        s += v[y * w + xx]!;
        n++;
      }
      a[y * w + x] = s / n;
    }
  const b = new Float32Array(v.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        s += a[yy * w + x]!;
        n++;
      }
      b[y * w + x] = s / n;
    }
  return b;
};

/** the bake */
export const bake = (job: BakeJob): BakeResult => {
  const s: Scene = { boxes: job.boxes, floor: job.floor, wall: job.wall };
  const [W, H] = job.size;
  const atlas = new Uint8Array(W * H * 4);
  for (const c of job.charts) {
    const b = job.boxes[c.box]!;
    const mid = facePoint(b, c.face, 0.5, 0.5);
    const near = before(s, mid.p, mid.n, c.box);
    const ao = new Float32Array(c.w * c.h);
    const sky = new Float32Array(c.w * c.h);
    const seen = new Uint8Array(c.w * c.h);
    for (let j = 0; j < c.h; j++)
      for (let i = 0; i < c.w; i++) {
        const { p, n } = facePoint(b, c.face, (i + 0.5) / c.w, (j + 0.5) / c.h);
        const o: V3 = [
          p[0] + n[0] * LIFT,
          p[1] + n[1] * LIFT,
          p[2] + n[2] * LIFT,
        ];
        const k = j * c.w + i;
        // a texel under another board is never seen: it takes its
        // neighbours' light below, so the filter brings no black in
        if (near.some((q) => inside(job.boxes[q]!, o, 0))) continue;
        const l = lightAt(
          s,
          near,
          o,
          n,
          RAYS,
          spin(c.x + i + (c.y + j) * 4099),
          REACH,
        );
        ao[k] = l.ao;
        sky[k] = l.sky;
        seen[k] = 1;
      }
    fill(ao, sky, seen, c.w, c.h);
    const a = blur(ao, c.w, c.h);
    const g = blur(sky, c.w, c.h);
    // the chart and its pad (the edge texels repeated outward)
    for (let j = -PAD; j < c.h + PAD; j++)
      for (let i = -PAD; i < c.w + PAD; i++) {
        const k =
          Math.min(c.h - 1, Math.max(0, j)) * c.w +
          Math.min(c.w - 1, Math.max(0, i));
        const o = ((c.y + j) * W + c.x + i) * 4;
        atlas[o] = byte(a[k]!);
        atlas[o + 1] = byte(g[k]!);
        atlas[o + 2] = 255;
        atlas[o + 3] = 255;
      }
  }
  // the points
  const count = job.owners.length;
  const points = new Uint8Array(count * 2);
  for (let i = 0; i < count; i++) {
    const n: V3 = [
      job.points[i * 6 + 3]!,
      job.points[i * 6 + 4]!,
      job.points[i * 6 + 5]!,
    ];
    const p: V3 = [
      job.points[i * 6]! + n[0] * POINT_LIFT,
      job.points[i * 6 + 1]! + n[1] * POINT_LIFT,
      job.points[i * 6 + 2]! + n[2] * POINT_LIFT,
    ];
    const near = before(s, p, n, job.owners[i]!).filter(
      (q) => !inside(job.boxes[q]!, p, 0.001),
    );
    const l = lightAt(s, near, p, n, POINT_RAYS, spin(i), REACH);
    points[i * 2] = byte(l.ao);
    points[i * 2 + 1] = byte(l.sky);
  }
  // the floor round it
  const f = job.foot;
  const foot = new Uint8Array(f.nx * f.nz);
  const up: V3 = [0, 1, 0];
  const above = s.boxes.map((_, i) => i);
  const ground: Scene = { ...s, floor: -Infinity };
  const raw = new Float32Array(f.nx * f.nz);
  for (let j = 0; j < f.nz; j++)
    for (let i = 0; i < f.nx; i++) {
      const p: V3 = [
        f.x0 + ((i + 0.5) / f.nx) * (f.x1 - f.x0),
        job.floor + LIFT,
        f.z0 + ((j + 0.5) / f.nz) * (f.z1 - f.z0),
      ];
      const covered = above.some((q) => inside(job.boxes[q]!, p, 0));
      raw[j * f.nx + i] = covered
        ? 0
        : lightAt(
            ground,
            above,
            p,
            up,
            RAYS,
            spin(i * 31 + j * 977),
            FOOT_REACH,
          ).ao;
    }
  const soft = blur(raw, f.nx, f.nz);
  for (let k = 0; k < soft.length; k++) foot[k] = byte(soft[k]!);
  return { atlas, points, foot };
};

/** the texels no ray could leave from take their nearest seen
    neighbours' values, a ring at a time */
const fill = (
  ao: Float32Array,
  sky: Float32Array,
  seen: Uint8Array,
  w: number,
  h: number,
) => {
  if (seen.every((x) => x === 1)) return;
  if (seen.every((x) => x === 0)) {
    ao.fill(1);
    sky.fill(1);
    return;
  }
  let left = seen.length - seen.reduce((n, x) => n + x, 0);
  while (left > 0) {
    const next = seen.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const k = y * w + x;
        if (seen[k]) continue;
        let a = 0;
        let g = 0;
        let n = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (!seen[q]) continue;
          a += ao[q]!;
          g += sky[q]!;
          n++;
        }
        if (n) {
          ao[k] = a / n;
          sky[k] = g / n;
          next[k] = 1;
          left--;
        }
      }
    seen.set(next);
  }
};

/** a job's key: everything the bake reads, so a piece built the same
    way finds its bake again (FNV-1a over the numbers, rounded to a
    tenth of a millimetre) */
export const BAKE_VERSION = 3;
export const bakeKey = (job: BakeJob) => {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    const n = Math.round(v * 10000) | 0;
    for (let s = 0; s < 32; s += 8) {
      h ^= (n >>> s) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  mix(BAKE_VERSION);
  mix(job.boxes.length);
  for (const b of job.boxes) {
    b.c.forEach(mix);
    b.h.forEach(mix);
    (b.m ?? []).forEach(mix);
    mix(b.m ? 1 : 0);
  }
  mix(job.floor);
  mix(job.wall ?? 999);
  mix(job.charts.length);
  for (const c of job.charts) [c.box, c.face, c.x, c.y, c.w, c.h].forEach(mix);
  job.size.forEach(mix);
  mix(job.owners.length);
  for (let i = 0; i < job.points.length; i++) mix(job.points[i]!);
  [
    job.foot.x0,
    job.foot.z0,
    job.foot.x1,
    job.foot.z1,
    job.foot.nx,
    job.foot.nz,
  ].forEach(mix);
  return h.toString(36);
};
