import { useMemo } from "react";
import { footprint } from "./piece-detail";
import type { Opening, RoomId, Wall } from "./room-data";
import { openingCentre, wallSpan } from "./room-health";
import { footprintOf, openingsOf, useRoom, type RoomSpec } from "./room-store";
import { inRoom, propsOf, standingOf, useScene } from "./scene-store";
import type { Point } from "./room-templates";

/**
 * What hangs on a room's walls: the power outlets, and the things a
 * lived-in room has on its walls (a picture, a mirror, a shelf, the
 * air-con unit, a clock; in a bathroom the mirror cabinet, the towel
 * rail and the water heater; the service yard's drying rack). Each stands on a wall at a place along it
 * (as an opening does: mm from the room's west or north side, null for
 * the wall's middle) and at a height, its centre above the floor.
 *
 * A room starts with a suggested set for its kind, placed by rule:
 * clear of the doors and the windows and of tall furniture standing
 * against the wall, the largest first on the longest clear stretch,
 * outlets near the ends of the stretches. The suggestion follows the
 * room until the visitor changes a wall item; from then the room keeps
 * its own list (RoomSpec.items), and "Suggest again" goes back.
 */
export type WallItemKind =
  | "outlet"
  | "art"
  | "mirror"
  | "shelf"
  | "aircon"
  | "clock"
  | "towel-rail"
  | "mirror-cabinet"
  | "water-heater"
  | "drying-rack";

export type WallItem = {
  id: string;
  kind: WallItemKind;
  wall: Wall;
  /** mm along the wall, its centre, as an opening's; null is the middle */
  at: number | null;
  /** mm, its centre above the floor; the kind's own when unset */
  y?: number;
};

/** each kind's name, its size on the wall (width along it, height,
    depth out of it) and its usual centre height, mm */
export const WALL_ITEMS: Record<
  WallItemKind,
  { label: string; width: number; height: number; depth: number; y: number }
> = {
  outlet: { label: "Power outlet", width: 146, height: 86, depth: 12, y: 300 },
  art: { label: "Framed art", width: 760, height: 560, depth: 30, y: 1550 },
  mirror: { label: "Mirror", width: 500, height: 1100, depth: 25, y: 1350 },
  shelf: { label: "Wall shelf", width: 900, height: 220, depth: 220, y: 1450 },
  aircon: {
    label: "Air-con unit",
    width: 900,
    height: 290,
    depth: 220,
    y: 2250,
  },
  clock: { label: "Wall clock", width: 320, height: 320, depth: 40, y: 1900 },
  "towel-rail": {
    label: "Towel rail",
    width: 600,
    height: 420,
    depth: 90,
    y: 1100,
  },
  "mirror-cabinet": {
    label: "Mirror cabinet",
    width: 600,
    height: 700,
    depth: 140,
    y: 1550,
  },
  "water-heater": {
    label: "Water heater",
    width: 380,
    height: 600,
    depth: 320,
    y: 2050,
  },
  "drying-rack": {
    label: "Drying rack",
    width: 1200,
    height: 300,
    depth: 520,
    y: 2150,
  },
};
export const WALL_ITEM_KINDS = Object.keys(WALL_ITEMS) as WallItemKind[];

/** what a room of each kind has on its walls, the larger first */
const SUGGESTED: Record<RoomId, WallItemKind[]> = {
  living: ["art", "shelf", "aircon", "clock", "outlet", "outlet", "outlet"],
  master: ["art", "mirror", "aircon", "outlet", "outlet"],
  "bedroom-1": ["art", "aircon", "outlet", "outlet"],
  "bedroom-2": ["art", "shelf", "aircon", "outlet", "outlet"],
  study: ["shelf", "aircon", "outlet", "outlet"],
  kitchen: ["clock", "outlet", "outlet"],
  bathroom: ["mirror-cabinet", "towel-rail", "water-heater"],
  ensuite: ["mirror-cabinet", "towel-rail", "water-heater"],
  hall: ["mirror", "outlet"],
  shelter: ["outlet"],
  yard: ["drying-rack", "outlet"],
};
/** a kitchen's and a yard's outlets stand over the worktop */
const OUTLET_HIGH: RoomId[] = ["kitchen", "yard"];
const OUTLET_HIGH_Y = 1150;

/** the gap kept to an opening's edge, to a corner, and between items, mm */
const CLEAR = 150;
/** a piece this close to a wall stands against it, mm */
const AGAINST = 200;
/** an outlet's distance from the end of its stretch, mm */
const OUTLET_IN = 350;

type Shell = {
  W: number;
  D: number;
  outline: readonly Point[];
  openings: readonly Opening[];
};
/** a piece on the floor as a wall item reads it: its box and height */
export type Blocker = { x: number; y: number; w: number; d: number; h: number };

/** the item's centre along its wall and the wall's line, mm */
export const itemCentre = (shell: Shell, it: WallItem) =>
  openingCentre(shell, { wall: it.wall, at: it.at, width: itemWidth(it) });
export const itemWidth = (it: Pick<WallItem, "kind">) =>
  WALL_ITEMS[it.kind].width;
export const itemY = (it: WallItem) => it.y ?? WALL_ITEMS[it.kind].y;

type Span = readonly [number, number];
/** the stretches of [from, to] left when the taken spans are cut out */
const free = (from: number, to: number, taken: Span[]): Span[] => {
  const out: Span[] = [];
  let at = from;
  for (const [p, q] of [...taken].sort((a, b) => a[0] - b[0])) {
    if (p > at) out.push([at, Math.min(p, to)]);
    at = Math.max(at, q);
  }
  if (to > at) out.push([at, to]);
  return out.filter(([p, q]) => q > p);
};

/**
 * The suggested wall items of a room of kind `room`, placed by rule.
 * `blockers` are the pieces standing in it; one against a wall keeps
 * the items it would stand in front of off that stretch. Deterministic:
 * the same room gives the same items with the same ids.
 */
export const suggestItems = (
  shell: Shell,
  room: RoomId,
  blockers: readonly Blocker[] = [],
): WallItem[] => {
  const walls: Wall[] = ["north", "east", "south", "west"];
  const along = (w: Wall) => w === "north" || w === "south";
  // each wall's span, and what is taken on it: the openings, with room
  const spans = new Map(walls.map((w) => [w, wallSpan(shell, w)]));
  const taken = new Map<Wall, Span[]>(walls.map((w) => [w, []]));
  for (const o of shell.openings) {
    const c = openingCentre(shell, o);
    taken
      .get(o.wall)!
      .push([c.centre - o.width / 2 - CLEAR, c.centre + o.width / 2 + CLEAR]);
  }
  /** where a piece stands against a wall, below `top`, along it */
  const against = (w: Wall, bottom: number): Span[] => {
    const s = spans.get(w)!;
    return blockers
      .filter((b) => b.h > bottom)
      .filter((b) =>
        w === "north"
          ? b.y - s.at < AGAINST
          : w === "south"
            ? s.at - (b.y + b.d) < AGAINST
            : w === "west"
              ? b.x - s.at < AGAINST
              : s.at - (b.x + b.w) < AGAINST,
      )
      .map((b) =>
        along(w)
          ? ([b.x - CLEAR, b.x + b.w + CLEAR] as const)
          : ([b.y - CLEAR, b.y + b.d + CLEAR] as const),
      );
  };
  const out: WallItem[] = [];
  const used = new Map<Wall, number>(walls.map((w) => [w, 0]));
  const kinds = SUGGESTED[room] ?? [];
  kinds.forEach((kind, i) => {
    const spec = WALL_ITEMS[kind];
    const y =
      kind === "outlet" && OUTLET_HIGH.includes(room) ? OUTLET_HIGH_Y : spec.y;
    const bottom = y - spec.height / 2;
    // every clear stretch of every wall wide enough for it
    const stretches = walls.flatMap((w) => {
      const s = spans.get(w)!;
      return free(s.from + CLEAR, s.to - CLEAR, [
        ...taken.get(w)!,
        // an outlet stands low behind furniture, as outlets do
        ...(kind === "outlet" ? [] : against(w, bottom)),
      ])
        .filter(([p, q]) => q - p >= spec.width)
        .map(([p, q]) => ({ w, p, q }));
    });
    if (stretches.length === 0) return;
    let pick: (typeof stretches)[number];
    let centre: number;
    if (kind === "outlet") {
      // an outlet near the end of a stretch, on the wall with the fewest
      // outlets yet, the longest stretch first
      pick = [...stretches].sort(
        (a, b) => used.get(a.w)! - used.get(b.w)! || b.q - b.p - (a.q - a.p),
      )[0]!;
      centre = Math.min(pick.q - spec.width / 2, pick.p + OUTLET_IN);
      used.set(pick.w, used.get(pick.w)! + 1);
    } else {
      // the rest in the middle of the longest clear stretch, on a wall
      // with nothing else on it yet where there is one
      pick = [...stretches].sort(
        (a, b) =>
          Number(used.get(a.w)! > 0) - Number(used.get(b.w)! > 0) ||
          b.q - b.p - (a.q - a.p),
      )[0]!;
      centre = (pick.p + pick.q) / 2;
      used.set(pick.w, used.get(pick.w)! + 1);
    }
    taken
      .get(pick.w)!
      .push([centre - spec.width / 2 - CLEAR, centre + spec.width / 2 + CLEAR]);
    out.push({
      id: `${kind}-${pick.w}-${i}`,
      kind,
      wall: pick.w,
      at: Math.round(centre),
      ...(y !== spec.y ? { y } : {}),
    });
  });
  return out;
};

/** the pieces standing in a room as boxes with their heights, mm */
const blockersOf = (
  roomId: string,
  firstId: string,
  groups: ReturnType<typeof useScene.getState>["groups"],
  overrides: ReturnType<typeof useScene.getState>["overrides"],
): Blocker[] =>
  groups
    .flatMap((g) => g.items)
    .filter(
      (n) =>
        n.kind !== "fixed" && inRoom(overrides[n.id] ?? {}, roomId, firstId),
    )
    .flatMap((n) => {
      const p = propsOf(n, overrides);
      const at =
        p.x !== undefined && p.y !== undefined
          ? { x: p.x, y: p.y }
          : standingOf(n.id);
      if (p.hidden || !at) return [];
      return [{ ...at, ...footprint(p), h: p.height }];
    });

/** each room's last list, so a reading that comes out the same is the
    same object and nothing that draws it draws again */
const lastItems = new Map<string, { key: string; items: WallItem[] }>();

/**
 * A room's wall items as they stand: its own list once the visitor has
 * one, else the suggestion for it, read again as its furniture moves.
 * The same list (the same object) while nothing about it changes.
 */
export function useWallItems(spec: RoomSpec): WallItem[] {
  const joins = useRoom((s) => s.joins);
  const firstId = useRoom((s) => s.rooms[0]!.id);
  const groups = useScene((s) => s.groups);
  const overrides = useScene((s) => s.overrides);
  return useMemo(() => {
    const next =
      spec.items ??
      suggestItems(
        {
          W: spec.width,
          D: spec.depth,
          outline: footprintOf(spec),
          openings: openingsOf({ joins }, spec),
        },
        spec.room,
        blockersOf(spec.id, firstId, groups, overrides),
      );
    const key = JSON.stringify(next);
    const had = lastItems.get(spec.id);
    if (had?.key === key) return had.items;
    lastItems.set(spec.id, { key, items: next });
    return next;
  }, [spec, joins, firstId, groups, overrides]);
}
