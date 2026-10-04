import { footprint, type PieceProps } from "./piece-detail";

/**
 * Where the pieces stand: a piece placed by hand stands where it was put;
 * the rest stand in rows along the room, each after the last with a gap
 * between, a new row when the wall is reached. Everything in millimetres
 * of the room; the plan and the 3D view both read this, so a piece
 * stands in the same place in each.
 */
const MARGIN = 250;
const GAP = 200;

type Spot = { x: number; y: number };

export const layoutRoom = (
  items: readonly PieceProps[],
  W: number,
  D: number,
): Spot[] => {
  const spots: (Spot | null)[] = items.map((p) =>
    p.x !== undefined && p.y !== undefined ? { x: p.x, y: p.y } : null,
  );
  let x = MARGIN;
  let y = MARGIN;
  let rowDepth = 0;
  const rows: number[] = [];
  items.forEach((p, i) => {
    if (spots[i]) return;
    const f = footprint(p);
    if (x > MARGIN && x + f.w > W - MARGIN) {
      x = MARGIN;
      y += rowDepth + GAP;
      rowDepth = 0;
    }
    spots[i] = { x, y };
    rows.push(i);
    x += f.w + GAP;
    rowDepth = Math.max(rowDepth, f.d);
  });
  // a room too small for its rows still shows everything: the rows are
  // squeezed into the depth
  const used = y + rowDepth + MARGIN;
  if (used > D && rows.length) {
    const k = (D - 2 * MARGIN) / Math.max(1, used - 2 * MARGIN);
    for (const i of rows) {
      const s = spots[i]!;
      spots[i] = { x: s.x, y: MARGIN + (s.y - MARGIN) * k };
    }
  }
  return spots as Spot[];
};

/** `v` kept inside the room along one side, on the snap grid */
export const clampSnap = (
  v: number,
  size: number,
  side: number,
  snap: number,
) =>
  Math.round(Math.min(Math.max(0, v), Math.max(0, side - size)) / snap) * snap;
