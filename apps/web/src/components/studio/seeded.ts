/**
 * A seeded stream of numbers in [0, 1): a linear congruential generator
 * (Numerical Recipes' constants), the same seed giving the same stream
 * on every machine, so a shelf, a curtain's folds, a tile's grain or a
 * wall's marks are laid the same each time they are drawn.
 */
export const seeded = (seed: number) => {
  let n = seed >>> 0 || 1;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
};

/** the value `r` of the way from `a` to `b` */
export const within = (r: number, [a, b]: readonly [number, number]) =>
  a + r * (b - a);
