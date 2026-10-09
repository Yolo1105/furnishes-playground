import type { Vector3Tuple } from "three";
import type { Angle } from "./studio-store";

/**
 * Where the camera stands for each named angle of the 3D view, scaled
 * to the flat's box and looking at its middle: the stage's own poses,
 * and the ones a glTF export carries as named cameras.
 */
/** eye height, m: the perspective's and the walk's */
export const EYE = 1.6;

export type Pose = { pos: Vector3Tuple; at: Vector3Tuple };

export const cameraFor = (
  angle: Angle,
  w: number,
  d: number,
  h: number,
  centre: readonly [number, number],
): Pose => {
  const r = Math.max(w, d);
  const [cx, cz] = centre;
  // the four sides look in over the near wall, which is open to the
  // camera, from above the walls: the floor, the pieces and the far wall
  // all in view, as a section through the room is drawn
  const over = h * 1.3;
  const side: Vector3Tuple = [cx, h / 3, cz];
  const at: Record<string, Vector3Tuple> = {
    // the perspective stands at eye height beyond the open near corner
    // and looks a little down across the room, as a photograph of it
    // is taken: the floor in view, the walls upright
    Perspective: [cx, EYE * 0.6, cz],
    Top: [cx, h / 2, cz],
  };
  const pos: Record<string, Vector3Tuple> = {
    Perspective: [cx + r * 0.78, EYE, cz + r * 0.98],
    Front: [cx, over, cz + r * 1.3],
    Back: [cx, over, cz - r * 1.3],
    Left: [cx - r * 1.3, over, cz],
    Right: [cx + r * 1.3, over, cz],
    Top: [cx, r * 1.8, cz + 0.01],
  };
  return { pos: pos[angle] ?? pos.Perspective!, at: at[angle] ?? side };
};

/** the named angles a glTF export carries as cameras, and the walk's
    start: in from the south-east corner at eye height, looking into
    the room a little down */
export const BOOKMARKS = [
  "Perspective",
  "Front",
  "Back",
  "Left",
  "Right",
  "Top",
] as const;
export const walkStart = (w: number, d: number): Pose => {
  const x = w / 2 - 0.6;
  const z = d / 2 - 0.6;
  // yaw π/4 looks north-west, pitch a little down
  const yaw = Math.PI / 4;
  const pitch = -0.12;
  return {
    pos: [x, EYE, z],
    at: [
      x - Math.sin(yaw) * Math.cos(pitch),
      EYE + Math.sin(pitch),
      z - Math.cos(yaw) * Math.cos(pitch),
    ],
  };
};
