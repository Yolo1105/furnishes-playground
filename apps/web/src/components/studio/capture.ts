import type { LightShadow, Object3D, Scene } from "three";

/** a still's state, as the stage reports it: one is on its way, or the
    last change is in it */
export type StillState = "pending" | "ready";

/**
 * A still of the scene taken for its own use (a probe's cubemap, the
 * floor's reflection): the given objects are hidden for it, and the
 * shadow maps are not drawn again for each of its renders, since the
 * last frame's serve; everything is put back after.
 */
export const stillOf = (
  scene: Scene,
  hidden: (Object3D | null)[],
  take: () => void,
) => {
  const shown = hidden.map((o) => o?.visible ?? true);
  for (const o of hidden) if (o) o.visible = false;
  const paused: LightShadow[] = [];
  scene.traverse((o) => {
    const shadow = (o as { shadow?: LightShadow }).shadow;
    if (shadow?.autoUpdate) {
      shadow.autoUpdate = false;
      paused.push(shadow);
    }
  });
  try {
    take();
  } finally {
    hidden.forEach((o, i) => {
      if (o) o.visible = shown[i]!;
    });
    for (const shadow of paused) shadow.autoUpdate = true;
  }
};
