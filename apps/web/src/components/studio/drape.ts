import { BufferGeometry, Float32BufferAttribute } from "three";
import { withBakeDefaults } from "./bake-defaults";
import { seeded, within } from "./seeded";
import { WOOD_M } from "./textures";

/**
 * Cloth laid over a support (round 8, Part 5): a throw over a sofa's
 * arm, a throw across a bed's foot, a duvet over the mattress. The
 * cloth follows the support's top and its rounded edges, then falls
 * down each side, standing off a little as it falls and folding more
 * the further it falls, its hem a little uneven; a duvet puffs up in
 * the middle. Drawn as a shell with two faces and a thickness that
 * thins to a rounded edge all round, so it reads as cloth with a body
 * and not a board bent over. The support's top is the frame's y = 0,
 * its middle x = z = 0; the cloth's width runs along z. Plain geometry
 * from a seed, kept by its shape, so it is tested here.
 */
export type Drape = {
  /** the support's top across x, m */
  over: number;
  /** the cloth's width along z, m */
  wide: number;
  /** how far it falls down the −x and the +x side, m (0: it ends at
      the edge) */
  hang: readonly [number, number];
  /** the support's edges' round, m */
  round: number;
  /** the cloth's thickness, m */
  thick: number;
  /** how far its top puffs up at the middle, m (a duvet), and how far
      in from its ends the puff falls away (0: it keeps it to its ends,
      as a throw lying over a duvet does) */
  puff: number;
  ends: number;
  /** its folds across its width, and how deep they are at the hem, m */
  folds: number;
  depth: number;
  seed: number;
};

/** a step along the cloth and across it, m, and the steps in a round */
const STEP = 0.025;
const ROUND_STEPS = 6;
/** how far a falling side stands off the support at its hem, a share
    of its fall */
const FLARE = 0.06;
/** the top's folds, a share of the hem's */
const TOP_FOLD = 0.12;
/** how far in from an edge the cloth thins to its hem, in thicknesses,
    and how thin it gets there */
const HEM = 1.5;
const HEM_THIN = 0.3;

/** a point of the support's outline, its outward normal, and how far
    down a side it is (0 on the top, 1 at the hem) */
type Station = { x: number; y: number; nx: number; ny: number; fall: number };

/** the support's outline from the −x hem over the top to the +x hem,
    each station a step or a round's step from the last */
const outline = (d: Drape): Station[] => {
  const half = d.over / 2;
  const out: Station[] = [];
  const side = (s: -1 | 1, hang: number, down: boolean) => {
    // a side falling: from the hem up to the round, or back down
    const r = Math.min(d.round, hang);
    const n = Math.max(1, Math.ceil((hang - r) / STEP));
    for (let k = 0; k <= n; k++) {
      const t = down ? k / n : 1 - k / n;
      const fall = (hang - r) * t + r;
      out.push({
        x: s * (half + FLARE * hang * t * t),
        y: -fall,
        nx: s,
        ny: 0,
        fall: fall / hang,
      });
    }
  };
  const corner = (s: -1 | 1, up: boolean) => {
    // the round about the support's edge, from the side to the top
    const r = d.round;
    for (let k = 1; k < ROUND_STEPS; k++) {
      const a = ((up ? k : ROUND_STEPS - k) / ROUND_STEPS) * (Math.PI / 2);
      const nx = s * Math.cos(a);
      const ny = Math.sin(a);
      out.push({
        x: s * (half - r) + nx * r,
        y: -r + ny * r,
        nx,
        ny,
        fall: 0,
      });
    }
  };
  const [left, right] = d.hang;
  if (left > 0) {
    side(-1, left, false);
    corner(-1, true);
  }
  const from = left > 0 ? -half + d.round : -half;
  const to = right > 0 ? half - d.round : half;
  const n = Math.max(1, Math.ceil((to - from) / STEP));
  for (let k = 0; k <= n; k++)
    out.push({ x: from + ((to - from) * k) / n, y: 0, nx: 0, ny: 1, fall: 0 });
  if (right > 0) {
    corner(1, false);
    side(1, right, true);
  }
  return out;
};

const drapes = new Map<string, BufferGeometry>();
const KEPT = 16;

export const drapeGeometry = (d: Drape) => {
  const key = JSON.stringify(d);
  const had = drapes.get(key);
  if (had) return had;
  const next = seeded(d.seed * 7919 + 3);
  const line = outline(d);
  // the arc length to each station, for the weave's u
  const arc = [0];
  for (let i = 1; i < line.length; i++)
    arc.push(
      arc[i - 1]! +
        Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y),
    );
  const length = arc[arc.length - 1]!;
  const nz = Math.max(2, Math.ceil(d.wide / STEP));
  const zs = Array.from(
    { length: nz + 1 },
    (_, k) => -d.wide / 2 + (d.wide * k) / nz,
  );
  // the folds: two waves across the width, each its own phase, and an
  // uneven hem
  const phase = [
    within(next(), [0, Math.PI * 2]),
    within(next(), [0, Math.PI * 2]),
  ];
  const second = within(next(), [1.5, 1.9]);
  const hemWave = within(next(), [0.3, 0.6]);
  const fold = (z: number) => {
    const t = (z / d.wide + 0.5) * d.folds * Math.PI * 2;
    const w =
      Math.sin(t + phase[0]!) * 0.65 + Math.sin(t * second + phase[1]!) * 0.35;
    return 0.5 + 0.5 * w;
  };
  // the puff falling away towards its ends, smoothly
  const settle = (z: number) => {
    if (d.ends <= 0) return 1;
    const t = Math.min(1, (d.wide / 2 - Math.abs(z)) / d.ends);
    return t * t * (3 - 2 * t);
  };
  // each point's place on the cloth's middle sheet, its outward normal
  // there, and its thickness
  const mid: number[] = [];
  const norm: number[] = [];
  const thick: number[] = [];
  const uv: number[] = [];
  const edge = HEM * d.thick;
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!;
    const s = arc[i]!;
    for (const z of zs) {
      const f = fold(z);
      const xt = d.over > 0 ? p.x / (d.over / 2) : 0;
      const puff =
        p.fall === 0 ? d.puff * Math.max(0, 1 - xt * xt) * settle(z) : 0;
      const out =
        d.thick / 2 +
        d.depth * f * (TOP_FOLD + (1 - TOP_FOLD) * p.fall ** 1.3) +
        puff;
      // the hem rises and falls with the folds
      const lift = p.fall > 0 ? hemWave * d.depth * (f - 0.5) * p.fall ** 3 : 0;
      mid.push(p.x + p.nx * out, p.y + p.ny * out + lift, z);
      norm.push(p.nx, p.ny, 0);
      // thinning to a rounded edge near each of its four edges
      const near = Math.min(s, length - s, z + d.wide / 2, d.wide / 2 - z);
      const k = Math.min(1, Math.max(0, near / edge));
      thick.push(
        d.thick * (HEM_THIN + (1 - HEM_THIN) * Math.sqrt(k * (2 - k))),
      );
      uv.push(s / WOOD_M, (z + d.wide / 2) / WOOD_M);
    }
  }
  const cols = zs.length;
  const rows = line.length;
  const pos: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  // the two faces: the outer and the inner, each wound outward
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i < rows * cols; i++) {
      const t = (side * thick[i]!) / 2;
      pos.push(
        mid[i * 3]! + norm[i * 3]! * t,
        mid[i * 3 + 1]! + norm[i * 3 + 1]! * t,
        mid[i * 3 + 2]!,
      );
      uvs.push(uv[i * 2]!, uv[i * 2 + 1]!);
    }
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cols - 1; c++) {
        const q = base + r * cols + c;
        if (side > 0)
          index.push(q, q + 1, q + cols, q + 1, q + cols + 1, q + cols);
        else index.push(q, q + cols, q + 1, q + 1, q + cols, q + cols + 1);
      }
  }
  // the edge all round, joining the faces' rims
  const outer = (r: number, c: number) => r * cols + c;
  const inner = (r: number, c: number) => rows * cols + r * cols + c;
  const rim: [number, number][] = [
    ...Array.from({ length: cols - 1 }, (_, c) => [0, c] as [number, number]),
    ...Array.from(
      { length: rows - 1 },
      (_, r) => [r, cols - 1] as [number, number],
    ),
    ...Array.from(
      { length: cols - 1 },
      (_, c) => [rows - 1, cols - 1 - c] as [number, number],
    ),
    ...Array.from(
      { length: rows - 1 },
      (_, r) => [rows - 1 - r, 0] as [number, number],
    ),
  ];
  const edgeBase = pos.length / 3;
  for (const [r, c] of rim) {
    for (const at of [outer(r, c), inner(r, c)]) {
      pos.push(pos[at * 3]!, pos[at * 3 + 1]!, pos[at * 3 + 2]!);
      uvs.push(uvs[at * 2]!, uvs[at * 2 + 1]!);
    }
  }
  for (let k = 0; k < rim.length; k++) {
    const a = edgeBase + k * 2;
    const b = edgeBase + ((k + 1) % rim.length) * 2;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = pos.length / 3;
  g.setAttribute(
    "color",
    new Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3),
  );
  g.setAttribute("ply", new Float32BufferAttribute(new Float32Array(n * 3), 3));
  withBakeDefaults(g);
  if (drapes.size >= KEPT) {
    const oldest = drapes.keys().next().value!;
    drapes.get(oldest)!.dispose();
    drapes.delete(oldest);
  }
  drapes.set(key, g);
  return g;
};
