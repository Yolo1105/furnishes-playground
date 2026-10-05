import { isRug, isSmall } from "./piece-detail";
import { gapToWalls, rectInside, sideSpan } from "./room-geometry";
import type { Point } from "./room-templates";
import {
  MUST_HAVE_CHOICES,
  OPENINGS,
  type Opening,
  PASS_DEPTH,
  SILL_DEPTH,
  type Rules,
  type Wall,
  isWindow,
  swings,
} from "./room-data";

/**
 * The planner's rules, read from where the pieces stand and from what
 * the room asks (its Rules): nothing past a wall, nothing over another
 * piece, a clear walkway of the asked width between neighbours, the
 * door's swing and the window kept free when asked, a bed against a
 * wall when asked, and the things the room must have present. A rug
 * lies under things, so it overlaps and sits in a doorway without harm;
 * a small thing (a lamp, a vase, a plant) is walked round, so it does
 * not count for the walkway. Each finding names the piece and, where
 * one exists, a spot nearby that clears it, so a Fix is one move; a
 * missing thing names what to add instead. Everything in millimetres
 * from the room's north-west corner.
 */
const STEP = 100; // mm, the search for a clear spot
const REACH = 3000; // mm, how far a Fix may move a piece
/** within this of a wall a bed counts as against it, mm */
const AGAINST = 250;

export type Box = {
  id: string;
  name: string;
  /** the box round the piece on the plan */
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** the piece's own size and turn, for one standing on the slant */
  own?: { w: number; d: number; rotation: number } | undefined;
};
export type Zone = { x: number; y: number; w: number; d: number };
export type Issue = {
  kind:
    "outside" | "overlap" | "door" | "window" | "walkway" | "bed" | "missing";
  text: string;
  /** the piece it is about; none when the room is missing something */
  pieceId: string | null;
  /** the other piece of an overlap or a narrow walkway */
  otherId?: string | undefined;
  /** where the piece could stand instead, if a spot was found */
  fix?: { x: number; y: number } | undefined;
  /** what the room is missing, by its must-have key */
  add?: string | undefined;
};
/** the room's walls and what is cut in them */
export type Shell = {
  W: number;
  D: number;
  /** the room's outline, mm from its top-left corner */
  outline: readonly Point[];
  openings: readonly Opening[];
};
export type Room = Shell & { rules: Rules };

/** the wall an opening sits in: the longest edge of that side, so a
    door never opens onto a notch; and where the opening's centre comes
    to rest along it, its asked place clamped within the edge */
export const wallSpan = (r: Pick<Shell, "W" | "D" | "outline">, wall: Wall) => {
  const horizontal = wall === "north" || wall === "south";
  const L = horizontal ? r.W : r.D;
  return (
    sideSpan(r.outline, wall) ?? {
      from: 0,
      to: L,
      at: wall === "north" || wall === "west" ? 0 : horizontal ? r.D : r.W,
    }
  );
};
export const openingCentre = (
  r: Pick<Shell, "W" | "D" | "outline">,
  o: Pick<Opening, "wall" | "at" | "width">,
) => {
  const span = wallSpan(r, o.wall);
  const want = o.at ?? (span.from + span.to) / 2;
  const centre = Math.min(
    span.to - o.width / 2,
    Math.max(span.from + o.width / 2, want),
  );
  return { centre, at: span.at, from: span.from, to: span.to };
};

/** the floor an opening claims inside the room: a swinging leaf its
    width, a doorway with no leaf a walk's depth, a window a sill's */
const zoneOf = (r: Shell, o: Opening, depth: number): Zone => {
  const { centre, at } = openingCentre(r, o);
  const start = centre - o.width / 2;
  switch (o.wall) {
    case "north":
      return { x: start, y: at, w: o.width, d: depth };
    case "south":
      return { x: start, y: at - depth, w: o.width, d: depth };
    case "west":
      return { x: at, y: start, w: depth, d: o.width };
    default:
      return { x: at - depth, y: start, w: depth, d: o.width };
  }
};
export const zonesOf = (
  r: Shell,
): {
  doors: { zone: Zone; swings: boolean }[];
  windows: { zone: Zone; sill: number }[];
} => ({
  doors: r.openings
    .filter((o) => !isWindow(o))
    .map((o) => ({
      zone: zoneOf(r, o, swings(o) ? o.width : PASS_DEPTH),
      swings: swings(o),
    })),
  windows: r.openings.filter(isWindow).map((o) => ({
    zone: zoneOf(r, o, SILL_DEPTH),
    sill: o.sill ?? OPENINGS.window.sill,
  })),
});
type Zones = ReturnType<typeof zonesOf>;

export const meets = (a: Zone, b: Zone) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** the four corners of a box, turned about its middle when it stands on
    the slant */
const corners = (b: Box): [number, number][] => {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.d / 2;
  const own = b.own ?? { w: b.w, d: b.d, rotation: 0 };
  const a = (own.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const half: [number, number][] = [
    [-own.w / 2, -own.d / 2],
    [own.w / 2, -own.d / 2],
    [own.w / 2, own.d / 2],
    [-own.w / 2, own.d / 2],
  ];
  return half.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
};
/** whether two pieces stand over each other: the boxes when both are
    square, the turned outlines (separating axes) when either is not */
export const overlaps = (a: Box, b: Box) => {
  if (!meets(a, b)) return false;
  const slant = (x: Box) => x.own && x.own.rotation % 90 !== 0;
  if (!slant(a) && !slant(b)) return true;
  const A = corners(a);
  const B = corners(b);
  for (const poly of [A, B])
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[(i + 1) % 4]!;
      const nx = y2 - y1;
      const ny = x1 - x2;
      const span = (pts: [number, number][]) => {
        const ps = pts.map(([x, y]) => x * nx + y * ny);
        return [Math.min(...ps), Math.max(...ps)] as const;
      };
      const [a0, a1] = span(A);
      const [b0, b1] = span(B);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
};

/** a rug lies under things; a small thing is walked round */
const flat = (b: Box) => isRug(b);
const minor = (b: Box) => flat(b) || isSmall({ width: b.w, depth: b.d });
const BED = MUST_HAVE_CHOICES.find((c) => c.key === "bed")!.match;
const isBed = (b: Pick<Box, "name">) => BED.test(b.name);
/** how far a box stands from the nearest wall */
const wallGap = (b: Box, r: Shell) => gapToWalls(b, r.outline);

/** the gap between two boxes along the axis they do not share, or null
    when they do not face each other */
const gapBetween = (a: Box, b: Box) => {
  const alongY = a.y < b.y + b.d && b.y < a.y + a.d;
  const alongX = a.x < b.x + b.w && b.x < a.x + a.w;
  if (alongY && !alongX) return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  if (alongX && !alongY) return Math.max(b.y - (a.y + a.d), a.y - (b.y + b.d));
  return null;
};

/** the floor a box must keep off: the door's swing when the rules ask,
    and the window's span when it would stand taller than the sill */
export const keepOff = (b: Pick<Box, "h">, r: Room, zones: Zones): Zone[] => [
  ...(r.rules.doorClear ? zones.doors.map((d) => d.zone) : []),
  ...(r.rules.windowClear
    ? zones.windows.filter((w) => b.h > w.sill).map((w) => w.zone)
    : []),
];

/** the troubles one box has where it stands, against the others */
const troubles = (b: Box, others: Box[], r: Room, zones: Zones) => {
  const out: Issue["kind"][] = [];
  if (!rectInside(b, r.outline)) out.push("outside");
  if (!flat(b) && others.some((o) => !flat(o) && overlaps(b, o)))
    out.push("overlap");
  if (
    r.rules.doorClear &&
    !flat(b) &&
    zones.doors.some((d) => meets(b, d.zone))
  )
    out.push("door");
  if (
    r.rules.windowClear &&
    zones.windows.some((w) => b.h > w.sill && meets(b, w.zone))
  )
    out.push("window");
  if (
    !minor(b) &&
    others.some((o) => {
      if (minor(o)) return false;
      const g = gapBetween(b, o);
      return g !== null && g > 0 && g < r.rules.walkway;
    })
  )
    out.push("walkway");
  if (r.rules.bedWall !== "off" && isBed(b) && wallGap(b, r) > AGAINST)
    out.push("bed");
  return out;
};

/** the nearest spot where the box stands clear, searched in rings */
const clearSpot = (b: Box, others: Box[], r: Room, zones: Zones) => {
  for (let ring = 1; ring * STEP <= REACH; ring++) {
    const dist = ring * STEP;
    const tries: [number, number][] = [];
    for (let k = -ring; k <= ring; k++) {
      tries.push([b.x + k * STEP, b.y - dist], [b.x + k * STEP, b.y + dist]);
      tries.push([b.x - dist, b.y + k * STEP], [b.x + dist, b.y + k * STEP]);
    }
    tries.sort(
      (p, q) =>
        Math.hypot(p[0] - b.x, p[1] - b.y) - Math.hypot(q[0] - b.x, q[1] - b.y),
    );
    for (const [x, y] of tries) {
      if (!rectInside({ ...b, x, y }, r.outline)) continue;
      if (troubles({ ...b, x, y }, others, r, zones).length === 0)
        return { x, y };
    }
  }
  return undefined;
};

export const healthOf = (boxes: Box[], r: Room): Issue[] => {
  const zones = zonesOf(r);
  const issues: Issue[] = [];
  const seenPair = new Set<string>();
  const fixFor = (b: Box) =>
    clearSpot(
      b,
      boxes.filter((o) => o.id !== b.id),
      r,
      zones,
    );
  for (const b of boxes) {
    const others = boxes.filter((o) => o.id !== b.id);
    const t = troubles(b, others, r, zones);
    if (t.includes("outside"))
      issues.push({
        kind: "outside",
        text: `${b.name} stands past the wall`,
        pieceId: b.id,
        fix: fixFor(b),
      });
    if (t.includes("door"))
      issues.push({
        kind: "door",
        text: zones.doors.some((d) => d.swings && meets(b, d.zone))
          ? `${b.name} blocks the door's swing`
          : `${b.name} blocks the doorway`,
        pieceId: b.id,
        fix: fixFor(b),
      });
    if (t.includes("window"))
      issues.push({
        kind: "window",
        text: `${b.name} blocks the window`,
        pieceId: b.id,
        fix: fixFor(b),
      });
    if (t.includes("bed"))
      issues.push({
        kind: "bed",
        text:
          r.rules.bedWall === "required"
            ? `${b.name} must stand against a wall`
            : `${b.name} would sit better against a wall`,
        pieceId: b.id,
        fix: fixFor(b),
      });
    for (const o of others) {
      const key = [b.id, o.id].sort().join("|");
      if (seenPair.has(key) || flat(b) || flat(o)) continue;
      if (overlaps(b, o)) {
        seenPair.add(key);
        issues.push({
          kind: "overlap",
          text: `${b.name} overlaps ${o.name}`,
          pieceId: o.id,
          otherId: b.id,
          fix: fixFor(o),
        });
        continue;
      }
      const g = minor(b) || minor(o) ? null : gapBetween(b, o);
      if (g !== null && g > 0 && g < r.rules.walkway) {
        seenPair.add(key);
        issues.push({
          kind: "walkway",
          text: `Only ${g} mm between ${b.name} and ${o.name}; ${r.rules.walkway} mm walks`,
          pieceId: o.id,
          otherId: b.id,
          fix: fixFor(o),
        });
      }
    }
  }
  for (const key of r.rules.mustHave) {
    const c = MUST_HAVE_CHOICES.find((x) => x.key === key);
    if (c && !boxes.some((b) => c.match.test(b.name)))
      issues.push({
        kind: "missing",
        text: `No ${key} in the room yet`,
        pieceId: null,
        add: key,
      });
  }
  return issues;
};
