import { type Feature, featureRect, type Panel } from "@furnishes/domain";
import type { ManifoldToplevel, Manifold } from "manifold-3d";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { WOOD_M } from "./surface-paint";

/**
 * A panel's machining cut for real: the slab (its edges eased as the
 * stage draws every board) minus its holes, grooves and cut-outs, as
 * one boolean in manifold-3d, in the panel's own frame (u along the
 * length from 0, v along the width, w along the thickness, mm; the
 * front face at w = thickness). The mesh comes back with its normals
 * (smooth across the eased edges, sharp where a cut meets a face),
 * its texture coordinates laid in metres by each face's axis as the
 * slab's are, so the grain runs on as before, and the band's tone on
 * the narrow faces and inside the cuts. Pure: the kernel comes in as
 * an argument, so the part worker and a Node test share this file.
 */
export type CutMesh = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** the band's tone a vertex carries (finish.tsx: 1 a face, BAND a
      narrow face or a cut, SEAM an eased edge) */
  tones: Float32Array;
  indices: Uint32Array;
  /** mm³ */
  volume: number;
};

/** the eased edge of a board, mm (finish.tsx's EDGE) */
export const EDGE_MM = 2.5;
/** finish.tsx's tones: the four narrow faces and the cuts, and the
    eased edge itself */
export const BAND = 0.86;
export const SEAM = 0.72;
/** a hole's wall in facets */
const ROUND = 24;
/** a polygon of that many sides inscribed in the hole's circle takes
    1.1% less area than the circle; drawn this much wider it takes the
    circle's own area, so the volume a hole takes is the hole's */
const AREA_TRUE = Math.sqrt(
  (2 * Math.PI) / (ROUND * Math.sin((2 * Math.PI) / ROUND)),
);
/** how far a tool reaches past the face it enters, so the boolean never
    leaves a skin, mm */
const PAST = 0.5;
/** edges meeting at less than this stay smooth (the eased edge's
    facets meet at 45°), sharper ones split the normals, degrees */
const SHARP = 60;
/** a vertex whose smoothed normal leans further than this off every
    axis is on the eased edge itself: the edge's two facets lie at
    22.5° and 67.5°, so a face's rim vertex leans 11° and the edge's
    middle one 45° */
const EASED_BELOW = Math.cos((30 * Math.PI) / 180);

type Dims = Pick<Panel, "length" | "width" | "thickness">;

/** the slabs made, by their size: a piece's panels repeat, and a
    slab is read, never changed, so one serves every cut of its size */
const slabs = new Map<string, Manifold>();
const SLABS_KEPT = 32;

/** the slab with its edges eased, welded for the kernel; kept by its
    size, so a caller never deletes it */
export const slabManifold = (m: ManifoldToplevel, p: Dims): Manifold => {
  const key = `${p.length},${p.width},${p.thickness}`;
  const had = slabs.get(key);
  if (had) return had;
  const made = makeSlab(m, p);
  if (slabs.size >= SLABS_KEPT) {
    const oldest = slabs.keys().next().value!;
    slabs.get(oldest)!.delete();
    slabs.delete(oldest);
  }
  slabs.set(key, made);
  return made;
};

const makeSlab = (m: ManifoldToplevel, p: Dims): Manifold => {
  const edge = Math.min(EDGE_MM, Math.min(p.length, p.width, p.thickness) / 3);
  const g = new RoundedBoxGeometry(p.length, p.width, p.thickness, 2, edge);
  const pos = g.getAttribute("position");
  const vertProperties = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    vertProperties[i * 3] = pos.getX(i) + p.length / 2;
    vertProperties[i * 3 + 1] = pos.getY(i) + p.width / 2;
    vertProperties[i * 3 + 2] = pos.getZ(i) + p.thickness / 2;
  }
  // the geometry is not indexed: every triangle has its own three
  // vertices, which the welding below joins by position
  const index = g.getIndex();
  const triVerts = index
    ? Uint32Array.from(index.array)
    : Uint32Array.from({ length: pos.count }, (_, i) => i);
  g.dispose();
  return welded(m, vertProperties, triVerts);
};

/** a mesh of separate faces (the kernels' meshes repeat a vertex at
    every face it is on) welded by position into a manifold */
export const welded = (
  m: ManifoldToplevel,
  vertProperties: Float32Array,
  triVerts: Uint32Array,
): Manifold => {
  const mesh = new m.Mesh({ numProp: 3, vertProperties, triVerts });
  mesh.merge();
  const out = m.Manifold.ofMesh(mesh);
  const status = out.status();
  if (status !== "NoError") throw new Error(`the slab is ${status}`);
  return out;
};

/** the tools, one solid each, where the features sit on the panel */
export const toolsOf = (
  m: ManifoldToplevel,
  p: Dims,
  features: readonly Feature[],
): Manifold[] =>
  features.map((f) => {
    const r = featureRect(f);
    const face = f.kind === "cutout" ? "front" : f.face;
    // a feature's u is read looking at its face: on the back it is
    // mirrored across the length (featureMark reads it the same way)
    const u0 = face === "front" ? r.u : p.length - r.u - r.w;
    const depth = f.kind === "cutout" ? p.thickness : f.depth;
    const through = depth >= p.thickness;
    const h = through ? p.thickness + 2 * PAST : depth + PAST;
    const w0 = through ? -PAST : face === "front" ? p.thickness - depth : -PAST;
    if (f.kind === "hole")
      return m.Manifold.cylinder(
        h,
        (f.d / 2) * AREA_TRUE,
        (f.d / 2) * AREA_TRUE,
        ROUND,
        false,
      ).translate(face === "front" ? f.u : p.length - f.u, f.v, w0);
    return m.Manifold.cube([r.w, r.h, h], false).translate(u0, r.v, w0);
  });

/** the slab cut: positions, normals, texture coordinates and tones */
export const cutMeshOf = (
  m: ManifoldToplevel,
  p: Dims,
  features: readonly Feature[],
  slab?: Manifold,
): CutMesh => {
  const base = slab ?? slabManifold(m, p);
  const tools = toolsOf(m, p, features);
  let body = base;
  if (tools.length) {
    const all = m.Manifold.union(tools);
    body = base.subtract(all);
    all.delete();
    for (const t of tools) t.delete();
  }
  const volume = body.volume();
  // the kernel counts property channels after the position: channel 0
  // lands the normals right after the three coordinates
  const smooth = body.calculateNormals(0, SHARP);
  const mesh = smooth.getMesh(0);
  if (body !== base) body.delete();
  smooth.delete();
  const n = mesh.numVert;
  const stride = mesh.numProp;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const tones = new Float32Array(n);
  const [L, W, T] = [p.length, p.width, p.thickness];
  const thin = Math.min(L, W, T);
  for (let i = 0; i < n; i++) {
    const at = i * stride;
    const x = mesh.vertProperties[at]!;
    const y = mesh.vertProperties[at + 1]!;
    const z = mesh.vertProperties[at + 2]!;
    const nx = mesh.vertProperties[at + 3]!;
    const ny = mesh.vertProperties[at + 4]!;
    const nz = mesh.vertProperties[at + 5]!;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
    // the face's two coordinates by the axis it faces, the longer side
    // first so the grain runs along it (as slabGeometry lays a slab)
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    const cx = (x - L / 2) / 1000;
    const cy = (y - W / 2) / 1000;
    const cz = (z - T / 2) / 1000;
    let a: number;
    let b: number;
    let across: number;
    if (ax >= ay && ax >= az) {
      [a, b] = W >= T ? [cy, cz] : [cz, cy];
      across = L;
    } else if (ay >= az) {
      [a, b] = L >= T ? [cx, cz] : [cz, cx];
      across = W;
    } else {
      [a, b] = L >= W ? [cx, cy] : [cy, cx];
      across = T;
    }
    uvs[i * 2] = a / WOOD_M;
    uvs[i * 2 + 1] = b / WOOD_M;
    const eased = Math.max(ax, ay, az) < EASED_BELOW;
    tones[i] = eased ? SEAM : across === thin ? 1 : BAND;
  }
  return {
    positions,
    normals,
    uvs,
    tones,
    indices: Uint32Array.from(mesh.triVerts),
    volume,
  };
};
