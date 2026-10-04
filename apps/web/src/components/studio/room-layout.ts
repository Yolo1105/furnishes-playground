import {
  footprint,
  isRug,
  isSmall,
  type PieceProps,
  type Turn,
} from "./piece-detail";
import { keepOff, meets, zonesOf, type Room, type Zone } from "./room-health";
import type { Rules, Wall } from "./room-data";

/**
 * Where the pieces stand. A piece placed by hand stands where it was
 * put; the rest are laid out: pieces of any size in rows along the
 * room, the asked gap apart, a new row when the wall is reached; small
 * things (lamps, vases, plants) and rugs then take the first clear spot
 * on a coarse grid, since they are no obstacle to walking.
 *
 * The room can also be laid out afresh three ways, for the plan's
 * Layouts: rows across the width, rows down the depth, and along the
 * walls (the middle left open, starting on the wall facing the door,
 * each piece turned to run along its wall). A locked piece keeps its
 * place in all three. Everything in millimetres of the room; the plan
 * and the 3D view both read this, so a piece stands in the same place
 * in each.
 */
const MARGIN = 250;
const GRID = 100;

type Spot = { x: number; y: number };
export type Placed = Spot & { rotation: Turn };
type Item = PieceProps & { name: string };
type Size = { w: number; d: number };
type Rect = Spot & Size;

/** how far apart a layout puts the pieces: the walkway, opened up */
export const gapOf = (rules: Rules) => rules.walkway + rules.spacing;

/** the rect with the gap round it, so neighbours stay a walkway apart
    (a piece exactly the gap away is fine) */
const grown = (r: Rect, gap: number): Rect => ({
  x: r.x - (gap - 1),
  y: r.y - (gap - 1),
  w: r.w + 2 * (gap - 1),
  d: r.d + 2 * (gap - 1),
});

/** the rows: pieces left to right, a new row below when the far wall is
    reached; `kept` spots stay, `skip` items are left for later */
const rows = (
  sizes: (Size | null)[],
  L: number,
  gap: number,
  taken: Rect[],
): (Spot | null)[] => {
  const out: (Spot | null)[] = sizes.map(() => null);
  let x = MARGIN;
  let y = MARGIN;
  let rowDepth = 0;
  const blocked = (r: Rect) => taken.some((t) => meets(grown(r, gap), t));
  sizes.forEach((f, i) => {
    if (!f) return;
    // along the row until the piece is clear of what already stands;
    // a new row when the wall is reached
    for (let tries = 0; ; tries++) {
      if (x > MARGIN && x + f.w > L - MARGIN) {
        x = MARGIN;
        y += rowDepth + gap;
        rowDepth = 0;
      }
      if (!blocked({ ...f, x, y }) || tries > 400) break;
      x += GRID;
    }
    out[i] = { x, y };
    taken.push({ ...f, x, y });
    x += f.w + gap;
    rowDepth = Math.max(rowDepth, f.d);
  });
  return out;
};

/** the first clear spot on the grid, reading the room like a page; a
    rug keeps no gap from its neighbours, the rest a grid step */
const loose = (
  f: Size,
  rug: boolean,
  W: number,
  D: number,
  taken: Rect[],
  avoid: Zone[],
): Spot => {
  const gap = rug ? 0 : GRID;
  for (let gy = MARGIN; gy + f.d <= D - MARGIN; gy += GRID)
    for (let gx = MARGIN; gx + f.w <= W - MARGIN; gx += GRID) {
      const r = {
        x: gx - gap,
        y: gy - gap,
        w: f.w + 2 * gap,
        d: f.d + 2 * gap,
      };
      if (!taken.some((t) => meets(r, t)) && !avoid.some((z) => meets(r, z)))
        return { x: gx, y: gy };
    }
  return { x: MARGIN, y: MARGIN };
};

const big = (p: Item) => !isSmall(p) && !isRug(p);

export const layoutRoom = (
  items: readonly Item[],
  W: number,
  D: number,
  gap: number,
): Spot[] => {
  const spots: (Spot | null)[] = items.map((p) =>
    p.x !== undefined && p.y !== undefined ? { x: p.x, y: p.y } : null,
  );
  const taken: Rect[] = items.flatMap((p, i) =>
    spots[i] ? [{ ...spots[i]!, ...footprint(p) }] : [],
  );
  const placed = rows(
    items.map((p, i) => (spots[i] || !big(p) ? null : footprint(p))),
    W,
    gap,
    taken,
  );
  items.forEach((p, i) => {
    if (placed[i]) spots[i] = placed[i];
  });
  items.forEach((p, i) => {
    if (spots[i]) return;
    const f = footprint(p);
    spots[i] = loose(f, isRug(p), W, D, taken, []);
    taken.push({ ...spots[i]!, ...f });
  });
  return spots as Spot[];
};

/* ---------- the three layouts ---------- */

type PlanId = "rows" | "across" | "walls";
type LayoutPlan = {
  id: PlanId;
  label: string;
  note: string;
  places: Placed[];
};

/** the turn that runs a piece's long side along x (or along y) */
const facing = (p: PieceProps, alongX: boolean): Turn =>
  p.width >= p.depth === alongX ? 0 : 90;

const swap = (s: Spot): Spot => ({ x: s.y, y: s.x });
const swapRect = (r: Rect): Rect => ({ x: r.y, y: r.x, w: r.d, d: r.w });

/** rows across the width, or (transposed) down the depth */
const rowsPlan = (
  items: readonly Item[],
  r: Room,
  kept: (Placed | null)[],
  across: boolean,
): Placed[] => {
  const gap = gapOf(r.rules);
  const zones = zonesOf(r);
  const turn = items.map((p, i) => kept[i]?.rotation ?? facing(p, !across));
  const size = items.map((p, i) => footprint({ ...p, rotation: turn[i]! }));
  const taken: Rect[] = items.flatMap((p, i) =>
    kept[i] ? [{ ...kept[i]!, ...size[i]! }] : [],
  );
  const frame = across ? taken.map(swapRect) : [...taken];
  const placed = rows(
    items.map((p, i) =>
      kept[i] || !big(p)
        ? null
        : across
          ? { w: size[i]!.d, d: size[i]!.w }
          : size[i]!,
    ),
    across ? r.D : r.W,
    gap,
    frame,
  ).map((s) => (s && across ? swap(s) : s));
  placed.forEach((s, i) => s && taken.push({ ...s, ...size[i]! }));
  return items.map((p, i) => {
    if (kept[i]) return kept[i]!;
    const s =
      placed[i] ??
      loose(
        size[i]!,
        isRug(p),
        r.W,
        r.D,
        taken,
        keepOff({ h: p.height }, r, zones),
      );
    if (!placed[i]) taken.push({ ...s, ...size[i]! });
    return { ...s, rotation: turn[i]! };
  });
};

const CLOCKWISE: Wall[] = ["north", "east", "south", "west"];
const OPPOSITE: Record<Wall, Wall> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** along the walls: the big pieces flush to the walls, starting on the
    wall facing the door and going round clockwise, each turned to run
    along its wall; the rug in the middle, small things where clear */
const wallsPlan = (
  items: readonly Item[],
  r: Room,
  kept: (Placed | null)[],
): Placed[] => {
  const gap = gapOf(r.rules);
  const zones = zonesOf(r);
  const first = CLOCKWISE.indexOf(OPPOSITE[r.door]);
  const walls = CLOCKWISE.map((_, k) => CLOCKWISE[(first + k) % 4]!);
  const out: (Placed | null)[] = [...kept];
  const taken: Rect[] = items.flatMap((p, i) =>
    kept[i] ? [{ ...kept[i]!, ...footprint({ ...p, ...kept[i]! }) }] : [],
  );
  // the cursor along each wall, from its near end
  const along: Record<Wall, number> = { north: 0, east: 0, south: 0, west: 0 };
  const clear = (rect: Rect, avoid: Zone[]) =>
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= r.W &&
    rect.y + rect.d <= r.D &&
    !taken.some((t) => meets(grown(rect, gap), t)) &&
    !avoid.some((z) => meets(rect, z));
  const order = items
    .map((p, i) => i)
    .filter((i) => !kept[i] && big(items[i]!))
    .sort((a, b) => {
      const fa = footprint(items[a]!);
      const fb = footprint(items[b]!);
      return fb.w * fb.d - fa.w * fa.d;
    });
  for (const i of order) {
    const p = items[i]!;
    const avoid = keepOff({ h: p.height }, r, zones);
    let found: Placed | null = null;
    for (const wall of walls) {
      const horizontal = wall === "north" || wall === "south";
      const rotation = facing(p, horizontal);
      const f = footprint({ ...p, rotation });
      const len = horizontal ? r.W : r.D;
      const span = horizontal ? f.w : f.d;
      for (let c = along[wall]; c + span <= len; c += GRID) {
        const rect: Rect =
          wall === "north"
            ? { x: c, y: 0, ...f }
            : wall === "south"
              ? { x: c, y: r.D - f.d, ...f }
              : wall === "west"
                ? { x: 0, y: c, ...f }
                : { x: r.W - f.w, y: c, ...f };
        if (clear(rect, avoid)) {
          found = { x: rect.x, y: rect.y, rotation };
          taken.push(rect);
          along[wall] = c + span + gap;
          break;
        }
      }
      if (found) break;
    }
    out[i] = found;
  }
  return items.map((p, i) => {
    if (out[i]) return out[i]!;
    const rotation = kept[i]?.rotation ?? p.rotation;
    const f = footprint({ ...p, rotation });
    const s = isRug(p)
      ? {
          x: Math.round((r.W - f.w) / 2 / 50) * 50,
          y: Math.round((r.D - f.d) / 2 / 50) * 50,
        }
      : loose(f, false, r.W, r.D, taken, keepOff({ h: p.height }, r, zones));
    taken.push({ ...s, ...f });
    return { ...s, rotation };
  });
};

/** the three layouts of the room's pieces; a locked piece stays put */
export const layoutPlans = (
  items: readonly Item[],
  r: Room,
  now: readonly Spot[],
): LayoutPlan[] => {
  const kept = items.map((p, i) =>
    p.locked ? { ...now[i]!, rotation: p.rotation } : null,
  );
  return [
    {
      id: "rows",
      label: "Rows",
      note: `Across the width, ${gapOf(r.rules)} mm apart`,
      places: rowsPlan(items, r, kept, false),
    },
    {
      id: "across",
      label: "Across",
      note: `Down the depth, ${gapOf(r.rules)} mm apart`,
      places: rowsPlan(items, r, kept, true),
    },
    {
      id: "walls",
      label: "Along the walls",
      note: `The middle open, facing the ${r.door} door`,
      places: wallsPlan(items, r, kept),
    },
  ];
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
