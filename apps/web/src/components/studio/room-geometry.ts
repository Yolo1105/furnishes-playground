import type { Point } from "./room-templates";
import type { Wall } from "./room-data";

/**
 * The room as its outline, not the box round it: a rectilinear polygon
 * in millimetres from its top-left corner. What stands inside it, which
 * walls it has, where an opening can sit on a side, and an outline read
 * from tapped squares.
 */
type Rect = { x: number; y: number; w: number; d: number };
export type Edge = { a: Point; b: Point; wall: Wall };

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
