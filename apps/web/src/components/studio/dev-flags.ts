/**
 * Switches for diagnosing the picture, read once from the page's
 * query in development only (`?noao&noprobes&noskyshadow&noplaster`):
 * each turns one layer of the look off so a defect can be laid at the
 * right door by rendering with and without it. Never on in production.
 */
export type DevFlag = "noao" | "noprobes" | "noskyshadow" | "noplaster";

const read = (): Set<DevFlag> => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined")
    return new Set();
  const q = new URLSearchParams(window.location.search);
  return new Set(
    (["noao", "noprobes", "noskyshadow", "noplaster"] as const).filter((f) =>
      q.has(f),
    ),
  );
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
