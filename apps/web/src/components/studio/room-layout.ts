import {
  footprint,
  isRug,
  isSmall,
  PLACE_SNAP,
  type PieceProps,
} from "./piece-detail";
import { edgesOf, rectInside, WALL_MM } from "./room-geometry";
import { keepOff, meets, zonesOf, type Room, type Zone } from "./room-health";
import type { Rules } from "./room-data";

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
export type Placed = Spot & { rotation: number };
type Item = PieceProps & { name: string };
type Size = { w: number; d: number };
export type Rect = Spot & Size;

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
  /** the room's outline in this frame; nothing is laid outside it */
  within: (r: Rect) => boolean,
): (Spot | null)[] => {
  const out: (Spot | null)[] = sizes.map(() => null);
  let x = MARGIN;
  let y = MARGIN;
  let rowDepth = 0;
  const blocked = (r: Rect) =>
    !within(r) || taken.some((t) => meets(grown(r, gap), t));
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
  room: Pick<Room, "W" | "D" | "outline">,
  taken: Rect[],
  avoid: Zone[],
): Spot => {
  const gap = rug ? 0 : GRID;
  for (let gy = MARGIN; gy + f.d <= room.D - MARGIN; gy += GRID)
    for (let gx = MARGIN; gx + f.w <= room.W - MARGIN; gx += GRID) {
      const r = {
        x: gx - gap,
        y: gy - gap,
        w: f.w + 2 * gap,
        d: f.d + 2 * gap,
      };
      if (
        rectInside({ x: gx, y: gy, ...f }, room.outline) &&
        !taken.some((t) => meets(r, t)) &&
        !avoid.some((z) => meets(r, z))
      )
        return { x: gx, y: gy };
    }
  return { x: MARGIN, y: MARGIN };
};

const big = (p: Item) => !isSmall(p) && !isRug(p);

export const layoutRoom = (
  items: readonly Item[],
  room: Pick<Room, "W" | "D" | "outline">,
  gap: number,
): Spot[] => {
  const { W, outline } = room;
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
    (r) => rectInside(r, outline),
  );
  items.forEach((p, i) => {
    if (placed[i]) spots[i] = placed[i];
  });
  items.forEach((p, i) => {
    if (spots[i]) return;
    const f = footprint(p);
    spots[i] = loose(f, isRug(p), room, taken, []);
    taken.push({ ...spots[i]!, ...f });
  });
  return spots as Spot[];
};

/* ---------- the three layouts ---------- */

export type PlanId = "rows" | "across" | "walls";
type LayoutPlan = {
  id: PlanId;
  label: string;
  note: string;
  places: Placed[];
};

/** the turn that runs a piece's long side along x (or along y) */
const facing = (p: PieceProps, alongX: boolean): number =>
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
    (rect) => rectInside(across ? swapRect(rect) : rect, r.outline),
  ).map((s) => (s && across ? swap(s) : s));
  placed.forEach((s, i) => s && taken.push({ ...s, ...size[i]! }));
  return items.map((p, i) => {
    if (kept[i]) return kept[i]!;
    const s =
      placed[i] ??
      loose(size[i]!, isRug(p), r, taken, keepOff({ h: p.height }, r, zones));
    if (!placed[i]) taken.push({ ...s, ...size[i]! });
    return { ...s, rotation: turn[i]! };
  });
};

/** along the walls: the big pieces flush to the room's own walls, from
    the wall facing the door and on round the outline, each turned to run
    along its wall; the rug in the middle, small things where clear */
const wallsPlan = (
  items: readonly Item[],
  r: Room,
  kept: (Placed | null)[],
): Placed[] => {
  const gap = gapOf(r.rules);
  const zones = zonesOf(r);
  const door = zones.door;
  const dc = { x: door.x + door.w / 2, y: door.y + door.d / 2 };
  // the edges, starting from the one farthest from the door, then on
  // round the outline
  const all = edgesOf(r.outline);
  const far = all.reduce(
    (best, e, k) => {
      const mx = (e.a[0] + e.b[0]) / 2;
      const my = (e.a[1] + e.b[1]) / 2;
      const dist = Math.hypot(mx - dc.x, my - dc.y);
      return dist > best.dist ? { k, dist } : best;
    },
    { k: 0, dist: -1 },
  ).k;
  const walls = all.map((_, k) => all[(far + k) % all.length]!);
  const out: (Placed | null)[] = [...kept];
  const taken: Rect[] = items.flatMap((p, i) =>
    kept[i] ? [{ ...kept[i]!, ...footprint({ ...p, ...kept[i]! }) }] : [],
  );
  const along = new Map<number, number>();
  const clear = (rect: Rect, avoid: Zone[]) =>
    rectInside(rect, r.outline) &&
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
    for (const [k, e] of walls.entries()) {
      const horizontal = e.wall === "north" || e.wall === "south";
      const rotation = facing(p, horizontal);
      const f = footprint({ ...p, rotation });
      const from = horizontal
        ? Math.min(e.a[0], e.b[0])
        : Math.min(e.a[1], e.b[1]);
      const to = horizontal
        ? Math.max(e.a[0], e.b[0])
        : Math.max(e.a[1], e.b[1]);
      const span = horizontal ? f.w : f.d;
      for (let c = from + (along.get(k) ?? 0); c + span <= to; c += GRID) {
        const rect: Rect =
          e.wall === "north"
            ? { x: c, y: e.a[1], ...f }
            : e.wall === "south"
              ? { x: c, y: e.a[1] - f.d, ...f }
              : e.wall === "west"
                ? { x: e.a[0], y: c, ...f }
                : { x: e.a[0] - f.w, y: c, ...f };
        if (clear(rect, avoid)) {
          found = { x: rect.x, y: rect.y, rotation };
          taken.push(rect);
          along.set(k, c - from + span + gap);
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
    const middle = {
      x: Math.round((r.W - f.w) / 2 / 50) * 50,
      y: Math.round((r.D - f.d) / 2 / 50) * 50,
    };
    const s =
      isRug(p) && rectInside({ ...middle, ...f }, r.outline)
        ? middle
        : loose(f, isRug(p), r, taken, keepOff({ h: p.height }, r, zones));
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

/** within this of a wall a moved piece goes flush to it, mm */
const MAGNET = 150;

/**
 * Where a moved or dropped piece comes to rest: on the placing grid,
 * free to stand anywhere, past the walls too. With the magnet on, a
 * side within MAGNET of a wall goes flush to it: inside the room
 * against the wall's face, outside against the band's far face. The
 * nearest wall wins on each axis; a wall only draws a piece that
 * stands along its span. The other pieces draw the same way: a side
 * goes against a neighbour's side, or in line with it.
 */
export const settle = (
  at: Spot,
  f: { w: number; d: number },
  room: Pick<Room, "outline">,
  magnet: boolean,
  others: readonly Rect[] = [],
): Spot => {
  const grid = (v: number) => Math.round(v / PLACE_SNAP) * PLACE_SNAP;
  const spot = { x: grid(at.x), y: grid(at.y) };
  if (!magnet) return spot;
  const span = (p: number, q: number) => [Math.min(p, q), Math.max(p, q)];
  let nearX = MAGNET;
  let nearY = MAGNET;
  const drawX = (x: number) => {
    const gap = Math.abs(at.x - x);
    if (gap < nearX) {
      nearX = gap;
      spot.x = x;
    }
  };
  const drawY = (y: number) => {
    const gap = Math.abs(at.y - y);
    if (gap < nearY) {
      nearY = gap;
      spot.y = y;
    }
  };
  for (const o of others) {
    if (at.y < o.y + o.d && o.y < at.y + f.d)
      [o.x - f.w, o.x + o.w, o.x, o.x + o.w - f.w].forEach(drawX);
    if (at.x < o.x + o.w && o.x < at.x + f.w)
      [o.y - f.d, o.y + o.d, o.y, o.y + o.d - f.d].forEach(drawY);
  }
  for (const e of edgesOf(room.outline)) {
    if (e.a[1] === e.b[1]) {
      const [from, to] = span(e.a[0], e.b[0]);
      if (!(at.x < to! && from! < at.x + f.w)) continue;
      const line = e.a[1];
      // the room lies below a north wall, above a south one
      const faces =
        e.wall === "north"
          ? [line, line - WALL_MM - f.d]
          : [line - f.d, line + WALL_MM];
      faces.forEach(drawY);
    } else {
      const [from, to] = span(e.a[1], e.b[1]);
      if (!(at.y < to! && from! < at.y + f.d)) continue;
      const line = e.a[0];
      // the room lies right of a west wall, left of an east one
      const faces =
        e.wall === "west"
          ? [line, line - WALL_MM - f.w]
          : [line - f.w, line + WALL_MM];
      faces.forEach(drawX);
    }
  }
  return spot;
};
