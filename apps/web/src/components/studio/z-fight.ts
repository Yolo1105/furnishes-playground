/**
 * Two surfaces drawn in the same place fight: the depth test picks one
 * or the other pixel by pixel, differently each frame as the camera
 * moves, and the place shimmers in stripes. The test is geometric: two
 * faces of different parts that face the same way, lie within a
 * millimetre of each other along that way, and overlap. A face pressed
 * against another the other way round (a box standing on a shelf) is
 * hidden and does not count. Read over boxes, as the built forms are
 * made of (furnishes-forms.ts), not turned.
 */

/** a box: its middle and its full sizes, m */
export type Slab = {
  id: string;
  at: [number, number, number];
  dims: [number, number, number];
};

/** nearer than this along a face's normal, two faces fight, m */
export const FIGHT = 0.001;
/** an overlap smaller than this across, either way, is an edge touching,
    not a face, m */
const SLIVER = 0.0005;

export type Fight = {
  a: string;
  b: string;
  axis: 0 | 1 | 2;
  side: 1 | -1;
  at: number;
};

/** every pair of faces that fight among the slabs */
export const fightsOf = (slabs: readonly Slab[]): Fight[] => {
  const out: Fight[] = [];
  for (let i = 0; i < slabs.length; i++)
    for (let j = i + 1; j < slabs.length; j++) {
      const a = slabs[i]!;
      const b = slabs[j]!;
      for (const axis of [0, 1, 2] as const) {
        // the faces' overlap across the other two axes
        const across = ([0, 1, 2] as const)
          .filter((k) => k !== axis)
          .map(
            (k) =>
              Math.min(a.at[k] + a.dims[k] / 2, b.at[k] + b.dims[k] / 2) -
              Math.max(a.at[k] - a.dims[k] / 2, b.at[k] - b.dims[k] / 2),
          );
        if (across.some((o) => o <= SLIVER)) continue;
        for (const side of [1, -1] as const) {
          const fa = a.at[axis] + (side * a.dims[axis]) / 2;
          const fb = b.at[axis] + (side * b.dims[axis]) / 2;
          if (Math.abs(fa - fb) < FIGHT)
            out.push({ a: a.id, b: b.id, axis, side, at: fa });
        }
      }
    }
  return out;
};
