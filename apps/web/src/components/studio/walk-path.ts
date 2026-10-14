/**
 * The way a walker takes across the flat to a point: the floor laid out
 * as a grid of small cells, each free or not (inside a room or a
 * doorway, clear of the walls and the pieces, as `free` says), the
 * shortest way over the free cells found (A*, eight ways from a cell,
 * never across a corner that is not free on both sides), and the way
 * then pulled straight wherever a straight line is clear, so the walker
 * goes from corner to corner as a person does, not cell by cell.
 */

export type Spot = { x: number; z: number };
/** whether a point, m, is standing room */
export type Free = (x: number, z: number) => boolean;
/** the stretch of floor searched, m */
export type Bounds = { x0: number; z0: number; x1: number; z1: number };

/** a cell's side, m: fine enough for a doorway, coarse enough that a
    flat is a few tens of thousands of cells */
export const CELL = 0.1;
/** how far round a point that is not standing room (a click on a piece,
    or right by a wall) the nearest one that is is looked for, m */
const NEAR = 1.5;
/** the most cells the search opens before it gives up */
const MAX_OPEN = 200_000;

/** a straight line between two points is clear: sampled at a third of
    a cell */
export const clearLine = (a: Spot, b: Spot, free: Free, step = CELL / 3) => {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    if (!free(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false;
  }
  return true;
};

/** the path from one point to another, m, its first point where the
    walker stands and its last where it is going (or the nearest
    standing room to it); null when there is no way there */
export const findPath = (
  from: Spot,
  to: Spot,
  free: Free,
  bounds: Bounds,
  cell = CELL,
): Spot[] | null => {
  const cols = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / cell));
  const rows = Math.max(1, Math.ceil((bounds.z1 - bounds.z0) / cell));
  const centre = (c: number, r: number): Spot => ({
    x: bounds.x0 + (c + 0.5) * cell,
    z: bounds.z0 + (r + 0.5) * cell,
  });
  const known = new Int8Array(cols * rows); // 0 unread, 1 free, 2 not
  const isFree = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    const i = r * cols + c;
    if (!known[i]) {
      const p = centre(c, r);
      known[i] = free(p.x, p.z) ? 1 : 2;
    }
    return known[i] === 1;
  };
  const cellOf = (p: Spot) =>
    [
      Math.floor((p.x - bounds.x0) / cell),
      Math.floor((p.z - bounds.z0) / cell),
    ] as const;
  // the free cell nearest a point, in widening rings
  const nearest = (p: Spot) => {
    const [c0, r0] = cellOf(p);
    if (isFree(c0, r0)) return [c0, r0] as const;
    const reach = Math.ceil(NEAR / cell);
    let best: readonly [number, number] | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring <= reach && !best; ring++)
      for (let dc = -ring; dc <= ring; dc++)
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          if (!isFree(c0 + dc, r0 + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = [c0 + dc, r0 + dr];
          }
        }
    return best;
  };
  const start = nearest(from);
  const goal = nearest(to);
  if (!start || !goal) return null;
  const [sc, sr] = start;
  const [gc, gr] = goal;
  const index = (c: number, r: number) => r * cols + c;
  const g = new Float32Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  // the octile distance: the shortest way on the grid with no walls
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - gc);
    const dz = Math.abs(r - gr);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // a binary heap of cells by their estimate
  const heap: number[] = [];
  const f = new Float32Array(cols * rows);
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[heap[p]!]! <= f[heap[k]!]!) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && f[heap[l]!]! < f[heap[m]!]!) m = l;
        if (r < heap.length && f[heap[r]!]! < f[heap[m]!]!) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const s = index(sc, sr);
  g[s] = 0;
  f[s] = h(sc, sr);
  push(s);
  const goalI = index(gc, gr);
  let opened = 0;
  while (heap.length) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goalI) break;
    if (++opened > MAX_OPEN) return null;
    const c = i % cols;
    const r = (i - c) / cols;
    for (let dc = -1; dc <= 1; dc++)
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (!isFree(nc, nr)) continue;
        // a diagonal step only where both cells beside it are free: no
        // slipping between two corners
        if (dc && dr && (!isFree(c + dc, r) || !isFree(c, r + dr))) continue;
        const j = index(nc, nr);
        if (closed[j]) continue;
        const step = dc && dr ? Math.SQRT2 : 1;
        const ng = g[i]! + step;
        if (ng < g[j]!) {
          g[j] = ng;
          came[j] = i;
          f[j] = ng + h(nc, nr);
          push(j);
        }
      }
  }
  if (!closed[goalI]) return null;
  const cells: Spot[] = [];
  for (let i = goalI; i !== -1; i = came[i]!) {
    const c = i % cols;
    cells.push(centre(c, (i - c) / cols));
  }
  cells.reverse();
  // the ends where they were asked for, when they are standing room
  const first = free(from.x, from.z) ? from : cells[0]!;
  const last = free(to.x, to.z) ? to : cells[cells.length - 1]!;
  const raw = [first, ...cells.slice(1, -1), last];
  // pulled straight: from each corner, on to the farthest point a
  // straight line clears
  const free2: Free = (x, z) => {
    const [c, r] = cellOf({ x, z });
    return isFree(c, r);
  };
  const out: Spot[] = [raw[0]!];
  let at = 0;
  while (at < raw.length - 1) {
    let next = at + 1;
    for (let k = raw.length - 1; k > at + 1; k--)
      if (clearLine(raw[at]!, raw[k]!, free2)) {
        next = k;
        break;
      }
    out.push(raw[next]!);
    at = next;
  }
  return out;
};

/** a path's length, m */
export const pathLength = (pts: readonly Spot[]) => {
  let n = 0;
  for (let i = 1; i < pts.length; i++)
    n += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
  return n;
};

/** where along a path a walker is, `gone` metres from its start: the
    point and the heading of the leg it is on (yaw, as the camera's:
    0 looks towards −z) */
export const alongPath = (pts: readonly Spot[], gone: number) => {
  let left = Math.max(0, gone);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= len || i === pts.length - 1) {
      const k = len ? Math.min(1, left / len) : 1;
      return {
        x: a.x + (b.x - a.x) * k,
        z: a.z + (b.z - a.z) * k,
        yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)),
      };
    }
    left -= len;
  }
  const p = pts[pts.length - 1] ?? { x: 0, z: 0 };
  return { x: p.x, z: p.z, yaw: 0 };
};
