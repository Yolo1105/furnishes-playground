import {
  footprint,
  isRug,
  isSmall,
  PLACE_SNAP,
  type PieceProps,
} from "./piece-detail";
import { ARCHETYPES, type Placement, type Rule } from "./archetypes";
import { edgesOf, rectInside, WALL_MM, type Edge } from "./room-geometry";
import {
  keepOff,
  meets,
  openingCentre,
  zonesOf,
  type Room,
  type Zone,
} from "./room-health";
import { isWindow, type RoomId, type Rules, type Wall } from "./room-data";

/**
 * Where the pieces stand. A piece placed by hand stands where it was
 * put; the rest are laid out: pieces of any size in rows along the
 * room, the asked gap apart, a new row when the wall is reached; small
 * things (lamps, vases, plants) and rugs then take the first clear spot
 * on a coarse grid, since they are no obstacle to walking.
 *
 * The room can also be laid out afresh four ways, for the plan's
 * Layouts: rows across the width, rows down the depth, along the
 * walls (the middle left open, starting on the wall facing the door,
 * each piece turned to run along its wall), and by the book (the
 * room kind's archetype rules place the anchors, the rest go along
 * the walls). A locked piece keeps its place in all four. Everything
 * in millimetres of the room; the plan and the 3D view both read
 * this, so a piece stands in the same place in each.
 */
const MARGIN = 250;
const GRID = 100;
/** how far along the rows a piece is tried before the loose pass has it */
const TRIES = 400;

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
    // a new row when the wall is reached; a piece the rows cannot seat
    // (the room full, or held pieces in every row) is left for the
    // loose pass, which finds the first clear spot or the nearest inside
    let tries = 0;
    for (; tries <= TRIES; tries++) {
      if (x > MARGIN && x + f.w > L - MARGIN) {
        x = MARGIN;
        y += rowDepth + gap;
        rowDepth = 0;
      }
      if (!blocked({ ...f, x, y })) break;
      x += GRID;
    }
    if (tries > TRIES) return;
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

/* ---------- the four layouts ---------- */

export type PlanId = "rows" | "across" | "walls" | "book";
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
  // the first door, or the south wall's middle when the room has none
  const door = zones.doors[0]?.zone ?? { x: r.W / 2, y: r.D, w: 0, d: 0 };
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
      x: Math.round((r.W - f.w) / 2 / PLACE_SNAP) * PLACE_SNAP,
      y: Math.round((r.D - f.d) / 2 / PLACE_SNAP) * PLACE_SNAP,
    };
    const s =
      isRug(p) && rectInside({ ...middle, ...f }, r.outline)
        ? middle
        : loose(f, isRug(p), r, taken, keepOff({ h: p.height }, r, zones));
    taken.push({ ...s, ...f });
    return { ...s, rotation };
  });
};

/* ---------- by the book: the archetype's anchors ---------- */

const OPPOSITE: Record<Wall, Wall> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};
const horizontal = (wall: Wall) => wall === "north" || wall === "south";
/** the turn that puts a piece's back to the wall: its width along it */
const backTo = (wall: Wall) => (horizontal(wall) ? 0 : 90);
const spanOf = (e: Edge) =>
  horizontal(e.wall) ? Math.abs(e.b[0] - e.a[0]) : Math.abs(e.b[1] - e.a[1]);
/** a rect flush to the edge, its middle at `c` along it */
const flushTo = (e: Edge, c: number, f: Size): Rect =>
  e.wall === "north"
    ? { x: c - f.w / 2, y: e.a[1], ...f }
    : e.wall === "south"
      ? { x: c - f.w / 2, y: e.a[1] - f.d, ...f }
      : e.wall === "west"
        ? { x: e.a[0], y: c - f.d / 2, ...f }
        : { x: e.a[0] - f.w, y: c - f.d / 2, ...f };
const onGrid = (v: number) => Math.round(v / GRID) * GRID;
/** where a placed anchor stands, for the rules that build on it */
type Anchor = { rect: Rect; wall: Wall | null; rotation: number };

/**
 * The archetype's rules placed in order, each on the first clear spot
 * at or near where the rule says, shifted along its wall a grid step
 * at a time; a rule that cannot be met places nothing, and the piece
 * goes along the walls with the rest. Returns the anchors' spots by
 * item index.
 */
const bookAnchors = (
  items: readonly Item[],
  r: Room,
  kept: (Placed | null)[],
  room: RoomId,
): Map<number, Placed> => {
  const gap = gapOf(r.rules);
  const zones = zonesOf(r);
  const edges = edgesOf(r.outline);
  const longest = [...edges].sort((a, b) => spanOf(b) - spanOf(a));
  const edgeOf = (wall: Wall) => longest.find((e) => e.wall === wall) ?? null;
  const window = r.openings.find(isWindow) ?? null;
  const taken: Rect[] = items.flatMap((p, i) =>
    kept[i] ? [{ ...kept[i]!, ...footprint({ ...p, ...kept[i]! }) }] : [],
  );
  const used = new Set<Wall>();
  const anchors = new Map<string, Anchor>();
  const out = new Map<number, Placed>();
  /** clear of what stands, a walkway apart; a piece may touch its
      target (the bedside the bed, the coffee table the sofa's gap) */
  const clear = (rect: Rect, avoid: Zone[], touch: Rect | null = null) =>
    rectInside(rect, r.outline) &&
    !taken.some((t) =>
      t === touch ? meets(rect, t) : meets(grown(rect, gap), t),
    ) &&
    !avoid.some((z) => meets(rect, z));
  /** the first clear rect at the spot or shifted along the axis */
  const settle = (
    make: (shift: number) => Rect,
    avoid: Zone[],
    reach: number,
    touch: Rect | null = null,
  ): Rect | null => {
    for (let s = 0; s <= reach; s += GRID)
      for (const sign of s === 0 ? [1] : [1, -1]) {
        const rect = make(sign * s);
        if (clear(rect, avoid, touch)) return rect;
      }
    return null;
  };
  const place = (
    i: number,
    rect: Rect,
    rotation: number,
    wall: Wall | null,
  ) => {
    const spot = { x: onGrid(rect.x), y: onGrid(rect.y) };
    const at = { ...spot, w: rect.w, d: rect.d };
    taken.push(at);
    out.set(i, { ...spot, rotation });
    return { rect: at, wall, rotation };
  };
  const alongWall = (p: Item, e: Edge, c: number, avoid: Zone[]) => {
    const rotation = backTo(e.wall);
    const f = footprint({ ...p, rotation });
    const rect = settle(
      (shift) => flushTo(e, c + shift, f),
      avoid,
      spanOf(e) / 2,
    );
    return rect ? { rect, rotation } : null;
  };
  const centreOf = (e: Edge) =>
    horizontal(e.wall) ? (e.a[0] + e.b[0]) / 2 : (e.a[1] + e.b[1]) / 2;
  const candidates = (rule: Rule) =>
    items
      .map((p, i) => i)
      .filter(
        (i) =>
          !kept[i] &&
          !out.has(i) &&
          big(items[i]!) &&
          rule.what.test(items[i]!.name),
      );
  const byRule = (rule: Rule, i: number): Anchor | null => {
    const p = items[i]!;
    const avoid = keepOff({ h: p.height }, r, zones);
    const target = rule.target ? anchors.get(rule.target) : undefined;
    const onWall = (e: Edge | null, c?: number) => {
      if (!e) return null;
      const got = alongWall(p, e, c ?? centreOf(e), avoid);
      if (!got) return null;
      used.add(e.wall);
      return place(i, got.rect, got.rotation, e.wall);
    };
    switch (rule.place as Placement) {
      case "longest-wall":
        return onWall(longest[0] ?? null);
      case "free-wall":
        return onWall(longest.find((e) => !used.has(e.wall)) ?? null);
      case "opposite":
        return target?.wall ? onWall(edgeOf(OPPOSITE[target.wall])) : null;
      case "window": {
        if (!window) return null;
        const e = edgeOf(window.wall);
        return e ? onWall(e, openingCentre(r, window).centre) : null;
      }
      case "flanking": {
        if (!target?.wall) return null;
        const e = edgeOf(target.wall);
        if (!e) return null;
        const rotation = backTo(e.wall);
        const f = footprint({ ...p, rotation });
        const h = horizontal(e.wall);
        const t = target.rect;
        const g = rule.gap ?? 0;
        // the near side first, then the far side of the target
        for (const side of [-1, 1]) {
          const c = h
            ? side < 0
              ? t.x - g - f.w / 2
              : t.x + t.w + g + f.w / 2
            : side < 0
              ? t.y - g - f.d / 2
              : t.y + t.d + g + f.d / 2;
          const rect = settle((shift) => flushTo(e, c + shift, f), avoid, 0, t);
          if (rect) return place(i, rect, rotation, e.wall);
        }
        return null;
      }
      case "facing":
      case "in-front": {
        if (!target) return null;
        const t = target.rect;
        const g = rule.gap ?? 0;
        // away from the target's wall, or toward the room's middle
        const wall =
          target.wall ??
          (t.y + t.d / 2 < r.D / 2
            ? "north"
            : t.x + t.w / 2 < r.W / 2
              ? "west"
              : t.y + t.d / 2 > r.D / 2
                ? "south"
                : "east");
        const rotation = backTo(wall);
        const f = footprint({ ...p, rotation });
        const make = (shift: number): Rect =>
          wall === "north"
            ? { x: t.x + t.w / 2 - f.w / 2 + shift, y: t.y + t.d + g, ...f }
            : wall === "south"
              ? { x: t.x + t.w / 2 - f.w / 2 + shift, y: t.y - g - f.d, ...f }
              : wall === "west"
                ? { x: t.x + t.w + g, y: t.y + t.d / 2 - f.d / 2 + shift, ...f }
                : {
                    x: t.x - g - f.w,
                    y: t.y + t.d / 2 - f.d / 2 + shift,
                    ...f,
                  };
        const rect = settle(make, avoid, 600, t);
        return rect ? place(i, rect, rotation, null) : null;
      }
      case "middle": {
        const rotation = kept[i]?.rotation ?? p.rotation;
        const f = footprint({ ...p, rotation });
        const rect = settle(
          (shift) => ({
            x: r.W / 2 - f.w / 2 + shift,
            y: r.D / 2 - f.d / 2,
            ...f,
          }),
          avoid,
          r.W / 4,
        );
        return rect ? place(i, rect, rotation, null) : null;
      }
    }
  };
  for (const rule of ARCHETYPES[room].rules) {
    // flanking seats a pair; every other rule seats one
    const want = rule.place === "flanking" ? 2 : 1;
    let seated = 0;
    for (const i of candidates(rule)) {
      if (seated >= want) break;
      const a = byRule(rule, i);
      if (!a) continue;
      seated += 1;
      if (seated === 1) anchors.set(rule.name, a);
    }
  }
  return out;
};

/** by the book: the archetype's anchors where the rules put them, the
    rest along the walls */
const bookPlan = (
  items: readonly Item[],
  r: Room,
  kept: (Placed | null)[],
  room: RoomId,
): Placed[] => {
  const anchors = bookAnchors(items, r, kept, room);
  return wallsPlan(
    items,
    r,
    items.map((p, i) => kept[i] ?? anchors.get(i) ?? null),
  );
};

/** the four layouts of the room's pieces; a locked piece stays put */
export const layoutPlans = (
  items: readonly Item[],
  r: Room,
  now: readonly Spot[],
  room: RoomId,
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
      note: `The middle open${(() => {
        const d = r.openings.find((o) => o.kind !== "window");
        return d ? `, facing the ${d.wall} door` : "";
      })()}`,
      places: wallsPlan(items, r, kept),
    },
    {
      id: "book",
      label: "By the book",
      note: ARCHETYPES[room].name,
      places: bookPlan(items, r, kept, room),
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
