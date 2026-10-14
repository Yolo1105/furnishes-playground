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

/** a flat, square-on piece of a surface as the room draws it: the part
    it belongs to and its finish, the axis it faces along and which way,
    where its plane lies on that axis, m, and its extent across the
    other two axes (the lower first) */
export type Face = {
  id: string;
  finish: string;
  /** its depth bias (a material's polygon offset), when it has one: two
      faces biased differently are always drawn in the same order */
  bias?: string;
  axis: 0 | 1 | 2;
  side: 1 | -1;
  at: number;
  rect: [number, number, number, number];
};

/** the overlap of two faces' extents, m² */
const overlapOf = (a: Face["rect"], b: Face["rect"]) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** an overlap smaller than this is two faces' edges touching, m² */
const TOUCH = 1e-6;
/** a face this near in front of two that fight, facing their way and
    over them, hides them (a room's own wall face on the outer faces of
    the rooms beside it), m */
export const COVER = 0.005;

/**
 * Every two parts whose faces fight among a room's surfaces: faces of
 * two finishes, facing the same way, within `FIGHT` of each other along
 * it, that overlap. One finish over itself shades the same either way
 * (two runs of skirting at a corner), two biased in depth differently
 * are drawn one over the other always, a face pressed against a third
 * part's face the other way round is hidden in it (a lining's back on
 * its reveal), and two behind a third part's face just in front of them
 * are hidden by it, so none of these counts. Each pair once, with where
 * it is.
 */
export const planeFightsOf = (faces: readonly Face[]) => {
  // by axis, side and plane, a millimetre to a bucket
  const key = (axis: number, side: number, at: number) =>
    `${axis}:${side}:${Math.round(at / FIGHT)}`;
  const buckets = new Map<string, Face[]>();
  for (const f of faces) {
    const k = key(f.axis, f.side, f.at);
    const list = buckets.get(k);
    if (list) list.push(f);
    else buckets.set(k, [f]);
  }
  const near = (axis: number, side: number, at: number) =>
    [-1, 0, 1].flatMap(
      (d) => buckets.get(key(axis, side, at + d * FIGHT)) ?? [],
    );
  const pressed = (f: Face, rect: Face["rect"], not: string[]) =>
    near(f.axis, -f.side, f.at).some(
      (g) =>
        !not.includes(g.id) &&
        Math.abs(g.at - f.at) < FIGHT &&
        overlapOf(g.rect, rect) > TOUCH,
    );
  const covered = (f: Face, rect: Face["rect"], not: string[]) => {
    const steps = Math.ceil(COVER / FIGHT);
    for (let d = 1; d <= steps; d++)
      for (const g of near(f.axis, f.side, f.at + f.side * d * FIGHT))
        if (
          !not.includes(g.id) &&
          (g.at - f.at) * f.side > 0 &&
          (g.at - f.at) * f.side <= COVER &&
          overlapOf(g.rect, rect) >= overlapOf(rect, rect) - TOUCH
        )
          return true;
    return false;
  };
  const out = new Map<
    string,
    { a: string; b: string; axis: 0 | 1 | 2; side: 1 | -1; at: number }
  >();
  for (const f of faces)
    for (const g of near(f.axis, f.side, f.at)) {
      if (g.id <= f.id || g.finish === f.finish) continue;
      if ((g.bias ?? "") !== (f.bias ?? "")) continue;
      if (Math.abs(g.at - f.at) >= FIGHT) continue;
      if (overlapOf(f.rect, g.rect) <= TOUCH) continue;
      const pair = `${f.id}|${g.id}`;
      if (out.has(pair)) continue;
      const both: Face["rect"] = [
        Math.max(f.rect[0], g.rect[0]),
        Math.max(f.rect[1], g.rect[1]),
        Math.min(f.rect[2], g.rect[2]),
        Math.min(f.rect[3], g.rect[3]),
      ];
      if (pressed(f, both, [f.id, g.id])) continue;
      if (covered(f, both, [f.id, g.id])) continue;
      out.set(pair, { a: f.id, b: g.id, axis: f.axis, side: f.side, at: f.at });
    }
  return [...out.values()];
};
