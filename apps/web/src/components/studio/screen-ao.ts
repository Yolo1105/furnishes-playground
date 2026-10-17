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
 * A material takes it by a flag of its own, a number, which three keys
 * a shader by (RenderObject's material key, on or off), so a model's
 * program is never shared with a board's that reads none.
 */
export const GTAO_SHARE = 0.4;

export type ScreenAoMaterial = Material & { screenAo?: number };

/** a model's material marked to take the screen's occlusion */
export const takesScreenAo = (m: Material) => {
  (m as ScreenAoMaterial).screenAo = 1;
  return m;
};

/** how much of the screen's occlusion a material takes, 0 to 1 */
export const screenAoOf = (m: Material | null | undefined) =>
  (m as ScreenAoMaterial | null | undefined)?.screenAo ? GTAO_SHARE : 0;
