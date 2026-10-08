/**
 * A wall built solid: its elevation less its openings as stretches,
 * each a box from the inner face to the outer, the ends slanted where
 * the wall meets the next at a corner (the outer face longer at a
 * convex corner, shorter at a concave one). The outline's outer face
 * is `outerOutline` in room-geometry.
 */

/** a stretch of a wall's elevation, m: along the wall from its start
    (x), and up (y); the whole wall less its openings is a set of them */
export type Block = { x0: number; x1: number; y0: number; y1: number };

/** a wall's solid stretches between and around its openings: the full
    height where no opening is, the sill below a window and the head
    above any opening; openings past the ends are clipped */
export const blocksOf = (
  len: number,
  h: number,
  holes: readonly { x0: number; x1: number; y0: number; y1: number }[],
): Block[] => {
  const cuts = holes
    .map((o) => ({
      x0: Math.max(0, o.x0),
      x1: Math.min(len, o.x1),
      y0: Math.max(0, o.y0),
      y1: Math.min(h, o.y1),
    }))
    .filter((o) => o.x1 - o.x0 > 0 && o.y1 - o.y0 > 0)
    .sort((a, b) => a.x0 - b.x0);
  const out: Block[] = [];
  let x = 0;
  for (const o of cuts) {
    if (o.x0 > x) out.push({ x0: x, x1: o.x0, y0: 0, y1: h });
    if (o.y0 > 0) out.push({ x0: o.x0, x1: o.x1, y0: 0, y1: o.y0 });
    if (o.y1 < h) out.push({ x0: o.x0, x1: o.x1, y0: o.y1, y1: h });
    x = Math.max(x, o.x1);
  }
  if (x < len) out.push({ x0: x, x1: len, y0: 0, y1: h });
  return out;
};

/** the triangles of a wall's blocks as one geometry: each block a box
    from the inner face (z 0) to the outer (z t), its ends slanted where
    the wall's ends are mitred (the outer face longer at a convex corner
    by `mitreA`/`mitreB`, shorter at a concave one) */
export const wallTriangles = (
  blocks: readonly Block[],
  len: number,
  t: number,
  mitreA: number,
  mitreB: number,
  /** which way the outer face lies along z: -1 when +z is the inside */
  outward: 1 | -1 = 1,
) => {
  const positions: number[] = [];
  const normals: number[] = [];
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    // two triangles, the normal from the winding; a wall whose outside
    // lies along -z is mirrored, its winding turned to match
    if (outward < 0) [b, d] = [d, b];
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2];
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2];
    let nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    for (const p of [a, b, c, a, c, d]) {
      positions.push(...p);
      normals.push(nx, ny, nz);
    }
  };
  const oz = t * outward;
  for (const b of blocks) {
    // the outer face reaches past the inner at a wall's end by its mitre
    const ox0 = b.x0 === 0 ? b.x0 - mitreA : b.x0;
    const ox1 = b.x1 === len ? b.x1 + mitreB : b.x1;
    const i0: [number, number, number] = [b.x0, b.y0, 0];
    const i1: [number, number, number] = [b.x1, b.y0, 0];
    const i2: [number, number, number] = [b.x1, b.y1, 0];
    const i3: [number, number, number] = [b.x0, b.y1, 0];
    const o0: [number, number, number] = [ox0, b.y0, oz];
    const o1: [number, number, number] = [ox1, b.y0, oz];
    const o2: [number, number, number] = [ox1, b.y1, oz];
    const o3: [number, number, number] = [ox0, b.y1, oz];
    quad(i0, i3, i2, i1); // the inner face, seen from inside (−z)
    quad(o0, o1, o2, o3); // the outer face (+z)
    quad(i3, o3, o2, i2); // the top, or an opening's head seen from below
    quad(i0, i1, o1, o0); // the bottom, or a sill seen from above
    quad(i0, o0, o3, i3); // the start end
    quad(i1, i2, o2, o1); // the far end
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
  };
};
