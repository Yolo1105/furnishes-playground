import { hash01 } from "./seeded";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Shape,
  Vector3,
  type Vector3Tuple,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  mergeGeometries,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { grainShiftOf, toneOf } from "./albedo";
import { ROD_SQUARE, withBakeDefaults } from "./bake-defaults";
import { type BakeBox, faceAxes, inside, toPiece } from "./lightmap-bake";
import type { Finish } from "./finish";
import { WOOD_M } from "./textures";

/**
 * The geometry a piece's parts are drawn with (finish.tsx draws them):
 * a board with its edges eased and its band in its vertex colours, its
 * joint lines, a rod and a soft block, each kept by size, and a built
 * piece's parts merged into a few batches, one a finish.
 */

/** the rounded edge of a board, m: a real round in the geometry, so
    each edge catches a thin highlight as a sanded board's does, and two
    boards meeting leave a hairline seam between their rounds (1.3 mm
    once; at 1.8 mm, in three steps, it is a round a pixel wide from a
    metre or two, the most a 1.5–2 mm arris on panel furniture is) */
const EDGE = 0.0018;
const EDGE_STEPS = 3;
/** a board counts as plywood (its edges show the plies, ply.ts) from
    this thick to this thick, m: a plinth or a worktop is not */
export const PLY_MIN = 0.012;
export const PLY_MAX = 0.03;
/** how much darker a panel's edge band stands than its face: the
    four narrow faces of a board are a shade under its face, as end
    grain is (darker than this, every board read as drawn round, an
    illustration's outline) */
const BAND = 0.93;
/** the face a point of a box stands on, by its normal's longest axis
    (its axis times two, plus one for the + side, as lightmap-bake.ts
    numbers them) */
export const faceOfNormal = (nx: number, ny: number, nz: number) => {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  return axis * 2 + ([nx, ny, nz][axis]! > 0 ? 1 : 0);
};
/** how near a point of a board stands to each of its face's four edges
    (−u, +u, −v, +v of the face's axes), as the `edge` attribute keeps
    it for the edge's line (lightmap-nodes.ts): 1 less the distance in
    m, which a face's interpolation keeps exact across it */
const edgeNear = (
  out: Float32Array,
  i: number,
  p: [number, number, number],
  half: [number, number, number],
  face: number,
) => {
  const [u, v] = faceAxes(face);
  const [pu, pv, hu, hv] = [p[u]!, p[v]!, half[u]!, half[v]!];
  out[i * 4] = 1 - (pu + hu);
  out[i * 4 + 1] = 1 - (hu - pu);
  out[i * 4 + 2] = 1 - (pv + hv);
  out[i * 4 + 3] = 1 - (hv - pv);
};
/** an edge another board covers draws no line: its nearness set far */
const COVERED = -10;
/** how far round an edge is looked at for a board covering it, m */
const ROUND_LOOK = 0.003;

/** a slab's geometry: a box with its edges eased, its texture laid in
    metres with the grain along the panel's longer side (a top's along
    its length, a side's up its height, a door's up its height), so no
    two parts of a piece carry the grain the same way and each face
    takes the tile at one size; the four narrow faces carry the band's
    tone as a vertex colour, and on a board of plywood's thickness where
    a point stands across the plies (the `ply` attribute: across the
    thickness 0–1, along the edge in m, 1 on an edge face; ply.ts draws
    the plies from it). Kept by size, since a piece's panels repeat */
const slabs = new Map<string, BufferGeometry>();
const SLABS_KEPT = 512;
export const slabGeometry = (dims: Vector3Tuple) => {
  const key = dims.join(",");
  const had = slabs.get(key);
  if (had) return had;
  const [w, h, d] = dims;
  const edge = Math.min(EDGE, Math.min(w, h, d) / 3);
  const g = new RoundedBoxGeometry(w, h, d, EDGE_STEPS, edge);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const tone = new Float32Array(pos.count * 3);
  const ply = new Float32Array(pos.count * 3);
  const near = new Float32Array(pos.count * 4);
  // the board's thickness runs along its shortest side: the two faces
  // across it are the board's faces, the other four its edge band
  const thin = Math.min(w, h, d);
  const thinAxis = thin === w ? 0 : thin === h ? 1 : 2;
  const plywood = thin >= PLY_MIN && thin <= PLY_MAX;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // the face's two coordinates, the longer side first: the grain
    let a: number;
    let b: number;
    let across: number;
    let facing: number;
    if (nx >= ny && nx >= nz) {
      [a, b] = h >= d ? [y, z] : [z, y];
      across = w;
      facing = 0;
    } else if (ny >= nz) {
      [a, b] = w >= d ? [x, z] : [z, x];
      across = h;
      facing = 1;
    } else {
      [a, b] = w >= h ? [x, y] : [y, x];
      across = d;
      facing = 2;
    }
    uv.setXY(i, a / WOOD_M, b / WOOD_M);
    // how near the point stands to its face's four edges (edgeNear)
    edgeNear(
      near,
      i,
      [x, y, z],
      [w / 2, h / 2, d / 2],
      faceOfNormal(nor.getX(i), nor.getY(i), nor.getZ(i)),
    );
    const t = across === thin ? 1 : BAND;
    tone[i * 3] = t;
    tone[i * 3 + 1] = t;
    tone[i * 3 + 2] = t;
    // across the plies, and along the edge: on an edge face of plywood
    const at = [x, y, z][thinAxis]!;
    ply[i * 3] = (at + thin / 2) / thin;
    ply[i * 3 + 1] = a;
    ply[i * 3 + 2] = plywood && facing !== thinAxis ? 1 : 0;
  }
  uv.needsUpdate = true;
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
  g.setAttribute("ply", new Float32BufferAttribute(ply, 3));
  g.setAttribute("edge", new Float32BufferAttribute(near, 4));
  withBakeDefaults(g);
  if (slabs.size >= SLABS_KEPT) {
    const oldest = slabs.keys().next().value!;
    slabs.get(oldest)!.dispose();
    slabs.delete(oldest);
  }
  slabs.set(key, g);
  return g;
};

/** the joint lines of a slab: its twelve edges as the hairline two
    eased edges leave where boards meet, a hair outside the slab so
    they lie on its surface, drawn and never picked */
const joints = new Map<string, BufferGeometry>();
const JOINT_OUT = 0.0004;
/** how far below the board's colour its joint lines stand, and how
    much they cover */
export const JOINT_SHADE = -0.3;
export const JOINT_OPACITY = 0.15;
export const jointGeometry = (dims: Vector3Tuple) => {
  const key = dims.join(",");
  const had = joints.get(key);
  if (had) return had;
  const [w, h, d] = dims;
  const g = new EdgesGeometry(
    new BoxGeometry(w + JOINT_OUT, h + JOINT_OUT, d + JOINT_OUT),
  );
  if (joints.size >= SLABS_KEPT) {
    const oldest = joints.keys().next().value!;
    joints.get(oldest)!.dispose();
    joints.delete(oldest);
  }
  joints.set(key, g);
  return g;
};
/** a round part's segments around */
const ROUND = 20;

/** one part of a built piece: a board (dims, with its colour if it
    differs from the finish's) or a rod ([radius, height, top radius]) */
export type Part = {
  at: Vector3Tuple;
  f: Finish;
  rotation?: Vector3Tuple | undefined;
} & (
  | { dims: Vector3Tuple; colour?: string | undefined }
  | { rod: [number, number, number?] }
);

/** what a part is drawn with: parts with the same make a batch */
const batchOf = (p: Part) => {
  const f = p.f;
  const colour = "dims" in p ? (p.colour ?? f.colour) : f.colour;
  return [
    colour,
    f.rough,
    f.grain ?? "",
    f.sheen ?? "",
    f.coat ?? "",
    f.metal ?? "",
    f.ply ? "ply" : "",
  ].join("|");
};

/** the parts' own geometries placed where they stand, merged into one */
const placed = (
  parts: Part[],
  shape: (p: Part) => BufferGeometry,
  /** a part's own copy changed before it is placed (its edges) */
  adjust?: (g: BufferGeometry, p: Part) => void,
) => {
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const one = new Vector3(1, 1, 1);
  const at = new Vector3();
  const shapes = parts.map(shape);
  // a rounded slab has no index and a rod has one: a batch of both is
  // merged without
  const mixed = new Set(shapes.map((g) => g.index !== null)).size > 1;
  const each = parts.map((p, i) => {
    const own = shapes[i]!;
    const g = mixed && own.index ? own.toNonIndexed() : own.clone();
    adjust?.(g, p);
    m.compose(
      at.set(...p.at),
      q.setFromEuler(e.set(...(p.rotation ?? [0, 0, 0]))),
      one,
    );
    // each board a hair its own tone (albedo.ts), in its vertex
    // colours, so the batch stays one draw
    const tone = g.getAttribute("color");
    if (tone) {
      const k = toneOf(p.at);
      for (let v = 0; v < tone.count; v++)
        tone.setXYZ(v, tone.getX(v) * k, tone.getY(v) * k, tone.getZ(v) * k);
    }
    // and cut from its own place in the sheet, half of them turned end
    // for end: two boards of a size never show the same patch of the
    // figure side by side
    const uv = g.getAttribute("uv");
    if (uv) {
      const [du, dv] = grainShiftOf(p.at);
      const turn = (du * 7919) % 1 < 0.5 ? 1 : -1;
      for (let v = 0; v < uv.count; v++)
        uv.setXY(v, turn * uv.getX(v) + du, turn * uv.getY(v) + dv);
    }
    return g.applyMatrix4(m);
  });
  const merged = mergeGeometries(each);
  // where each part's vertices lie in the merged geometry (the bake
  // gives each its own light, Bake.tsx)
  const ranges: [number, number][] = [];
  let from = 0;
  for (const g of each) {
    const n = g.getAttribute("position").count;
    ranges.push([from, n]);
    from += n;
  }
  for (const g of each) g.dispose();
  return { merged, ranges };
};

/** a part's box as the bake takes it, in the piece's frame */
export const boxOfPart = (p: Part): BakeBox => {
  const half: [number, number, number] =
    "dims" in p
      ? [p.dims[0] / 2, p.dims[1] / 2, p.dims[2] / 2]
      : (() => {
          // a rod as the bake takes it (Bake.tsx): a square inside it
          const s = Math.max(p.rod[0], p.rod[2] ?? p.rod[0]) * ROD_SQUARE;
          return [s, p.rod[1] / 2, s] as [number, number, number];
        })();
  if (!p.rotation || p.rotation.every((r) => r === 0))
    return { c: [...p.at], h: half };
  const e = new Matrix4().makeRotationFromEuler(
    new Euler(...p.rotation),
  ).elements;
  return {
    c: [...p.at],
    h: half,
    m: [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!],
  };
};

/** which of a board's edges another board covers: for each face, its
    four edges (−u, +u, −v, +v), looked at just round the edge at three
    points along it (an edge two of them find covered is covered), and
    below the floor counts as covered (a plinth's foot draws no line) */
export const coveredEdges = (k: number, boxes: BakeBox[]) => {
  const b = boxes[k]!;
  const out: boolean[] = [];
  for (let face = 0; face < 6; face++) {
    const a = face >> 1;
    const sign = face & 1 ? 1 : -1;
    const [u, v] = faceAxes(face);
    for (let edge = 0; edge < 4; edge++) {
      const along = edge < 2 ? u : v;
      const across = edge < 2 ? v : u;
      const end = edge % 2 ? 1 : -1;
      let hits = 0;
      for (const f of [0.25, 0.5, 0.75]) {
        const l: [number, number, number] = [0, 0, 0];
        // past the edge, out round the corner from the face
        l[a] = sign * (b.h[a]! + ROUND_LOOK);
        l[along] = end * (b.h[along]! + ROUND_LOOK);
        l[across] = (2 * f - 1) * b.h[across]!;
        const q = toPiece(b, l);
        if (
          q[1] < -ROUND_LOOK / 2 ||
          boxes.some((o, i) => i !== k && inside(o, [q[0], q[1], q[2]], 0))
        )
          hits++;
      }
      out.push(hits >= 2);
    }
  }
  return out;
};

/** a board's copy with its covered edges set far, so they draw no line */
const coverEdges = (g: BufferGeometry, covered: boolean[]) => {
  const near = g.getAttribute("edge");
  const nor = g.getAttribute("normal");
  if (!near || !nor) return;
  for (let i = 0; i < near.count; i++) {
    const face = faceOfNormal(nor.getX(i), nor.getY(i), nor.getZ(i));
    for (let e = 0; e < 4; e++)
      if (covered[face * 4 + e]) near.setComponent(i, e, COVERED);
  }
};

export type Batch = {
  key: string;
  f: Finish;
  colour: string | undefined;
  faces: BufferGeometry;
  joints: BufferGeometry | null;
  /** the batch's parts, and where each one's vertices lie in `faces` */
  parts: Part[];
  ranges: [number, number][];
};

/** the parts in batches: those with the same finish and colour merged
    into one geometry, their boards' joint lines into another; each
    board's edges that another of the piece's boards covers drawn with
    no line */
export const batchesOf = (all: Part[]): Batch[] => {
  const boxes = all.map(boxOfPart);
  const covered = new Map<Part, boolean[]>();
  all.forEach((p, k) => {
    if ("dims" in p) covered.set(p, coveredEdges(k, boxes));
  });
  const by = new Map<string, Part[]>();
  for (const p of all) {
    const k = batchOf(p);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by].map(([k, ps]): Batch => {
    const first = ps[0]!;
    const boards = ps.filter((p) => "dims" in p);
    const { merged, ranges } = placed(
      ps,
      (p) => ("dims" in p ? slabGeometry(p.dims) : rodGeometry(p.rod)),
      (g, p) => {
        const c = covered.get(p);
        if (c) coverEdges(g, c);
      },
    );
    return {
      key: k,
      f: first.f,
      colour: "dims" in first ? first.colour : undefined,
      faces: merged,
      joints: boards.length
        ? placed(boards, (p) => jointGeometry("dims" in p ? p.dims : [0, 0, 0]))
            .merged
        : null,
      parts: ps,
      ranges,
    };
  });
};

/** a rod's cylinder, its vertex colours white, kept by size */
const rods = new Map<string, BufferGeometry>();
export const rodGeometry = ([r, h, top]: [
  number,
  number,
  (number | undefined)?,
]) => {
  const key = `${r},${h},${top ?? r}`;
  const had = rods.get(key);
  if (had) return had;
  const g = white(new CylinderGeometry(top ?? r, r, h, ROUND));
  // the grain along the rod, at the wood's own scale: the cylinder's
  // own 0–1 wrapped a whole tile round a leg a few centimetres across
  const uv = g.getAttribute("uv");
  const round = 2 * Math.PI * Math.max(r, top ?? r);
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (uv.getY(i) * h) / WOOD_M, (uv.getX(i) * round) / WOOD_M);
  uv.needsUpdate = true;
  if (rods.size >= SLABS_KEPT) {
    const oldest = rods.keys().next().value!;
    rods.get(oldest)!.dispose();
    rods.delete(oldest);
  }
  rods.set(key, g);
  return g;
};

/** a geometry's vertex colours all white and no plies: the tone a part
    with no band carries, so it shares its finish's shader with the
    banded slabs (and a batch of both merges) */
const white = (g: BufferGeometry) => {
  const n = g.getAttribute("position").count;
  const tone = new Float32Array(n * 3);
  tone.fill(1);
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
  g.setAttribute("ply", new Float32BufferAttribute(new Float32Array(n * 3), 3));
  return withBakeDefaults(g);
};

/** a soft block's geometry: a box with its edges rounded and its
    normals creased, as drei's RoundedBox makes it (a rounded rectangle
    extruded with a bevel), kept by size */
const softs = new Map<string, BufferGeometry>();
const SOFT_STEPS = 3;
const BEVEL_SEGMENTS = 8;
const CREASE = 0.4;
const ROUNDED_EPS = 0.00001;
export const softGeometry = ([w, h, d]: Vector3Tuple, radius: number) => {
  const key = `${w},${h},${d},${radius}`;
  const had = softs.get(key);
  if (had) return had;
  const r = radius - ROUNDED_EPS;
  const e = ROUNDED_EPS;
  const shape = new Shape();
  shape.absarc(e, e, e, -Math.PI / 2, -Math.PI, true);
  shape.absarc(e, h - r * 2, e, Math.PI, Math.PI / 2, true);
  shape.absarc(w - r * 2, h - r * 2, e, Math.PI / 2, 0, true);
  shape.absarc(w - r * 2, e, e, 0, -Math.PI / 2, true);
  const g = new ExtrudeGeometry(shape, {
    depth: d - radius * 2,
    bevelEnabled: true,
    bevelSegments: BEVEL_SEGMENTS,
    steps: 1,
    bevelSize: radius - ROUNDED_EPS,
    bevelThickness: radius,
    curveSegments: SOFT_STEPS,
  });
  g.center();
  const creased = white(toCreasedNormals(g, CREASE));
  if (softs.size >= SLABS_KEPT) {
    const oldest = softs.keys().next().value!;
    softs.get(oldest)!.dispose();
    softs.delete(oldest);
  }
  softs.set(key, creased);
  return creased;
};

/**
 * A cushion as an upholsterer makes one (round 8, 1f): a box with its
 * edges rounded `radius` (built from a grid, so its faces can bulge),
 * its face crowned `crown` in the middle (the seat's top, the back's
 * front), a welt a shade darker along its two seams, and, seeded, a
 * little sag where it is sat on and two or three soft creases across
 * it. Its texture laid in wood tiles over each face, as a board's is,
 * so the weave keeps its true size; kept by its size and seed.
 */
const cushions = new Map<string, BufferGeometry>();
/** grid steps within a round, and across a face, m */
const ROUND_STEPS = 4;
const CUSHION_STEP = 0.035;
/** how much darker a cushion's welt is */
const WELT = 0.84;
export type CushionShape = {
  dims: Vector3Tuple;
  radius: number;
  /** how far its face bulges at the middle, m */
  crown: number;
  /** which way it faces: its top (a seat) or its front (a back); or
      padded all round (a sofa's base, arms and back frame: upholstery
      over a frame, every face a little full, none flat), `crown` then
      at the middle of a face half a metre across or more, less on a
      narrower one, and no welt */
  facing: "up" | "front" | "all";
  /** the sag and the creases' seed, or null for none */
  seed: number | null;
};
export const cushionGeometry = (c: CushionShape) => {
  const key = [...c.dims, c.radius, c.crown, c.facing, c.seed ?? "-"].join(",");
  const had = cushions.get(key);
  if (had) return had;
  const half = c.dims.map((v) => v / 2) as [number, number, number];
  const r = Math.min(c.radius, Math.min(...half) * 0.95);
  const inner = half.map((v) => v - r) as [number, number, number];
  // the samples along an axis: dense across the rounds, even between
  const samples = (a: number) => {
    const out: number[] = [];
    for (let k = 0; k < ROUND_STEPS; k++)
      out.push(-half[a]! + (r * k) / ROUND_STEPS);
    const n = Math.max(1, Math.ceil((2 * inner[a]!) / CUSHION_STEP));
    for (let k = 0; k <= n; k++) out.push(-inner[a]! + (2 * inner[a]! * k) / n);
    for (let k = ROUND_STEPS - 1; k >= 0; k--)
      out.push(half[a]! - (r * k) / ROUND_STEPS);
    return out;
  };
  const along = [samples(0), samples(1), samples(2)];
  const pos: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  // each face a grid over its two axes, wound outward
  for (let face = 0; face < 6; face++) {
    const a = face >> 1;
    const sign = face & 1 ? 1 : -1;
    const [u, v] = faceAxes(face);
    const su = along[u]!;
    const sv = along[v]!;
    const base = pos.length / 3;
    for (const y of sv)
      for (const x of su) {
        const p = [0, 0, 0];
        p[a] = sign * half[a]!;
        p[u] = x;
        p[v] = y;
        pos.push(p[0]!, p[1]!, p[2]!);
        uvs.push(x / WOOD_M, y / WOOD_M);
      }
    const nu = su.length;
    for (let j = 0; j < sv.length - 1; j++)
      for (let i = 0; i < nu - 1; i++) {
        const q = base + j * nu + i;
        // u × v is +a for the z faces and −a for the others (faceAxes):
        // wound so each face's normal points out
        const ccw = (a === 2 ? 1 : -1) * sign > 0;
        if (ccw) index.push(q, q + 1, q + nu, q + 1, q + nu + 1, q + nu);
        else index.push(q, q + nu, q + 1, q + 1, q + nu, q + nu + 1);
      }
  }
  // rounded: each point pushed onto the round about the inner box
  const n = pos.length / 3;
  const tone = new Float32Array(n * 3);
  const all = c.facing === "all";
  const up = c.facing === "up" ? 1 : 2;
  const [ax, bx] = c.facing === "up" ? [0, 2] : [0, 1];
  const sag = c.seed === null ? 0 : 0.006 + 0.008 * hash01(c.seed, 1);
  const sagAt = c.seed === null ? 0 : (hash01(c.seed, 2) - 0.5) * 0.4;
  const creases =
    c.seed === null
      ? []
      : [0, 1, 2].slice(0, 2 + Math.floor(hash01(c.seed, 3) * 2)).map((k) => ({
          at: (hash01(c.seed!, 10 + k) - 0.5) * 1.4,
          turn: (hash01(c.seed!, 20 + k) - 0.5) * 0.8,
        }));
  for (let i = 0; i < n; i++) {
    const p = [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
    const q = p.map((v, k) => Math.max(-inner[k]!, Math.min(inner[k]!, v)));
    const d = p.map((v, k) => v - q[k]!);
    const len = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    const out = d.map((v) => v / len);
    for (let k = 0; k < 3; k++) p[k] = q[k]! + out[k]! * r;
    // the crown: the face's middle bulging out, fading to its seams
    const s = Math.max(-1, Math.min(1, p[ax]! / half[ax]!));
    const t = Math.max(-1, Math.min(1, p[bx]! / half[bx]!));
    const bulge = (1 - s * s) * (1 - t * t);
    const onFace = Math.max(0, out[up]!);
    if (all) {
      // padded all round: each face full in its middle, by its size
      for (let a = 0; a < 3; a++) {
        const [u, v] = [(a + 1) % 3, (a + 2) % 3];
        const su = Math.max(-1, Math.min(1, p[u]! / half[u]!));
        const sv = Math.max(-1, Math.min(1, p[v]! / half[v]!));
        const k = c.crown * Math.min(1, Math.min(half[u]!, half[v]!) / 0.25);
        p[a] =
          p[a]! +
          out[a]! * Math.abs(out[a]!) * k * (1 - su * su) * (1 - sv * sv);
      }
    } else {
      p[up] = p[up]! + c.crown * bulge * onFace;
      // the back face a little crowned too, the other way
      p[up] = p[up]! - c.crown * 0.35 * bulge * Math.max(0, -out[up]!);
    }
    if (c.seed !== null && c.facing === "up" && out[1]! > 0) {
      // sat on: a soft hollow towards the front, off the middle
      const dx = (s - sagAt) / 0.55;
      const dz = (t - 0.35) / 0.6;
      p[1] = p[1]! - sag * Math.exp(-(dx * dx + dz * dz)) * onFace;
      // creases running back from the front edge, faint
      for (const cr of creases) {
        const line = s - cr.at - cr.turn * t;
        p[1] =
          p[1]! -
          0.0018 * Math.exp(-(line * line) / 0.004) * Math.max(0, t) * onFace;
      }
    }
    pos[i * 3] = p[0]!;
    pos[i * 3 + 1] = p[1]!;
    pos[i * 3 + 2] = p[2]!;
    // the welt: where the face's round meets the sides, all round
    const rim = Math.abs(out[up]!);
    const welt = Math.exp(-((rim - 0.7) * (rim - 0.7)) / 0.006);
    const k = all ? 1 : 1 - (1 - WELT) * welt;
    tone[i * 3] = k;
    tone[i * 3 + 1] = k;
    tone[i * 3 + 2] = k;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // the faces' seams share their normals, so the rounds are smooth
  const nor = g.getAttribute("normal");
  const sum = new Map<string, [number, number, number]>();
  const keyOf = (i: number) =>
    `${Math.round(pos[i * 3]! * 1e5)},${Math.round(pos[i * 3 + 1]! * 1e5)},${Math.round(pos[i * 3 + 2]! * 1e5)}`;
  for (let i = 0; i < n; i++) {
    const k = keyOf(i);
    const s0 = sum.get(k) ?? [0, 0, 0];
    s0[0] += nor.getX(i);
    s0[1] += nor.getY(i);
    s0[2] += nor.getZ(i);
    sum.set(k, s0);
  }
  for (let i = 0; i < n; i++) {
    const [x, y, z] = sum.get(keyOf(i))!;
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(i, x / l, y / l, z / l);
  }
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
  g.setAttribute("ply", new Float32BufferAttribute(new Float32Array(n * 3), 3));
  withBakeDefaults(g);
  if (cushions.size >= SLABS_KEPT) {
    const oldest = cushions.keys().next().value!;
    cushions.get(oldest)!.dispose();
    cushions.delete(oldest);
  }
  cushions.set(key, g);
  return g;
};
