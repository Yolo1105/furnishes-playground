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
  // no shadow map is drawn in the still: one drawn with the pieces
  // hidden would be the one the room is then drawn with (a map is drawn
  // only when asked for, ShadowsOnChange.tsx); the ask waits for the
  // room's own frame
  const paused: { shadow: LightShadow; auto: boolean; asked: boolean }[] = [];
  scene.traverse((o) => {
    const shadow = (o as { shadow?: LightShadow }).shadow;
    if (!shadow) return;
    paused.push({
      shadow,
      auto: shadow.autoUpdate,
      asked: shadow.needsUpdate,
    });
    shadow.autoUpdate = false;
    shadow.needsUpdate = false;
  });
  try {
    take();
  } finally {
    hidden.forEach((o, i) => {
      if (o) o.visible = shown[i]!;
    });
    for (const p of paused) {
      p.shadow.autoUpdate = p.auto;
      p.shadow.needsUpdate = p.asked;
    }
  }
};

/**
 * Whether a wait until `at` (performance.now's clock) is still under
 * way; while it is, one frame is asked for when it ends, by a timer,
 * rather than a frame drawn each moment of it (a still room drew the
 * whole picture a frame at a time through every wait).
 */
export const wakeAt = (
  timer: { current: number },
  at: number,
  invalidate: () => void,
) => {
  const left = at - performance.now();
  if (left <= 0) return false;
  if (!timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      invalidate();
    }, left);
  return true;
};
