/**
 * @furnishes/scene: one world frame for every renderer. The world is
 * x right along the room, y up, z toward the viewer, in metres; the
 * domain's geometry arrives in millimetres (see @furnishes/domain) and
 * crosses here. The studio's 3D (apps/web Scene3D, Room3D) reads the
 * conversion from this package so no renderer keeps its own.
 */
import type { Millimetres } from "@furnishes/domain";

/** millimetres to world metres */
export const toMetres = (value: Millimetres): number => value / 1000;
