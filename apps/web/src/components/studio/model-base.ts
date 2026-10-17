import { type Box3, type Mesh, type Object3D, Vector3 } from "three";

/**
 * How much of a loaded model's footprint its base fills (round 10): the
 * spread, across and along, of its vertices in its lowest `LOW` of its
 * height, as a share of its whole width and depth. A sofa or a bed sits
 * on most of its footprint; a plant on its pot, a chair on its legs.
 * The piece's bake (Bake.tsx) shadows the floor under a model by a box
 * this wide, its one contact with the floor now that the screen's
 * occlusion is laid on the model alone, not on the floor round it.
 * Held between `LEAST` (the box every model had before, 0.6 of its
 * footprint) and `MOST`, so no model's shadow grows past its edges.
 */
export const LOW = 0.2;
export const LEAST = 0.6;
export const MOST = 0.95;
/** at most this many of a mesh's vertices are looked at */
const SAMPLES = 20_000;

export const baseShareOf = (o: Object3D, box: Box3): [number, number] => {
  const size = box.getSize(new Vector3());
  const top = box.min.y + size.y * LOW;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const v = new Vector3();
  o.updateMatrixWorld(true);
  o.traverse((c) => {
    const m = c as Mesh;
    const pos = m.isMesh ? m.geometry?.getAttribute("position") : undefined;
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / SAMPLES));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.y > top) continue;
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      z0 = Math.min(z0, v.z);
      z1 = Math.max(z1, v.z);
    }
  });
  const share = (span: number, whole: number) =>
    Math.min(MOST, Math.max(LEAST, whole > 0 ? span / whole : LEAST));
  return x1 >= x0
    ? [share(x1 - x0, size.x), share(z1 - z0, size.z)]
    : [LEAST, LEAST];
};
