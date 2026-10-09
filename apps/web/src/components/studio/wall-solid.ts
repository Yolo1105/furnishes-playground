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

/** which material a face of the solid takes: the plaster on the inner
    and outer faces, the painted reveal inside an opening (its head,
    sill and jambs), and the cap where the solid is cut (its top, and
    its ends where the run stops) */
export const PLASTER = 0;
export const REVEAL = 1;
export const CAP = 2;

/** how a face is shaded by where it is on the wall: a colour for a
    point `x` along the wall and `y` up it, m, laid over the plaster
    as a vertex colour; and the lines along and up the face at which
    the face is divided so the shading can bend between them */
export type Shading = {
  grade: (x: number, y: number) => readonly [number, number, number];
  xs: readonly number[];
  ys: readonly number[];
  /** the outer face shaded too: a wall shared with the room beyond,
      whose inside it is */
  outer?: boolean;
};

/** the triangles of a wall's blocks as one geometry: each block a box
    from the inner face (z 0) to the outer (z t), its ends slanted where
    the wall's ends are mitred (the outer face longer at a convex corner
    by `mitreA`/`mitreB`, shorter at a concave one). The faces come
    grouped by material (`groups`, for the geometry's groups), with a
    vertex colour each (the shading on the plaster, white elsewhere),
    and the cap faces' edges as line segments (`capLines`), so a cut
    reads as a cut. `h` is the wall's full height: a top at it is the
    cap, a top below it an opening's head. */
export const wallTriangles = (
  blocks: readonly Block[],
  len: number,
  t: number,
  mitreA: number,
  mitreB: number,
  /** which way the outer face lies along z: -1 when +z is the inside */
  outward: 1 | -1 = 1,
  h = Infinity,
  shading?: Shading,
) => {
  type P = [number, number, number];
  const parts = [PLASTER, REVEAL, CAP].map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    colors: [] as number[],
  }));
  const capLines: number[] = [];
  const quad = (group: number, a: P, b: P, c: P, d: P, shaded = false) => {
    const out = parts[group]!;
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
    // a texture lies flat on the face: along the wall and up on its
    // faces, along and through on its top and sills, through and up on
    // its ends, metres
    const flat = Math.abs(nz) >= Math.max(Math.abs(nx), Math.abs(ny));
    const up = !flat && Math.abs(ny) >= Math.abs(nx);
    for (const p of [a, b, c, a, c, d]) {
      out.positions.push(...p);
      out.normals.push(nx, ny, nz);
      if (flat) out.uvs.push(p[0], p[1]);
      else if (up) out.uvs.push(p[0], p[2]);
      else out.uvs.push(p[2], p[1]);
      if (shaded && shading) out.colors.push(...shading.grade(p[0], p[1]));
      else out.colors.push(1, 1, 1);
    }
    if (group === CAP)
      for (const [p, q] of [
        [a, b],
        [b, c],
        [c, d],
        [d, a],
      ] as const)
        capLines.push(...p, ...q);
  };
  /** a face along the wall divided at the shading's lines, so its
      vertex colours bend where the shading does */
  const face = (
    group: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z: number,
    flipped: boolean,
    shaded: boolean,
  ) => {
    const within = (vs: readonly number[], lo: number, hi: number) => [
      lo,
      ...vs.filter((v) => v > lo && v < hi).sort((p, q) => p - q),
      hi,
    ];
    const xs = shaded && shading ? within(shading.xs, x0, x1) : [x0, x1];
    const ys = shaded && shading ? within(shading.ys, y0, y1) : [y0, y1];
    for (let i = 0; i + 1 < xs.length; i++)
      for (let j = 0; j + 1 < ys.length; j++) {
        const p0: P = [xs[i]!, ys[j]!, z];
        const p1: P = [xs[i + 1]!, ys[j]!, z];
        const p2: P = [xs[i + 1]!, ys[j + 1]!, z];
        const p3: P = [xs[i]!, ys[j + 1]!, z];
        if (flipped) quad(group, p0, p3, p2, p1, shaded);
        else quad(group, p0, p1, p2, p3, shaded);
      }
  };
  const oz = t * outward;
  for (const b of blocks) {
    // the outer face reaches past the inner at a wall's end by its mitre
    const ox0 = b.x0 === 0 ? b.x0 - mitreA : b.x0;
    const ox1 = b.x1 === len ? b.x1 + mitreB : b.x1;
    const i0: P = [b.x0, b.y0, 0];
    const i1: P = [b.x1, b.y0, 0];
    const i2: P = [b.x1, b.y1, 0];
    const i3: P = [b.x0, b.y1, 0];
    const o0: P = [ox0, b.y0, oz];
    const o1: P = [ox1, b.y0, oz];
    const o2: P = [ox1, b.y1, oz];
    const o3: P = [ox0, b.y1, oz];
    const top = b.y1 >= h;
    const atStart = b.x0 === 0;
    const atEnd = b.x1 === len;
    // the inner face, seen from inside (−z), shaded; the outer face
    // (+z) plain, or shaded too where it is another room's inside
    face(PLASTER, b.x0, b.x1, b.y0, b.y1, 0, true, true);
    if (ox0 === b.x0 && ox1 === b.x1)
      face(PLASTER, b.x0, b.x1, b.y0, b.y1, oz, false, shading?.outer === true);
    else quad(PLASTER, o0, o1, o2, o3);
    quad(top ? CAP : REVEAL, i3, o3, o2, i2); // the top, or a head
    quad(b.y0 === 0 ? CAP : REVEAL, i0, i1, o1, o0); // the bottom, or a sill
    quad(atStart ? CAP : REVEAL, i0, o0, o3, i3); // the start end
    quad(atEnd ? CAP : REVEAL, i1, i2, o2, o1); // the far end
  }
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  let at = 0;
  for (const [i, part] of parts.entries()) {
    const count = part.positions.length / 3;
    if (count > 0) groups.push({ start: at, count, materialIndex: i });
    at += count;
  }
  const join = (key: "positions" | "normals" | "uvs" | "colors") =>
    new Float32Array(parts.flatMap((p) => p[key]));
  return {
    positions: join("positions"),
    normals: join("normals"),
    uvs: join("uvs"),
    colors: join("colors"),
    groups,
    capLines: new Float32Array(capLines),
  };
};
