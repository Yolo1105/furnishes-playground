/**
 * The interior designer's rules a furnished room is read by: a layout
 * that breaks them reads as computer-placed even when every object in it
 * is real. Each is advice (the room's health shows it beside the hard
 * rules, and "By the book" lays a room out to keep them): plain data in,
 * findings out, in millimetres on the plan from the room's north-west
 * corner, as room-health.ts reads the pieces.
 */

/** a piece on the plan: its box, its height and what it is called */
export type Placed = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
};

export type Advice = {
  kind: "design";
  rule:
    | "table-gap"
    | "table-length"
    | "rug-size"
    | "rug-margin"
    | "lamp"
    | "bedside"
    | "tv-height"
    | "art";
  text: string;
  pieceId: string;
};

/** the rules' numbers, mm */
export const DESIGN = {
  /** from the sofa's front to the coffee table's edge */
  tableGap: [400, 450] as const,
  /** the coffee table's length as a share of the sofa's: about two
      thirds (a little either way reads as meant) */
  tableShare: [0.5, 0.75] as const,
  /** floor showing round a rug to the walls */
  rugMargin: [200, 450] as const,
  /** how far onto a rug a seat's front stands, at least, so its front
      legs are on it */
  onRug: 100,
  /** a seat this near a rug is of its group, and should stand on it */
  rugGroup: 1000,
  /** a floor lamp's reach from the seat it serves */
  lampReach: 600,
  /** a bedside's top against the mattress's */
  bedside: 50,
  /** a television's middle from the floor, seated */
  tvCentre: [1000, 1100] as const,
  /** a picture's middle from the floor, or its foot over the piece
      under it, and its width as a share of that piece's */
  artCentre: [1450, 1550] as const,
  artOver: [200, 250] as const,
  artShare: [0.5, 0.8] as const,
};

const SOFA = /\bsofa|couch|settee/i;
const TABLE = /coffee table/i;
const RUG = /\brug\b|carpet/i;
const SEAT = /\bsofa|couch|settee|arm ?chair|lounge|reading chair/i;
const LAMP = /floor lamp|standing lamp/i;
const BED = /\bbed\b/i;
const BEDSIDE = /bedside|night ?stand/i;

/** the gap between two boxes on the plan, mm: 0 or less when they
    touch or overlap */
const gap = (a: Placed, b: Placed) =>
  Math.max(
    b.x - (a.x + a.w),
    a.x - (b.x + b.w),
    b.y - (a.y + a.d),
    a.y - (b.y + b.d),
  );
/** how far two boxes overlap on the plan, along the narrower way, mm */
const overlapOf = (a: Placed, b: Placed) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
};
const length = (p: Placed) => Math.max(p.w, p.d);

/** a mattress's top over the floor, mm, for a bed of this height (its
    headboard stands above it) */
export const mattressTop = (bedH: number) => Math.min(600, bedH * 0.55);

/** the advice for a room's pieces, the room `W` × `D` mm */
export const designOf = (pieces: readonly Placed[], W: number, D: number) => {
  const out: Advice[] = [];
  const sofas = pieces.filter((p) => SOFA.test(p.name));
  const tables = pieces.filter((p) => TABLE.test(p.name));
  for (const t of tables) {
    const sofa = sofas.reduce<Placed | null>(
      (best, s) => (!best || gap(s, t) < gap(best, t) ? s : best),
      null,
    );
    if (!sofa) continue;
    const g = gap(sofa, t);
    const [lo, hi] = DESIGN.tableGap;
    if (g < lo || g > hi)
      out.push({
        kind: "design",
        rule: "table-gap",
        text: `${g} mm from the ${sofa.name.toLowerCase()} to the ${t.name.toLowerCase()}; ${lo}–${hi} mm reaches it from the seat`,
        pieceId: t.id,
      });
    const share = length(t) / length(sofa);
    const [a, b] = DESIGN.tableShare;
    if (share < a || share > b)
      out.push({
        kind: "design",
        rule: "table-length",
        text: `The ${t.name.toLowerCase()} is ${Math.round(share * 100)} % of the ${sofa.name.toLowerCase()}'s length; about two thirds reads as meant`,
        pieceId: t.id,
      });
  }
  for (const rug of pieces.filter((p) => RUG.test(p.name))) {
    const seats = pieces.filter(
      (p) => SEAT.test(p.name) && gap(p, rug) < DESIGN.rugGroup,
    );
    if (seats.length && seats.some((s) => overlapOf(s, rug) < DESIGN.onRug))
      out.push({
        kind: "design",
        rule: "rug-size",
        text: "The rug is too small: the seats' front legs should stand on it",
        pieceId: rug.id,
      });
    const margin = Math.min(rug.x, rug.y, W - rug.x - rug.w, D - rug.y - rug.d);
    const [lo, hi] = DESIGN.rugMargin;
    const floating =
      Math.min(rug.x, W - rug.x - rug.w) > hi &&
      Math.min(rug.y, D - rug.y - rug.d) > hi;
    if (margin < lo || floating)
      out.push({
        kind: "design",
        rule: "rug-margin",
        text:
          margin < lo
            ? `Only ${margin} mm of floor shows past the rug; ${lo}–${hi} mm frames it`
            : "The rug floats in the middle of the floor; a larger one ties the seats together",
        pieceId: rug.id,
      });
  }
  const seats = pieces.filter((p) => SEAT.test(p.name));
  for (const lamp of pieces.filter((p) => LAMP.test(p.name)))
    if (seats.length && !seats.some((s) => gap(s, lamp) <= DESIGN.lampReach))
      out.push({
        kind: "design",
        rule: "lamp",
        text: `The ${lamp.name.toLowerCase()} stands in open floor; beside a seat, a little behind it, it lights a lap`,
        pieceId: lamp.id,
      });
  const beds = pieces.filter((p) => BED.test(p.name) && !BEDSIDE.test(p.name));
  for (const side of pieces.filter((p) => BEDSIDE.test(p.name))) {
    const bed = beds.find((b) => gap(b, side) < 200);
    if (!bed) continue;
    const top = mattressTop(bed.h);
    if (Math.abs(side.h - top) > DESIGN.bedside)
      out.push({
        kind: "design",
        rule: "bedside",
        text: `The ${side.name.toLowerCase()} is ${side.h} mm tall and the mattress ${Math.round(top)} mm; level within ${DESIGN.bedside} mm, a hand finds it`,
        pieceId: side.id,
      });
  }
  return out;
};

/** a television's middle, mm from the floor, on a console this tall */
export const tvCentreOn = (consoleH: number, screenH: number, foot = 60) =>
  consoleH + foot + screenH / 2;

/** where a picture's middle goes, mm from the floor: over a piece, its
    foot a hand over the piece's top; on a bare wall, at eye height */
export const artCentre = (artH: number, under: number | null) =>
  under === null
    ? (DESIGN.artCentre[0] + DESIGN.artCentre[1]) / 2
    : under + (DESIGN.artOver[0] + DESIGN.artOver[1]) / 2 + artH / 2;
