import { isRug, isSmall } from "./piece-detail";
import { OPENINGS, type Wall } from "./room-data";

/**
 * The planner's rules, read from where the pieces stand: nothing past a
 * wall, nothing over another piece, a clear walkway of at least 600 mm
 * between neighbours, the door's swing kept free, and nothing taller
 * than the sill standing in front of the window. A rug lies under
 * things, so it overlaps and sits in a doorway without harm; a small
 * thing (a lamp, a vase, a plant) is walked round, so it does not count
 * for the walkway. Each finding names the piece and, where one exists,
 * a spot nearby that clears it, so a Fix is one move. Everything in
 * millimetres from the room's north-west corner.
 */
export const WALKWAY = 600;
const STEP = 100; // mm, the search for a clear spot
const REACH = 3000; // mm, how far a Fix may move a piece

export type Box = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
};
type Zone = { x: number; y: number; w: number; d: number };
export type Issue = {
  kind: "outside" | "overlap" | "door" | "window" | "walkway";
  text: string;
  pieceId: string;
  /** the other piece of an overlap or a narrow walkway */
  otherId?: string | undefined;
  /** where the piece could stand instead, if a spot was found */
  fix?: { x: number; y: number } | undefined;
};
export type Room = { W: number; D: number; door: Wall; window: Wall };

/** the floor the door needs to swing, and the window's span by the wall */
export const zonesOf = (r: Room): { door: Zone; window: Zone } => {
  const along = (wall: Wall, len: number, depth: number): Zone => {
    switch (wall) {
      case "north":
        return { x: (r.W - len) / 2, y: 0, w: len, d: depth };
      case "south":
        return { x: (r.W - len) / 2, y: r.D - depth, w: len, d: depth };
      case "west":
        return { x: 0, y: (r.D - len) / 2, w: depth, d: len };
      default:
        return { x: r.W - depth, y: (r.D - len) / 2, w: depth, d: len };
    }
  };
  return {
    door: along(r.door, OPENINGS.door.width, OPENINGS.door.width),
    window: along(r.window, OPENINGS.window.width, 150),
  };
};

type Zones = ReturnType<typeof zonesOf>;

const meets = (a: Zone, b: Zone) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/** a rug lies under things; a small thing is walked round */
const flat = (b: Box) => isRug(b);
const minor = (b: Box) => flat(b) || isSmall({ width: b.w, depth: b.d });

/** the gap between two boxes along the axis they do not share, or null
    when they do not face each other */
const gapOf = (a: Box, b: Box) => {
  const alongY = a.y < b.y + b.d && b.y < a.y + a.d;
  const alongX = a.x < b.x + b.w && b.x < a.x + a.w;
  if (alongY && !alongX) return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  if (alongX && !alongY) return Math.max(b.y - (a.y + a.d), a.y - (b.y + b.d));
  return null;
};

/** the troubles one box has where it stands, against the others */
const troubles = (b: Box, others: Box[], r: Room, zones: Zones) => {
  const out: Issue["kind"][] = [];
  if (b.x < 0 || b.y < 0 || b.x + b.w > r.W + 1 || b.y + b.d > r.D + 1)
    out.push("outside");
  if (!flat(b) && others.some((o) => !flat(o) && meets(b, o)))
    out.push("overlap");
  if (!flat(b) && meets(b, zones.door)) out.push("door");
  if (b.h > OPENINGS.window.sill && meets(b, zones.window)) out.push("window");
  if (
    !minor(b) &&
    others.some((o) => {
      if (minor(o)) return false;
      const g = gapOf(b, o);
      return g !== null && g > 0 && g < WALKWAY;
    })
  )
    out.push("walkway");
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
      if (g !== null && g > 0 && g < WALKWAY) {
        seenPair.add(key);
        issues.push({
          kind: "walkway",
          text: `Only ${g} mm between ${b.name} and ${o.name}; ${WALKWAY} mm walks`,
          pieceId: o.id,
          otherId: b.id,
          fix: fixFor(o),
        });
      }
    }
  }
  return issues;
};
