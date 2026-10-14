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
  positionView,
  sin,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import { Color } from "three";
import type { Node } from "three/webgpu";

/**
 * Birch plywood's edge, as the Furnishes pieces are cut from it: the
 * thin plies stacked across the 18 mm, light birch veneers with a darker
 * glue line between each, a little wavy along the edge as real plies
 * are, one a shade off the next; stained with the board's own colour,
 * and given over to it with distance. Grown in the shader from where a point
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

/** how much of the board's own colour the plies take: a board finished
    in walnut or sage is stained through its edge too, as a real
    stained sheet is (left birch, every dark board was drawn round in
    cream, an illustration's outline from across the room) */
export const PLY_TINT = 0.85;
/** from this far, m, the plies give way to the board's own colour, all
    of it by the second: thirteen plies across 18 mm are under a pixel
    there, and drawn they only flickered into a light line */
export const PLY_FADE = { from: 2.5, to: 7 } as const;

/** a ply-built part's colour: its edges the plies, stained by the
    board's own colour and given over to it with distance, its faces as
    the material has them (its colour over its map); one node, shared
    by every plywood material, so they share their shaders */
const face = materialColor as unknown as Node<"vec4">;
/** birch in the working (linear) space the colours are in */
const BIRCH_LINEAR = new Color(BIRCH);
// the board's colour against birch's: a birch board's plies stay birch
const stain = mix(
  vec3(1),
  face.rgb
    .div(vec3(BIRCH_LINEAR.r, BIRCH_LINEAR.g, BIRCH_LINEAR.b))
    .min(vec3(1.15)),
  PLY_TINT,
);
const plies = edge().mul(stain);
const far = smoothstep(PLY_FADE.from, PLY_FADE.to, positionView.z.negate());
// an edge far off: the face's colour a shade down, as end grain is
const edgeFar = mix(plies, face.rgb.mul(0.9), far);
export const plyColour: Node<"vec4"> = ply.z
  .greaterThan(0.5)
  .select(vec4(edgeFar, 1), materialColor) as unknown as Node<"vec4">;
