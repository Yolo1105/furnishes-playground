/**
 * Switches for diagnosing the picture, read once from the page's
 * query in development only (`?noao&noprobes&noplaster`; the stability
 * page, `?check=stability`, runs with each in turn):
 * each turns one layer of the look off so a defect can be laid at the
 * right door by rendering with and without it (`?nowarm` builds the
 * shaders on the first frame, as before the warm-up, to measure it).
 * Never on in production.
 */
export const DEV_FLAGS = [
  "noao",
  "noprobes",
  "noplaster",
  "nowarm",
  // the floor's slow unevenness (Reflection.tsx)
  "nouneven",
  // the cornice at the walls' head (Room3D.tsx)
  "nocornice",
  // the windows' glow (Post.tsx)
  "nobloom",
  // the sun's light, and the softness of its shadow's edge (Scene3D.tsx)
  "nosun",
  "nosoft",
  // the sun's cascades on the desktop (Sun.tsx): one map again
  "nocsm",
  // the windows' area lights (WindowLights.tsx), to weigh their cost
  "nowindowlights",
  // the stability page's layers (StabilityPanel.tsx): the screen-space
  // reflections and bounce, the temporal resolve (Post.tsx), the sun's
  // shadows (Scene3D.tsx), and every normal map (textures.ts)
  "nossr",
  "nossgi",
  "notraa",
  "noshadows",
  "flatnormals",
] as const;
export type DevFlag = (typeof DEV_FLAGS)[number];

const read = (): Set<DevFlag> => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined")
    return new Set();
  const q = new URLSearchParams(window.location.search);
  return new Set(DEV_FLAGS.filter((f) => q.has(f)));
};
let flags: Set<DevFlag> | null = null;
export const devFlag = (f: DevFlag) => (flags ??= read()).has(f);
/** a named parameter of the page's query in development (`?bench=photo`),
    null otherwise */
export const devParam = (name: string): string | null => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined")
    return null;
  return new URLSearchParams(window.location.search).get(name);
};
