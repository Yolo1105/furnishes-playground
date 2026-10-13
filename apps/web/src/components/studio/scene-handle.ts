import type { Camera, Scene } from "three";
import type { Corner, Shot } from "./camera-bookmarks";
import type { Sun } from "./scene-copy";

/**
 * The live 3D scene, for code outside the canvas that hands the room
 * over (the glTF export): set by the scene while it is mounted in the
 * main column, null otherwise, with the room's box and the sun as the
 * scene has them, so an export frames and lights the room as the
 * stage does.
 */
export type Live = {
  scene: Scene;
  camera: Camera;
  /** the room's box, m */
  w: number;
  d: number;
  h: number;
  /** the flat's box, m */
  span: { w: number; d: number };
  /** the flat's middle about the room's, m */
  centre: readonly [number, number];
  /** the corner the room's picture is taken from */
  corner: Corner;
  /** where the Corner view stands: a corner facing the window, stepped
      along its wall or its lens narrowed past a piece in its foreground */
  shot: Shot;
  sun: Sun;
};

let live: Live | null = null;
export const setLive = (l: Live | null) => {
  live = l;
};
export const liveScene = () => live;
