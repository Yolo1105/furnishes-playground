import { float, positionView, smoothstep } from "three/tsl";
import { LineBasicNodeMaterial } from "three/webgpu";

/**
 * A piece's edge lines, faded with distance. A one-pixel line far off
 * falls between the pixels, and as the camera moves (and TRAA's jitter
 * moves the frame a fraction of a pixel each time) it is drawn in one
 * row and then the next: the line crawls. Near, a line is wide enough
 * against the pixels to stay put; so it is drawn in full to `from`
 * metres from the camera and gone by `to`, where the piece's own shading
 * says where its edges are.
 */
export const EDGE_FADE = { from: 5, to: 12 };

/** one material a colour, kept: an outline comes and goes as the
    pointer passes over a piece, and a new material each time built its
    shader again in the middle of a drag (a pipeline a piece) */
const kept = new Map<string, LineBasicNodeMaterial>();
export const edgeLine = (colour: string) => {
  const had = kept.get(colour);
  if (had) return had;
  const m = new LineBasicNodeMaterial({
    color: colour,
    transparent: true,
    depthWrite: false,
  });
  m.opacityNode = float(1).sub(
    smoothstep(EDGE_FADE.from, EDGE_FADE.to, positionView.z.negate()),
  );
  kept.set(colour, m);
  return m;
};

/** a board's joint lines, faded with distance as the outline is but
    sooner and fainter: the hairline two eased edges leave where boards
    meet, drawn near and gone by `JOINT_FADE.to`, where a constant
    one-pixel line round every board read as a drawing's ink. One
    material a colour and an opacity, kept */
export const JOINT_FADE = { from: 2, to: 6 } as const;
const joints = new Map<string, LineBasicNodeMaterial>();
export const jointLine = (colour: string, opacity: number) => {
  const key = `${colour}:${opacity}`;
  const had = joints.get(key);
  if (had) return had;
  const m = new LineBasicNodeMaterial({
    color: colour,
    transparent: true,
    depthWrite: false,
  });
  m.opacityNode = float(opacity).mul(
    float(1).sub(
      smoothstep(JOINT_FADE.from, JOINT_FADE.to, positionView.z.negate()),
    ),
  );
  joints.set(key, m);
  return m;
};
