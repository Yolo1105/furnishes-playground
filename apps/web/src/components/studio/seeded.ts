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

/** a number in [0, 1) for a seed and a key, the same on every machine:
    a multiply and xor-shift mix, for one-off draws that need no stream
    (a piece's wood, a texel's ray turn, a cushion's sag, a loose turn) */
export const hash01 = (seed: number, k = 0) => {
  let x = (seed * 2654435761 + k * 97) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};
