/**
 * Where the pieces stand until the real scene places them: in rows along
 * the room, each piece after the last with a gap between, a new row when
 * the wall is reached. Everything in millimetres of the room; the plan and
 * the 3D view both read this, so a piece stands in the same place in each.
 */
const MARGIN = 250;
const GAP = 200;

type Size = { width: number; depth: number };
export type Spot = { x: number; y: number };

export const layoutRoom = (items: readonly Size[], W: number, D: number) => {
  const spots: Spot[] = [];
  let x = MARGIN;
  let y = MARGIN;
  let rowDepth = 0;
  for (const it of items) {
    if (x > MARGIN && x + it.width > W - MARGIN) {
      x = MARGIN;
      y += rowDepth + GAP;
      rowDepth = 0;
    }
    spots.push({ x, y });
    x += it.width + GAP;
    rowDepth = Math.max(rowDepth, it.depth);
  }
  // a room too small for its rows still shows everything: the rows are
  // squeezed into the depth
  const used = y + rowDepth + MARGIN;
  if (used > D) {
    const k = (D - 2 * MARGIN) / Math.max(1, used - 2 * MARGIN);
    return spots.map((s) => ({ x: s.x, y: MARGIN + (s.y - MARGIN) * k }));
  }
  return spots;
};
