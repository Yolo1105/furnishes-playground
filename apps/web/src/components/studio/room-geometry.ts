import { boundsOf, type Point } from "./room-templates";
import type { Wall } from "./room-data";

/**
 * The room as its outline, not the box round it: a rectilinear polygon
 * in millimetres from its top-left corner. What stands inside it, which
 * walls it has, where an opening can sit on a side, and an outline read
 * from tapped squares.
 */
type Rect = { x: number; y: number; w: number; d: number };
export type Edge = { a: Point; b: Point; wall: Wall };

/** the walls' thickness a room starts with, mm (an HDB's party wall);
    each room keeps its own, drawn as the band outside the outline on
    the plan and built solid in 3D, the far face a piece outside the
    room leans on */
export const WALL_MM = 300;
/** what a wall's thickness may be set to, mm: a partition to a party
    wall */
export const WALL_RANGE = { min: 100, max: 400, step: 50 } as const;

/** the outline's outer face, a thickness outside it: at each corner the
    two offset edges meet at the vertex moved along the bisector of the
    outward normals, by t / (1 + n1·n2) of their sum (t at a square
    corner, further at a sharp one) */
export const outerOutline = (poly: readonly Point[], t: number): Point[] => {
  const n = poly.length;
  if (n < 3) return poly.map((p) => [...p] as Point);
  // the inside is to the left of each edge when the polygon runs
  // counter-clockwise on the plan (y down), to the right when clockwise
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % n]!;
    area += x1 * y2 - x2 * y1;
  }
  const cw = area > 0;
  const outward = (i: number): [number, number] => {
    const [ax, ay] = poly[i]!;
    const [bx, by] = poly[(i + 1) % n]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    // the inward normal is the edge turned a quarter towards the inside
    return cw ? [dy, -dx] : [-dy, dx];
  };
  return poly.map((p, i) => {
    const [n1x, n1y] = outward((i - 1 + n) % n);
    const [n2x, n2y] = outward(i);
    const dot = n1x * n2x + n1y * n2y;
    // the two offset lines meet along the sum of the normals; edges that
    // fold back on themselves (dot near -1) are capped at the thickness
    const k = t / Math.max(1 + dot, 0.25);
    return [p[0] + (n1x + n2x) * k, p[1] + (n1y + n2y) * k] as Point;
  });
};

/** whether a point lies in the polygon (on an edge counts as in) */
export const insideOutline = (x: number, y: number, poly: readonly Point[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    // on a horizontal or vertical edge
    if (
      (xi === xj &&
        x === xi &&
        y >= Math.min(yi, yj) &&
        y <= Math.max(yi, yj)) ||
      (yi === yj && y === yi && x >= Math.min(xi, xj) && x <= Math.max(xi, xj))
    )
      return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
};

/** whether a rectangle lies wholly in the polygon: its corners are in
    and no corner of the polygon pokes into it */
export const rectInside = (r: Rect, poly: readonly Point[], slack = 1) => {
  const x0 = r.x + slack;
  const y0 = r.y + slack;
  const x1 = r.x + r.w - slack;
  const y1 = r.y + r.d - slack;
  if (x1 < x0 || y1 < y0) return true;
  const cornersIn = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].every(([x, y]) => insideOutline(x!, y!, poly));
  if (!cornersIn) return false;
  return !poly.some(([px, py]) => px > x0 && px < x1 && py > y0 && py < y1);
};

/** the polygon's edges, each named by the side it faces */
export const edgesOf = (poly: readonly Point[]): Edge[] => {
  // the inside is to the left of each edge when the polygon runs
  // counter-clockwise on the plan (y down), to the right when clockwise
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    area += x1 * y2 - x2 * y1;
  }
  const cw = area > 0;
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const dx = Math.sign(b[0] - a[0]);
    const dy = Math.sign(b[1] - a[1]);
    // the inward normal: the edge turned a quarter towards the inside
    const nx = cw ? -dy : dy;
    const ny = cw ? dx : -dx;
    const wall: Wall =
      ny > 0 ? "north" : ny < 0 ? "south" : nx > 0 ? "west" : "east";
    return { a, b, wall };
  });
};

/** the span of the longest edge on a side, along that side (x for north
    and south, y for east and west), and where it stands across */
export const sideSpan = (poly: readonly Point[], wall: Wall) => {
  const horizontal = wall === "north" || wall === "south";
  const spans = edgesOf(poly)
    .filter((e) => e.wall === wall)
    .map((e) => {
      const [p, q] = horizontal ? [e.a[0], e.b[0]] : [e.a[1], e.b[1]];
      return {
        from: Math.min(p, q),
        to: Math.max(p, q),
        at: horizontal ? e.a[1] : e.a[0],
      };
    })
    .sort((s, t) => t.to - t.from - (s.to - s.from));
  return spans[0] ?? null;
};

/** the shortest distance from a rectangle's sides to the walls */
export const gapToWalls = (r: Rect, poly: readonly Point[]) => {
  let best = Infinity;
  for (const e of edgesOf(poly)) {
    const horizontal = e.a[1] === e.b[1];
    if (horizontal) {
      const [f, t] = [Math.min(e.a[0], e.b[0]), Math.max(e.a[0], e.b[0])];
      if (r.x < t && f < r.x + r.w)
        best = Math.min(
          best,
          Math.abs(r.y - e.a[1]),
          Math.abs(r.y + r.d - e.a[1]),
        );
    } else {
      const [f, t] = [Math.min(e.a[1], e.b[1]), Math.max(e.a[1], e.b[1])];
      if (r.y < t && f < r.y + r.d)
        best = Math.min(
          best,
          Math.abs(r.x - e.a[0]),
          Math.abs(r.x + r.w - e.a[0]),
        );
    }
  }
  return best;
};

/** the outline round a set of tapped squares ("x,y" keys, one unit
    each), traced along the squares' free sides; empty when the squares
    do not hold together */
export const outlineFromCells = (cells: ReadonlySet<string>): Point[] => {
  if (cells.size === 0) return [];
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  // the free sides, as directed edges with the inside on their left
  const edges = new Map<string, Point>();
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (!has(x, y - 1)) edges.set(`${x},${y}`, [x + 1, y]);
    if (!has(x + 1, y)) edges.set(`${x + 1},${y}`, [x + 1, y + 1]);
    if (!has(x, y + 1)) edges.set(`${x + 1},${y + 1}`, [x, y + 1]);
    if (!has(x - 1, y)) edges.set(`${x},${y + 1}`, [x, y]);
  }
  // one loop from the first edge; a second loop would mean a hole or a
  // part that does not touch, which is not a room
  const start = edges.keys().next().value!;
  const out: Point[] = [];
  let at = start;
  let guard = edges.size + 1;
  do {
    const [x, y] = at.split(",").map(Number) as [number, number];
    out.push([x, y]);
    const next = edges.get(at);
    if (!next) return [];
    edges.delete(at);
    at = `${next[0]},${next[1]}`;
  } while (at !== start && guard-- > 0);
  if (edges.size > 0) return [];
  // straight runs become one edge
  return out.filter((p, i) => {
    const prev = out[(i + out.length - 1) % out.length]!;
    const next = out[(i + 1) % out.length]!;
    return !(
      (prev[0] === p[0] && p[0] === next[0]) ||
      (prev[1] === p[1] && p[1] === next[1])
    );
  });
};

/* ---------- editing the outline ---------- */

/** edge i: its ends, its direction as a unit vector, its inward normal
    and its length */
export const edgeFrame = (poly: readonly Point[], i: number) => {
  let area = 0;
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k]!;
    const [x2, y2] = poly[(k + 1) % poly.length]!;
    area += x1 * y2 - x2 * y1;
  }
  const cw = area > 0;
  const a = poly[i]!;
  const b = poly[(i + 1) % poly.length]!;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  return { a, b, ux, uy, nx: cw ? -uy : uy, ny: cw ? ux : -ux, len };
};

const collinear = (p: Point, q: Point, r: Point) =>
  Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) <
  1e-6;

/** edge i moved along its inward normal by d (outward when d < 0); the
    edges either side stretch to follow, and a neighbour that ran
    straight on from it gets a step instead, so the moved edge stays
    square to the room */
export const pushEdge = (
  poly: readonly Point[],
  i: number,
  d: number,
): Point[] => {
  const n = poly.length;
  const f = edgeFrame(poly, i);
  const prev = poly[(i + n - 1) % n]!;
  const next = poly[(i + 2) % n]!;
  const a2: Point = [f.a[0] + f.nx * d, f.a[1] + f.ny * d];
  const b2: Point = [f.b[0] + f.nx * d, f.b[1] + f.ny * d];
  const out: Point[] = [];
  for (let k = 0; k < n; k++) {
    if (k === i) {
      if (d !== 0 && collinear(prev, f.a, f.b)) out.push(f.a);
      out.push(a2);
    } else if (k === (i + 1) % n) {
      out.push(b2);
      if (d !== 0 && collinear(f.a, f.b, next)) out.push(f.b);
    } else out.push(poly[k]!);
  }
  return out;
};

/** corner i moved to p; a neighbour that shared the corner's x or y
    keeps sharing it, so the walls between stay straight */
export const moveCorner = (
  poly: readonly Point[],
  i: number,
  p: Point,
): Point[] => {
  const n = poly.length;
  const was = poly[i]!;
  return poly.map((q, k) => {
    if (k === i) return p;
    if (k !== (i + n - 1) % n && k !== (i + 1) % n) return q;
    return [q[0] === was[0] ? p[0] : q[0], q[1] === was[1] ? p[1] : q[1]];
  });
};

/** a corner put into edge i where p falls along it, so each half can
    be moved on its own */
export const splitEdge = (
  poly: readonly Point[],
  i: number,
  p: Point,
): Point[] => {
  const f = edgeFrame(poly, i);
  const t = Math.min(
    f.len,
    Math.max(0, (p[0] - f.a[0]) * f.ux + (p[1] - f.a[1]) * f.uy),
  );
  const at: Point = [
    Math.round(f.a[0] + f.ux * t),
    Math.round(f.a[1] + f.uy * t),
  ];
  return [...poly.slice(0, i + 1), at, ...poly.slice(i + 1)];
};

const segmentsCross = (p: Point, q: Point, r: Point, s: Point) => {
  const o = (a: Point, b: Point, c: Point) =>
    Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return (
    o(p, q, r) !== o(p, q, s) &&
    o(r, s, p) !== o(r, s, q) &&
    o(p, q, r) !== 0 &&
    o(r, s, p) !== 0
  );
};

/** whether the outline still makes a room: three corners or more, no
    wall of no length, no wall crossing another */
export const isSimple = (poly: readonly Point[]) => {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if (a[0] === b[0] && a[1] === b[1]) return false;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, poly[j]!, poly[(j + 1) % n]!)) return false;
    }
  }
  return true;
};

/** two facing wall edges read in one frame: whether the wall runs
    along x, where an edge stands across the wall, which way is outward
    from the first room (the other room lies beyond its wall: south of
    a south wall, and so on), the gap between them measured that way,
    and each edge's span along the wall */
const wallFrame = (ea: Edge, eb: Edge) => {
  const horizontal = ea.wall === "north" || ea.wall === "south";
  const across = (e: Edge) => (horizontal ? e.a[1] : e.a[0]);
  const outward = ea.wall === "south" || ea.wall === "east" ? 1 : -1;
  const span = (e: Edge): [number, number] =>
    horizontal
      ? [Math.min(e.a[0], e.b[0]), Math.max(e.a[0], e.b[0])]
      : [Math.min(e.a[1], e.b[1]), Math.max(e.a[1], e.b[1])];
  return {
    horizontal,
    across,
    outward,
    gap: (across(eb) - across(ea)) * outward,
    span,
  };
};

/** the box round some points, mm */
export const boxOf = (pts: readonly Point[]) => {
  const b = boundsOf(pts);
  return { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
};

/** the outline from its top-left corner, and how far it moved to get
    there (what stood in the old frame shifts by the same amount) */
export const normalizeOutline = (poly: readonly Point[]) => {
  const b = boxOf(poly);
  const dx = -b.x;
  const dy = -b.y;
  return {
    points: poly.map(([x, y]): Point => [x + dx, y + dy]),
    dx,
    dy,
  };
};

/* ---------- rooms beside each other ---------- */

/** a stretch where an edge of one room runs along an edge of another,
    the two outlines a wall's thickness apart: the wall between them.
    `from` and `to` run along the sheet's axis the wall lies on, `at` is
    where the first room's outline crosses the other axis */
type SharedRun = {
  wallA: Wall;
  wallB: Wall;
  horizontal: boolean;
  from: number;
  to: number;
  at: number;
};

/** the wall that faces each wall across a room */
export const FACING: Record<Wall, Wall> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** the walls room A (outline `a`, on the sheet) shares with room B:
    facing edges, parallel, the gap between the outlines within `slack`
    of the wall's thickness `t`, running alongside each other */
export const sharedRuns = (
  a: readonly Point[],
  b: readonly Point[],
  t: number,
  slack = 1,
): SharedRun[] => {
  const out: SharedRun[] = [];
  for (const ea of edgesOf(a))
    for (const eb of edgesOf(b)) {
      if (eb.wall !== FACING[ea.wall]) continue;
      const { gap, span, horizontal, across } = wallFrame(ea, eb);
      if (Math.abs(gap - t) > slack) continue;
      const [a0, a1] = span(ea);
      const [b0, b1] = span(eb);
      const from = Math.max(a0!, b0!);
      const to = Math.min(a1!, b1!);
      if (to - from <= 0) continue;
      out.push({
        wallA: ea.wall,
        wallB: eb.wall,
        horizontal,
        from,
        to,
        at: across(ea),
      });
    }
  return out;
};

/** how far a room moved on the plan is drawn to a neighbour: within
    this of a wall's thickness from a facing wall, or of lining up its
    end with the neighbour's, mm */
const ROOM_REACH = 400;

/** the shift that stands a moving room against its neighbours: its
    facing walls a wall's thickness from theirs, and their ends in line,
    when they come within reach */
export const magnetRoom = (
  moving: readonly Point[],
  others: readonly (readonly Point[])[],
  /** the moving room's walls' thickness, mm */
  t: number,
): { dx: number; dy: number } => {
  let dx: number | null = null;
  let dy: number | null = null;
  const nearer = (cur: number | null, v: number) =>
    cur === null || Math.abs(v) < Math.abs(cur) ? v : cur;
  for (const other of others)
    for (const ea of edgesOf(moving))
      for (const eb of edgesOf(other)) {
        if (eb.wall !== FACING[ea.wall]) continue;
        const { gap, span, outward, horizontal } = wallFrame(ea, eb);
        // within reach of a wall apart, or pushed a little into the
        // neighbour: either way it stands off by a wall
        if (gap > t + ROOM_REACH || gap < -ROOM_REACH) continue;
        const [a0, a1] = span(ea);
        const [b0, b1] = span(eb);
        // alongside, or nearly: the runs overlap or come within reach
        if (a1 < b0 - ROOM_REACH || a0 > b1 + ROOM_REACH) continue;
        const shift = (gap - t) * outward;
        if (horizontal) dy = nearer(dy, shift);
        else dx = nearer(dx, shift);
        // the nearer pair of ends lines up too
        const ends = [b0 - a0, b1 - a1, b0 - a1, b1 - a0].filter(
          (v) => Math.abs(v) <= ROOM_REACH,
        );
        if (ends.length) {
          const along = ends.reduce((p, q) =>
            Math.abs(q) < Math.abs(p) ? q : p,
          );
          if (horizontal) dx = nearer(dx, along);
          else dy = nearer(dy, along);
        }
      }
  return { dx: dx ?? 0, dy: dy ?? 0 };
};

/** two rooms standing over each other: their outlines' boxes cross by
    more than `slack`, mm (two rooms wall to wall never touch: their
    inner outlines stand a wall's thickness apart) */
export const roomsOverlap = (
  a: readonly Point[],
  b: readonly Point[],
  slack = 1,
) => {
  const p = boxOf(a);
  const q = boxOf(b);
  return (
    p.x + p.w > q.x + slack &&
    q.x + q.w > p.x + slack &&
    p.y + p.h > q.y + slack &&
    q.y + q.h > p.y + slack
  );
};

/** the four shifts that stand a room over a neighbour clear of it, a
    wall's thickness `t` from the neighbour's wall: out of the way east,
    west, south or north, the nearest first; none when the two do not
    overlap */
export const settleWays = (
  moving: readonly Point[],
  other: readonly Point[],
  t: number,
): { dx: number; dy: number }[] => {
  if (!roomsOverlap(moving, other)) return [];
  const p = boxOf(moving);
  const q = boxOf(other);
  return [
    { dx: q.x + q.w + t - p.x, dy: 0 },
    { dx: q.x - t - (p.x + p.w), dy: 0 },
    { dx: 0, dy: q.y + q.h + t - p.y },
    { dx: 0, dy: q.y - t - (p.y + p.h) },
  ].sort(
    (a, b) => Math.abs(a.dx) + Math.abs(a.dy) - Math.abs(b.dx) - Math.abs(b.dy),
  );
};

/** the nearest of those ways; none when the two do not overlap */
export const settleRoom = (
  moving: readonly Point[],
  other: readonly Point[],
  t: number,
): { dx: number; dy: number } | null => settleWays(moving, other, t)[0] ?? null;

/** a room resized: its east and south walls, the ones that move, drawn
    to a neighbour's facing wall when they come within reach, so a
    width or depth typed near the neighbour lands wall to wall rather
    than a little short or into it; the change to the size */
export const magnetSize = (
  resized: readonly Point[],
  others: readonly (readonly Point[])[],
  t: number,
): { dw: number; dd: number } => {
  let dw: number | null = null;
  let dd: number | null = null;
  const nearer = (cur: number | null, v: number) =>
    cur === null || Math.abs(v) < Math.abs(cur) ? v : cur;
  for (const other of others)
    for (const ea of edgesOf(resized)) {
      if (ea.wall !== "east" && ea.wall !== "south") continue;
      for (const eb of edgesOf(other)) {
        if (eb.wall !== FACING[ea.wall]) continue;
        const { gap, span, outward, horizontal } = wallFrame(ea, eb);
        if (gap > t + ROOM_REACH || gap < -ROOM_REACH) continue;
        const [a0, a1] = span(ea);
        const [b0, b1] = span(eb);
        if (a1 < b0 - ROOM_REACH || a0 > b1 + ROOM_REACH) continue;
        const shift = (gap - t) * outward;
        if (horizontal) dd = nearer(dd, shift);
        else dw = nearer(dw, shift);
      }
    }
  return { dw: dw ?? 0, dd: dd ?? 0 };
};
