import {
  attribute,
  color,
  float,
  floor,
  fract,
  hash,
  materialColor,
  mix,
  mx_noise_float,
  sin,
  smoothstep,
  vec4,
} from "three/tsl";
import type { Node } from "three/webgpu";

/**
 * Birch plywood's edge, as the Furnishes pieces are cut from it: the
 * thin plies stacked across the 18 mm, light birch veneers with a darker
 * glue line between each, a little wavy along the edge as real plies
 * are, one a shade off the next. Grown in the shader from where a point
 * stands across the board's thickness (the slab's `ply` attribute,
 * part-geometry.ts), so it lies across every exposed edge at its true
 * size whatever the board's length, until a photographed edge (the
 * owner's `birch-edge` set, public/materials/README.md) replaces it.
 */

/** the plies across an 18 mm board: 13, about 1.4 mm each */
export const PLIES = 13;
/** the veneers' birch and the glue between, in sRGB */
const BIRCH = "#e9d7b6";
const BIRCH_DEEP = "#dcc49d";
const GLUE = "#8c6f4c";

/** the `ply` attribute: across the thickness 0–1, along the edge in m,
    and 1 on an edge face (0 on a face, a rod, a soft part) */
const ply = attribute<"vec3">("ply", "vec3");

/** the edge's colour at a point: the ply it falls in and how near a
    glue line */
const edge = (): Node<"vec3"> => {
  const along = ply.y;
  // a slow sway along the edge, as the plies run in a real sheet
  const sway = sin(along.mul(23))
    .mul(0.06)
    .add(mx_noise_float(along.mul(9)).mul(0.08));
  const at = ply.x.mul(PLIES).add(sway);
  const which = floor(at);
  const inPly = fract(at);
  // a veneer's own tone: alternate plies run the other way and read a
  // shade deeper, each with its own hair of difference
  const tone = mix(color(BIRCH), color(BIRCH_DEEP), hash(which).mul(0.6)).mul(
    float(1).add(hash(which.add(17)).sub(0.5).mul(0.06)),
  );
  // the glue line: dark at a ply's two sides, a fraction of it wide
  const glue = float(1)
    .sub(smoothstep(0, 0.14, inPly))
    .add(smoothstep(0.9, 1, inPly))
    .clamp(0, 1);
  return mix(tone, color(GLUE), glue.mul(0.75)) as unknown as Node<"vec3">;
};

/** a ply-built part's colour: its edges the plies, its faces as the
    material has them (its colour over its map); one node, shared by
    every plywood material, so they share their shaders */
export const plyColour: Node<"vec4"> = ply.z
  .greaterThan(0.5)
  .select(vec4(edge(), 1), materialColor) as unknown as Node<"vec4">;
