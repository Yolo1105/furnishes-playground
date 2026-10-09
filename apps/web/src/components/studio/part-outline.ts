import type { PartMesh } from "./part-build";

/**
 * A built part's outline on the plan, from the silhouette the worker
 * projected: pure, with nothing of the kernels behind it, so the
 * clashes read it in the studio's first load.
 */
/** a ring's signed area: positive counter-clockwise */
const ringArea = (ring: [number, number][]) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

/** a built part's outline on the plan for the clashes: the largest
    outer ring of its silhouette (a hole is never a clash), about the
    body's middle, the plan's y running north from the body's; none
    when the body's outline is its box */
export const partOutline = (
  mesh: Pick<PartMesh, "silhouette" | "bounds">,
): [number, number][] | undefined => {
  const rings = (mesh.silhouette ?? []).filter((r) => ringArea(r) > 0);
  if (!rings.length) return undefined;
  const outer = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  const [lo, hi] = mesh.bounds;
  const cx = (lo[0] + hi[0]) / 2;
  const cy = (lo[1] + hi[1]) / 2;
  // a ring that is its box (four corners at the bounds) is no outline
  if (
    outer.length === 4 &&
    outer.every(
      ([x, y]) =>
        (Math.abs(x - lo[0]) < 0.5 || Math.abs(x - hi[0]) < 0.5) &&
        (Math.abs(y - lo[1]) < 0.5 || Math.abs(y - hi[1]) < 0.5),
    )
  )
    return undefined;
  return outer.map(([x, y]) => [x - cx, -(y - cy)]);
};
