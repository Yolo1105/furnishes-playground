import type { Material } from "three";

/**
 * One occlusion a surface (round 10, Part 3). A piece's boards, its
 * books and its painted things carry their piece's baked occlusion, and
 * the room's shell its bake's bounce, which darkens its corners as
 * light does; the screen's occlusion (GTAO, Post.tsx) laid over those
 * darkened each corner twice. It is kept for what has no bake of its
 * own, a loaded model (a sofa, a plant, a lamp), at `GTAO_SHARE` of its
 * strength: a model's own maps already shade its folds.
 *
 * A model whose own file brings an occlusion map (glTF's occlusion
 * texture) keeps that one and takes none from the screen: its artist's
 * bake already darkens its folds, and its footprint (Bake.tsx) grounds
 * it on the floor.
 *
 * A material takes it by a flag of its own, a number, which three keys
 * a shader by (RenderObject's material key, on or off), so a model's
 * program is never shared with a board's that reads none.
 */
export const GTAO_SHARE = 0.5;

export type ScreenAoMaterial = Material & { screenAo?: number };

/** a model's material marked to take the screen's occlusion, unless it
    brings its own */
export const takesScreenAo = (m: Material) => {
  if (!(m as Material & { aoMap?: unknown }).aoMap)
    (m as ScreenAoMaterial).screenAo = 1;
  return m;
};

/** the occlusions a material lays on its surface: its own map, its
    piece's bake (the node finish.tsx and Furniture3D.tsx set) and the
    screen's; round 10 allows one */
export const aoSourcesOf = (m: Material) => {
  const n = m as ScreenAoMaterial & { aoMap?: unknown; aoNode?: unknown };
  const out: ("map" | "baked" | "screen")[] = [];
  if (n.aoMap) out.push("map");
  if (n.aoNode) out.push("baked");
  if (n.screenAo) out.push("screen");
  return out;
};

/** how much of the screen's occlusion a material takes, 0 to 1 */
export const screenAoOf = (m: Material | null | undefined) =>
  (m as ScreenAoMaterial | null | undefined)?.screenAo ? GTAO_SHARE : 0;
