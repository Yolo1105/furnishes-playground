/**
 * @furnishes/scene — one world frame for every renderer.
 *
 * World frame (fixed here, converted at the edges):
 *   x → right along the room, y → up, z → toward the viewer; metres.
 * Domain geometry arrives in millimetres (see @furnishes/domain).
 *
 * Adapters for the inherited conventions (three.js y-up, SceneGraph z-up,
 * CAD mm X-right/Y-depth/Z-up, Block3D mm x-along-wall/y-toward-wall/z-up)
 * will live here. Nothing is implemented yet.
 */
import type { Millimetres } from "@furnishes/domain";

export const SCENE_PACKAGE = "@furnishes/scene" as const;

/** Millimetres → world metres. */
export const toMetres = (value: Millimetres): number => value / 1000;
