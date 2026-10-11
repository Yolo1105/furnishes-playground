import {
  BoxGeometry,
  type BufferGeometry,
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
import type { Finish } from "./finish";
import { WOOD_M } from "./textures";

/**
 * The geometry a piece's parts are drawn with (finish.tsx draws them):
 * a board with its edges eased and its band in its vertex colours, its
 * joint lines, a rod and a soft block, each kept by size, and a built
 * piece's parts merged into a few batches, one a finish.
 */

/** the eased edge of a panel, m: two panels meeting leave a seam a
    few millimetres wide that catches a line of light or shadow, so
    where one board ends and the next begins is read at a glance */
const EDGE = 0.0025;
/** how much darker a panel's edge band stands than its face: the
    four narrow faces of a board are banded, and read as its outline */
const BAND = 0.86;
/** how dark the eased edge itself stands: the seam between two boards
    is drawn as the line a joint shows, so every board is outlined */
const SEAM = 0.72;
/** a slab's geometry: a box with its edges eased, its texture laid in
    metres with the grain along the panel's longer side (a top's along
    its length, a side's up its height, a door's up its height), so no
    two parts of a piece carry the grain the same way and each face
    takes the tile at one size; the four narrow faces carry the band's
    tone as a vertex colour. Kept by size, since a piece's panels
    repeat */
const slabs = new Map<string, BufferGeometry>();
const SLABS_KEPT = 512;
export const slabGeometry = (dims: Vector3Tuple) => {
  const key = dims.join(",");
  const had = slabs.get(key);
  if (had) return had;
  const [w, h, d] = dims;
  const edge = Math.min(EDGE, Math.min(w, h, d) / 3);
  const g = new RoundedBoxGeometry(w, h, d, 2, edge);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const tone = new Float32Array(pos.count * 3);
  // the board's thickness runs along its shortest side: the two faces
  // across it are the board's faces, the other four its edge band
  const thin = Math.min(w, h, d);
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
    if (nx >= ny && nx >= nz) {
      [a, b] = h >= d ? [y, z] : [z, y];
      across = w;
    } else if (ny >= nz) {
      [a, b] = w >= d ? [x, z] : [z, x];
      across = h;
    } else {
      [a, b] = w >= h ? [x, y] : [y, x];
      across = d;
    }
    uv.setXY(i, a / WOOD_M, b / WOOD_M);
    // a vertex on the eased edge faces no one axis
    const eased = Math.max(nx, ny, nz) < 0.98;
    const t = eased ? SEAM : across === thin ? 1 : BAND;
    tone[i * 3] = t;
    tone[i * 3 + 1] = t;
    tone[i * 3 + 2] = t;
  }
  uv.needsUpdate = true;
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
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
export const JOINT_OPACITY = 0.55;
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
  ].join("|");
};

/** the parts' own geometries placed where they stand, merged into one */
const placed = (parts: Part[], shape: (p: Part) => BufferGeometry) => {
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
    m.compose(
      at.set(...p.at),
      q.setFromEuler(e.set(...(p.rotation ?? [0, 0, 0]))),
      one,
    );
    return g.applyMatrix4(m);
  });
  const merged = mergeGeometries(each);
  for (const g of each) g.dispose();
  return merged;
};

export type Batch = {
  key: string;
  f: Finish;
  colour: string | undefined;
  faces: BufferGeometry;
  joints: BufferGeometry | null;
};

/** the parts in batches: those with the same finish and colour merged
    into one geometry, their boards' joint lines into another */
export const batchesOf = (all: Part[]): Batch[] => {
  const by = new Map<string, Part[]>();
  for (const p of all) {
    const k = batchOf(p);
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  return [...by].map(([k, ps]): Batch => {
    const first = ps[0]!;
    const boards = ps.filter((p) => "dims" in p);
    return {
      key: k,
      f: first.f,
      colour: "dims" in first ? first.colour : undefined,
      faces: placed(ps, (p) =>
        "dims" in p ? slabGeometry(p.dims) : rodGeometry(p.rod),
      ),
      joints: boards.length
        ? placed(boards, (p) => jointGeometry("dims" in p ? p.dims : [0, 0, 0]))
        : null,
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
  if (rods.size >= SLABS_KEPT) {
    const oldest = rods.keys().next().value!;
    rods.get(oldest)!.dispose();
    rods.delete(oldest);
  }
  rods.set(key, g);
  return g;
};

/** a geometry's vertex colours all white: the tone a part with no band
    carries, so it shares its finish's shader with the banded slabs */
const white = (g: BufferGeometry) => {
  const tone = new Float32Array(g.getAttribute("position").count * 3);
  tone.fill(1);
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
  return g;
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
