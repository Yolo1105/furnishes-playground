import { BufferAttribute, type BufferGeometry, Float32BufferAttribute } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { hash01 } from "../studio/seeded";

/**
 * A board's geometry for scanned materials (round 10): a box with its
 * edges rounded, its triangles in two groups (0 the two faces across the
 * board's thickness, 1 its four edges) and its texture laid in metres,
 * so a scan of a known physical size lies at its true scale whatever
 * the board's size, the way a real panel is cut from a sheet.
 *
 * Everything lives in the geometry's `uv` attribute, nothing in a
 * shader: the path tracer reads the same coordinates the rasteriser
 * does. Each board is also cut from its own place in the sheet (an
 * offset of up to a period each way) and half of them are turned end
 * for end (U flipped), seeded by the piece and the board, so no two
 * boards of a piece show the same patch.
 *
 * The grain runs along a face's longer side (a side and a door up their
 * height, a top and a shelf along their length); on an edge the plies
 * run along the board, lined up with its thickness, and only the
 * length is offset, so the plies stay where the board's faces are.
 */

export type V3 = [number, number, number];

/** a scanned set's physical size, m (the stretch one texture repeat
    covers across U and V), and which texture axis its grain (or, on an
    edge set, its plies) runs along */
export type ScanScale = { size: [number, number]; grain: "u" | "v" };

/** the rounded edge, m, and its steps (as the studio's boards) */
export const BOARD_ROUND = 0.0018;
export const BOARD_ROUND_STEPS = 3;

/** a board's cut from the sheet: an offset in periods along each
    texture axis and whether it is turned end for end */
export type Cut = { du: number; dv: number; flip: boolean };

/** a string folded to a seed */
const seedOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** where a board is cut from the sheet: seeded by the piece's recipe and
    the board, the same every time the piece is built */
export const cutOf = (recipe: string, board: string): Cut => {
  const seed = seedOf(`${recipe}/${board}`);
  return {
    du: hash01(seed, 1),
    dv: hash01(seed, 2),
    flip: hash01(seed, 3) < 0.5,
  };
};

/** a scan's coordinates for a stretch `along` its grain and `across` it,
    in metres, by which texture axis the grain runs along */
const scanUv = (
  s: ScanScale,
  along: number,
  across: number,
): [number, number] =>
  s.grain === "u"
    ? [along / s.size[0], across / s.size[1]]
    : [across / s.size[0], along / s.size[1]];

/**
 * A board of `dims` (m, centred), its faces in `face`'s scale and its
 * edges in `edge`'s, cut as `cut` says. Group 0 is the two faces across
 * the thickness, group 1 the four edges.
 */
export const boardGeometry = (
  dims: V3,
  face: ScanScale,
  edge: ScanScale,
  cut: Cut,
): BufferGeometry => {
  const [w, h, d] = dims;
  const g = new RoundedBoxGeometry(
    w,
    h,
    d,
    BOARD_ROUND_STEPS,
    Math.min(BOARD_ROUND, Math.min(w, h, d) / 3),
  );
  const pos = g.getAttribute("position");
  // three's rounded box comes without an index: a vertex a corner of
  // a triangle, in order
  const index = g.getIndex();
  const at = (k: number) => (index ? index.getX(k) : k);
  const thin = dims.indexOf(Math.min(w, h, d));
  // the face's grain along its longer side
  const inPlane = [0, 1, 2].filter((a) => a !== thin);
  const long =
    dims[inPlane[0]!]! >= dims[inPlane[1]!]! ? inPlane[0]! : inPlane[1]!;
  const short = inPlane[0] === long ? inPlane[1]! : inPlane[0]!;
  // each vertex belongs to one side of the box (three's box sides are
  // its groups, +x −x +y −y +z −z, sharing no vertex): its round, half
  // of the arris, takes that side's coordinates, so the seam between a
  // face and an edge falls along the middle of the round
  const sideOf = new Int8Array(pos.count).fill(-1);
  for (const grp of g.groups)
    for (let i = grp.start; i < grp.start + grp.count; i++)
      sideOf[at(i)] = grp.materialIndex! >> 1;
  const uv = new Float32Array(pos.count * 2);
  const p: V3 = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i);
    p[1] = pos.getY(i);
    p[2] = pos.getZ(i);
    const n = sideOf[i]!;
    let u: number;
    let v: number;
    if (n === thin) {
      [u, v] = scanUv(face, p[long]!, p[short]!);
      u += face.grain === "u" ? cut.du : cut.dv;
      v += face.grain === "u" ? cut.dv : cut.du;
    } else {
      // an edge: the plies along the board's length on that edge,
      // lined up with its thickness from the board's own face
      const along = [0, 1, 2].find((a) => a !== thin && a !== n)!;
      [u, v] = scanUv(edge, p[along]!, p[thin]! + dims[thin]! / 2);
      if (edge.grain === "u") u += cut.du;
      else v += cut.du;
    }
    uv[i * 2] = cut.flip ? -u : u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  // the triangles in two groups: the faces, then the edges
  const faces: number[] = [];
  const edges: number[] = [];
  for (const grp of g.groups) {
    const into = grp.materialIndex! >> 1 === thin ? faces : edges;
    for (let i = grp.start; i < grp.start + grp.count; i++)
      into.push(at(i));
  }
  g.setIndex(new BufferAttribute(new Uint32Array([...faces, ...edges]), 1));
  g.clearGroups();
  g.addGroup(0, faces.length, 0);
  g.addGroup(faces.length, edges.length, 1);
  return g;
};
