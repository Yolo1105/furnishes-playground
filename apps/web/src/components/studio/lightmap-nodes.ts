import {
  attribute,
  float,
  Fn,
  fwidth,
  max,
  positionView,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { Color } from "three";
import { MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { WHITE_UV } from "./bake-defaults";
import { LIGHTMAP } from "./lightmap";

type Builder = { geometry: { hasAttribute: (name: string) => boolean } };
/** a geometry's attribute, or `none` for a geometry without it (a
    room's own part, a stock model drawn in a finish): read as the
    geometry has it, as three reads a normal (the geometry's attributes
    are in its shader's key) */
const orNone = <T extends "vec2" | "vec4">(
  name: string,
  type: T,
  none: Node,
): Node<T> =>
  Fn((builder: Builder) =>
    builder.geometry.hasAttribute(name) ? attribute(name, type) : none,
  )() as unknown as Node<T>;

/**
 * The baked light as the furniture's materials read it (round 8, 1a
 * and 1b): one set of nodes, shared by every finish, so the pieces keep
 * sharing their shaders.
 *
 * - A board reads its texel of the atlas through its second UV set; any
 *   other part (a leg, a cushion, a book) its vertices' `lm`, which hold
 *   what is taken away (so a part never baked, or with no `lm` at all,
 *   takes nothing). `bakedOcclusion` scales the indirect light (as the
 *   material's ambient occlusion), `bakedSky` the window's area lights.
 * - `edgeLift`: a board's convex edges catch the light. Each vertex of a
 *   board carries how near it stands to each of its face's four edges
 *   (the `edge` attribute, part-geometry.ts: 1 less the distance in m,
 *   an edge another board covers set far off), so the line is drawn at
 *   the pixel, a pixel or the round-over wide, whichever is more, and
 *   given over with distance so it never crawls.
 */

const lm = orNone("lm", "vec2", vec2(0, 0));
const baked = texture(
  LIGHTMAP,
  Fn((builder: Builder) =>
    builder.geometry.hasAttribute("uv1") ? uv(1) : vec2(WHITE_UV, WHITE_UV),
  )(),
);
/** the light the room's fill reaches a point with */
export const bakedOcclusion = baked.r.mul(
  float(1).sub(lm.x),
) as unknown as Node<"float">;
/** how much of the sky's light, through the window, reaches it */
export const bakedSky = baked.g.mul(
  float(1).sub(lm.y),
) as unknown as Node<"float">;

/** how much brighter a convex edge's line is than its face */
export const EDGE_LIFT = 0.09;
/** the line at least this wide, m: the round-over's own width */
export const EDGE_MIN = 0.0018;
/** from this far, m, the line gives way, all of it by the second */
export const EDGE_FADE = { from: 6, to: 14 } as const;
const edge = orNone("edge", "vec4", vec4(0, 0, 0, 0));
const nearest = float(1).sub(max(max(edge.x, edge.y), max(edge.z, edge.w)));
const width = max(fwidth(nearest).mul(1.25), EDGE_MIN);
const line = float(1).sub(smoothstep(0, width, nearest));
const fade = float(1).sub(
  smoothstep(EDGE_FADE.from, EDGE_FADE.to, positionView.z.negate()),
);
export const edgeLift = float(1).add(
  line.mul(fade).mul(EDGE_LIFT),
) as unknown as Node<"float">;

/** the footprint's colour, a warm near-black as a shadow on oak is, and
    how dark it is where the piece covers all above it */
const FOOT_TINT = new Color("#1c140e");
export const FOOT_STRENGTH = 0.95;
/** a piece's soft footprint on the floor (Bake.tsx lays it): dark where
    the piece covers the sky above the floor, read from its rectangle of
    the atlas; drawn over the floor, a hair above it and pulled a step
    forward in depth, so it never fights the floor for a pixel */
/** a shadow laid over the floor in the footprint's tint: a hair over
    it, pulled forward by a fixed step only (a slope-scaled offset grew
    so large at a grazing look that a footprint showed through a rug
    lying over it) */
const onFloor = () => {
  const m = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: -4,
  });
  m.colorNode = vec3(FOOT_TINT.r, FOOT_TINT.g, FOOT_TINT.b);
  return m;
};
export const FOOTPRINT = onFloor();
FOOTPRINT.opacityNode = float(1)
  .sub(texture(LIGHTMAP, uv()).r)
  .mul(FOOT_STRENGTH);

/** a soft shadow on the floor where a thing lying on it meets it (a
    rug's edge, rug.ts): the footprint's tint, as dark as its geometry's
    `shade` says, drawn over the floor as the footprint is */
export const CONTACT = onFloor();
CONTACT.opacityNode = attribute("shade", "float");
