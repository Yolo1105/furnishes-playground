import { isRug, isSmall } from "./piece-detail";
import {
  doorCentreAlong,
  MUST_HAVE_CHOICES,
  OPENINGS,
  type Rules,
  type Wall,
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
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
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
type Opening = {
  W: number;
  D: number;
  door: Wall;
  doorOffset: number | null;
  window: Wall | null;
  windowWidth: number;
};
export type Room = Opening & { rules: Rules };

/** the floor the door needs to swing, and the window's span by the wall
    (none when the room has no window of its own) */
export const zonesOf = (r: Opening): { door: Zone; window: Zone | null } => {
  const along = (
    wall: Wall,
    centre: number,
    len: number,
    depth: number,
  ): Zone => {
    const start = centre - len / 2;
    switch (wall) {
      case "north":
        return { x: start, y: 0, w: len, d: depth };
      case "south":
        return { x: start, y: r.D - depth, w: len, d: depth };
      case "west":
        return { x: 0, y: start, w: depth, d: len };
      default:
        return { x: r.W - depth, y: start, w: depth, d: len };
    }
  };
  const doorLen = r.door === "north" || r.door === "south" ? r.W : r.D;
  const winLen = r.window === "north" || r.window === "south" ? r.W : r.D;
  return {
    door: along(
      r.door,
      doorCentreAlong(doorLen, r.doorOffset),
      OPENINGS.door.width,
      OPENINGS.door.width,
    ),
    window: r.window ? along(r.window, winLen / 2, r.windowWidth, 150) : null,
  };
};
type Zones = ReturnType<typeof zonesOf>;

export const meets = (a: Zone, b: Zone) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** a rug lies under things; a small thing is walked round */
const flat = (b: Box) => isRug(b);
const minor = (b: Box) => flat(b) || isSmall({ width: b.w, depth: b.d });
const BED = MUST_HAVE_CHOICES.find((c) => c.key === "bed")!.match;
const isBed = (b: Pick<Box, "name">) => BED.test(b.name);
/** how far a box stands from the nearest wall */
const wallGap = (b: Box, r: Opening) =>
  Math.min(b.x, b.y, r.W - (b.x + b.w), r.D - (b.y + b.d));

/** the gap between two boxes along the axis they do not share, or null
    when they do not face each other */
const gapOf = (a: Box, b: Box) => {
  const alongY = a.y < b.y + b.d && b.y < a.y + a.d;
  const alongX = a.x < b.x + b.w && b.x < a.x + a.w;
  if (alongY && !alongX) return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  if (alongX && !alongY) return Math.max(b.y - (a.y + a.d), a.y - (b.y + b.d));
  return null;
};

/** the floor a box must keep off: the door's swing when the rules ask,
    and the window's span when it would stand taller than the sill */
export const keepOff = (b: Pick<Box, "h">, r: Room, zones: Zones): Zone[] => [
  ...(r.rules.doorClear ? [zones.door] : []),
  ...(r.rules.windowClear && zones.window && b.h > OPENINGS.window.sill
    ? [zones.window]
    : []),
];

/** the troubles one box has where it stands, against the others */
const troubles = (b: Box, others: Box[], r: Room, zones: Zones) => {
  const out: Issue["kind"][] = [];
  if (b.x < 0 || b.y < 0 || b.x + b.w > r.W + 1 || b.y + b.d > r.D + 1)
    out.push("outside");
  if (!flat(b) && others.some((o) => !flat(o) && meets(b, o)))
    out.push("overlap");
  if (r.rules.doorClear && !flat(b) && meets(b, zones.door)) out.push("door");
  if (
    r.rules.windowClear &&
    zones.window &&
    b.h > OPENINGS.window.sill &&
    meets(b, zones.window)
  )
    out.push("window");
  if (
    !minor(b) &&
    others.some((o) => {
      if (minor(o)) return false;
      const g = gapOf(b, o);
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
      if (x < 0 || y < 0 || x + b.w > r.W || y + b.d > r.D) continue;
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
        text: `${b.name} blocks the door's swing`,
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
      if (meets(b, o)) {
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
      const g = minor(b) || minor(o) ? null : gapOf(b, o);
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
