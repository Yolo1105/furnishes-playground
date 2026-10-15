/**
 * A wall built solid: its elevation less its openings as stretches,
 * each a box from the inner face to the outer, the ends square. Where
 * two walls meet at a corner one of them takes the corner's square
 * whole and the other stops square against it (`cornerEnd`), so no
 * end is slanted and no joint runs across a corner on the slant. The
 * outline's outer face is `outerOutline` in room-geometry.
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

/** which material a face of the solid takes: the inner face's (plaster,
    or a wet room's tiles), the painted reveal inside an opening (its
    head, sill and jambs), the cap where the solid is cut (its top, and
    its ends where the run stops), and the outer face's, apart from the
    inner's so a wall between a bathroom and a bedroom is tiled on the
    one side and plaster on the other */
export const PLASTER = 0;
export const REVEAL = 1;
export const CAP = 2;
export const OUTER = 3;

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

/** how a wall's end meets the corner there, if any: how far the whole
    end runs past the end of the inner face (`ext`, m: past it into
    the corner's square, or short of it by the wall beside), how far
    the top's inner and outer edges are drawn past it (`inner`,
    `outer`: a line where the solid's outline is, none where it joins
    the wall beside), whether the end's face is seen (its top edge
    drawn), and whether it is a corner's plaster rather than a cut */
export type WallEnd = {
  ext: number;
  inner: number;
  outer: number;
  seen: boolean;
  corner: boolean;
  /** the face looks into the room, shaded as the inner face is */
  inside: boolean;
};

/** a plain end: no corner, cut square where the run stops */
export const CUT_END: WallEnd = {
  ext: 0,
  inner: 0,
  outer: 0,
  seen: true,
  corner: false,
  inside: false,
};

/** an end at a corner, square. `mitre` is how far the outer face would
    run past the inner for a mitred joint (a thickness at a convex
    corner, minus one at a concave, 0 for no corner); the corner's
    `owner` takes the corner's square (at a convex corner it runs on
    through it, at a concave one it stops at the inner face's end with
    its end looking into the room) and the other wall stops square
    against it (at the inner corner, or a thickness short of it at a
    concave one). `open`: the wall beside is down, so this end's top
    is seen whole */
export const cornerEnd = (
  mitre: number,
  owner: boolean,
  open = false,
): WallEnd => {
  if (mitre === 0) return CUT_END;
  if (owner)
    return {
      ext: Math.max(0, mitre),
      inner: open ? Math.max(0, mitre) : 0,
      outer: mitre,
      seen: true,
      corner: true,
      inside: mitre < 0,
    };
  const short = Math.min(0, mitre);
  return {
    ext: short,
    inner: short,
    outer: short,
    seen: open,
    corner: true,
    inside: false,
  };
};

/** the triangles of a wall's blocks as one geometry: each block a box
    from the inner face (z 0) to the outer (z t, `OUTER_IN` less where it
    is no room's inside), its ends square and
    run on into a corner or stopped short of it by `ends` (cornerEnd).
    The faces come
    grouped by material (`groups`, for the geometry's groups), with a
    vertex colour each (the shading on the plaster, white elsewhere),
    and the cap faces' edges as line segments (`capLines`), so a cut
    reads as a cut. `h` is the wall's full height: a top at it is the
    cap, a top below it an opening's head. A wall split into runs (a
    stretch shared with another room beside one that is not) has a
    joint where one run meets the next (`joints`, at its start and its
    end): no cut, so the end face there is no cap and carries no line,
    which lay on the next run's face and flickered through it. */
/** how far a wall's outer face stands in from its full thickness where
    another room's wall face lies on it, m (z-fight.ts's `FIGHT` apart,
    and more) */
export const OUTER_IN = 0.002;

export const wallTriangles = (
  blocks: readonly Block[],
  len: number,
  t: number,
  ends: readonly [WallEnd, WallEnd],
  /** which way the outer face lies along z: -1 when +z is the inside */
  outward: 1 | -1 = 1,
  h = Infinity,
  shading?: Shading,
  joints: readonly [boolean, boolean] = [false, false],
) => {
  type P = [number, number, number];
  const parts = [PLASTER, REVEAL, CAP, OUTER].map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    colors: [] as number[],
  }));
  const capLines: number[] = [];
  /** a cap's outline: all four edges, or only those named by the
      index of their first corner (a wall's end draws its top edge
      alone: its upright edges lie on the face of the wall it meets, a
      corner's or a neighbour's, and flickered through it) */
  const quad = (
    group: number,
    a: P,
    b: P,
    c: P,
    d: P,
    shaded = false,
    outline: readonly number[] = [0, 1, 2, 3],
  ) => {
    const out = parts[group]!;
    // two triangles, the normal from the winding; a wall whose outside
    // lies along -z is mirrored, its winding turned to match
    // the outline follows the corners as given, before any mirroring
    const corners = [a, b, c, d];
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
    if (group === CAP) {
      for (const i of outline)
        capLines.push(...corners[i]!, ...corners[(i + 1) % 4]!);
    }
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
  // the outer face stands a hair into the wall where it is no room's
  // inside: there it lies on the face of the room beyond (its own wall,
  // drawn by that room), and the two fought for every pixel
  const oz = (shading?.outer === true ? t : t - OUTER_IN) * outward;
  const [endA, endB] = ends;
  const line = (x0: number, x1: number, y: number, z: number) => {
    if (x1 - x0 > 1e-6) capLines.push(x0, y, z, x1, y, z);
  };
  for (const b of blocks) {
    // a block at the wall's end runs on into the corner, or stops
    // short of it, square: both faces alike
    const startHere = b.x0 === 0 && !joints[0];
    const endHere = b.x1 === len && !joints[1];
    const x0 = startHere ? b.x0 - endA.ext : b.x0;
    const x1 = endHere ? b.x1 + endB.ext : b.x1;
    const i0: P = [x0, b.y0, 0];
    const i1: P = [x1, b.y0, 0];
    const i2: P = [x1, b.y1, 0];
    const i3: P = [x0, b.y1, 0];
    const o0: P = [x0, b.y0, oz];
    const o1: P = [x1, b.y0, oz];
    const o2: P = [x1, b.y1, oz];
    const o3: P = [x0, b.y1, oz];
    const top = b.y1 >= h;
    // the inner face, seen from inside (−z), shaded; the outer face
    // (+z) plain, or shaded too where it is another room's inside
    face(PLASTER, x0, x1, b.y0, b.y1, 0, true, true);
    face(OUTER, x0, x1, b.y0, b.y1, oz, false, shading?.outer === true);
    // the top, or a head: its lines along the wall alone, drawn where
    // they are the solid's outline and not where it joins the wall
    // beside at a corner
    quad(top ? CAP : REVEAL, i3, o3, o2, i2, false, []);
    if (top) {
      line(
        startHere ? b.x0 - endA.inner : b.x0,
        endHere ? b.x1 + endB.inner : b.x1,
        b.y1,
        0,
      );
      line(
        startHere ? b.x0 - endA.outer : b.x0,
        endHere ? b.x1 + endB.outer : b.x1,
        b.y1,
        oz,
      );
    }
    quad(b.y0 === 0 ? CAP : REVEAL, i0, i1, o1, o0); // the bottom, or a sill
    // an end: cut where the run stops, plaster at a corner, a reveal
    // where it meets the next run of its wall or an opening; its top
    // edge drawn where the end is seen
    const endFace = (here: boolean, e: WallEnd) =>
      here ? (e.corner ? PLASTER : CAP) : REVEAL;
    quad(
      endFace(startHere, endA),
      i0,
      o0,
      o3,
      i3,
      startHere && endA.inside,
      [],
    );
    quad(endFace(endHere, endB), i1, i2, o2, o1, endHere && endB.inside, []);
    if (top && startHere && endA.seen) capLines.push(...o3, ...i3);
    if (top && endHere && endB.seen) capLines.push(...i2, ...o2);
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
