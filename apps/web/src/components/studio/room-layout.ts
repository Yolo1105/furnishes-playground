import { footprint, isRug, isSmall, type PieceProps } from "./piece-detail";
import { WALKWAY } from "./room-health";

/**
 * Where the pieces stand: a piece placed by hand stands where it was
 * put; the rest are laid out. Pieces of any size go in rows along the
 * room, a walkway apart, a new row when the wall is reached; small
 * things (lamps, vases, plants) and rugs then take the first clear spot
 * on a coarse grid, since they are no obstacle to walking. Everything in
 * millimetres of the room; the plan and the 3D view both read this, so
 * a piece stands in the same place in each.
 */
const MARGIN = 250;
const GRID = 100;

export type Spot = { x: number; y: number };

type Rect = { x: number; y: number; w: number; d: number };
const meets = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

export const layoutRoom = (
  items: readonly (PieceProps & { name: string })[],
  W: number,
  D: number,
): Spot[] => {
  const spots: (Spot | null)[] = items.map((p) =>
    p.x !== undefined && p.y !== undefined ? { x: p.x, y: p.y } : null,
  );
  const taken: Rect[] = items.flatMap((p, i) =>
    spots[i] ? [{ ...spots[i]!, ...sizeOf(p) }] : [],
  );
  // the rows
  let x = MARGIN;
  let y = MARGIN;
  let rowDepth = 0;
  items.forEach((p, i) => {
    if (spots[i] || isSmall(p) || isRug(p)) return;
    const f = footprint(p);
    if (x > MARGIN && x + f.w > W - MARGIN) {
      x = MARGIN;
      y += rowDepth + WALKWAY;
      rowDepth = 0;
    }
    spots[i] = { x, y };
    taken.push({ x, y, w: f.w, d: f.d });
    x += f.w + WALKWAY;
    rowDepth = Math.max(rowDepth, f.d);
  });
  // the small things and the rugs: the first clear spot, reading the
  // room like a page
  items.forEach((p, i) => {
    if (spots[i]) return;
    const f = footprint(p);
    const gap = isRug(p) ? 0 : GRID;
    search: for (let gy = MARGIN; gy + f.d <= D - MARGIN; gy += GRID)
      for (let gx = MARGIN; gx + f.w <= W - MARGIN; gx += GRID) {
        const r = {
          x: gx - gap,
          y: gy - gap,
          w: f.w + 2 * gap,
          d: f.d + 2 * gap,
        };
        if (!taken.some((t) => meets(r, t))) {
          spots[i] = { x: gx, y: gy };
          taken.push({ x: gx, y: gy, w: f.w, d: f.d });
          break search;
        }
      }
    if (!spots[i]) {
      spots[i] = { x: MARGIN, y: MARGIN };
      taken.push({ x: MARGIN, y: MARGIN, w: f.w, d: f.d });
    }
  });
  return spots as Spot[];
};

const sizeOf = (p: PieceProps) => {
  const f = footprint(p);
  return { w: f.w, d: f.d };
};

/** within this of a wall a dragged piece goes flush to it, mm */
const MAGNET = 150;

/** `v` kept inside the room along one side, on the snap grid, and drawn
    flush to a wall when near it */
export const settle = (v: number, size: number, side: number, snap: number) => {
  const max = Math.max(0, side - size);
  const inside = Math.min(Math.max(0, v), max);
  if (inside < MAGNET) return 0;
  if (max - inside < MAGNET) return max;
  return Math.round(inside / snap) * snap;
};

/** the pieces that stand over another: both of each pair, by id */
export const clashesOf = (
  boxes: readonly { id: string; x: number; y: number; w: number; d: number }[],
) => {
  const out = new Set<string>();
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.d &&
        b.y < a.y + a.d
      ) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  return out;
};
