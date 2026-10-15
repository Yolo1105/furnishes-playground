import type { Run } from "./books";
import { seeded, within } from "./seeded";

/**
 * Open shelves dressed as a stylist leaves them (round 8, Part 4): not
 * every shelf full of books, but groups of odd numbers (one, three or
 * five things) mixing books standing and laid flat with a vase, a small
 * plant and a box, no two neighbours alike, each object turned a little
 * off square, and about one shelf in three left empty or nearly so.
 * Plain data from a seed, so a piece is dressed the same each time and
 * the rules are tested here; Furniture3D draws what it says.
 */

/** an object set on a shelf, m in the run's frame: its foot's middle,
    its width, height and depth, its turn about the vertical (radians)
    and which of its kind's finishes it takes */
export type ShelfObject = {
  kind: "vase" | "plant" | "box";
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  turn: number;
  tone: number;
};
/** a thing in a group: books standing, books laid flat, or an object */
export type Kind = "books" | "stack" | ShelfObject["kind"];
/** a shelf as dressed: its group's things in order along it, the runs
    its books take (books.ts lays each out, standing or flat) and the
    objects beside them */
export type Dressed = { group: Kind[]; books: Run[]; objects: ShelfObject[] };

/** the stylist's measures, m: how far in from the bay's sides a group
    keeps, the gap between two of its things, the room an object needs
    over it, and the sizes each kind comes in (width, height) */
const SIDE = 0.02;
const GAP = [0.025, 0.06] as const;
const HEADROOM = 0.03;
const SIZES: Record<
  ShelfObject["kind"],
  { w: readonly [number, number]; h: readonly [number, number] }
> = {
  vase: { w: [0.08, 0.12], h: [0.16, 0.28] },
  plant: { w: [0.12, 0.17], h: [0.18, 0.3] },
  box: { w: [0.14, 0.22], h: [0.08, 0.12] },
};
/** how wide a shelf must be for a group of five, and of three, m */
const GROUP_WIDE = { five: 0.75, three: 0.3 } as const;
/** a run of books alone on a shelf takes this share of it at least */
const ALONE_SHARE = 0.75;
/** a standing run of books, and a stack laid flat, m across */
const BOOKS_W = [0.18, 0.4] as const;
const STACK_W = [0.2, 0.28] as const;
/** the narrowest a standing run is let shrink to fit its group, m */
const BOOKS_FEWEST = 0.12;
/** the narrowest each thing is let shrink to fit its group */
const fewest = (k: Kind) =>
  k === "books" ? BOOKS_FEWEST : k === "stack" ? STACK_W[0] : SIZES[k].w[0];
/** the least room a shelf needs for books, m (a paperback and a hair) */
const BOOK_ROOM = 0.19;
/** an object's turn off square, radians: 5° to 15° either way */
const TURN = [(5 * Math.PI) / 180, (15 * Math.PI) / 180] as const;
/** the finishes of each kind (Furniture3D's palette) */
export const TONES = 3;
/** the share of shelves left empty or nearly so */
export const SPARE_SHARE = 1 / 3;

/** the shelves of a piece, each its run as books.ts takes it: dressed a
    column at a time (a bay's shelves one over another, and a two-faced
    bookwall's back face apart from its front), so a shelf's neighbour is
    the one over it, as the eye reads them */
export const dressShelves = (shelves: Run[], seed: number): Dressed[] => {
  const columns = new Map<string, number[]>();
  shelves.forEach((run, i) => {
    const key = `${run.x0.toFixed(3)}|${run.z.toFixed(3)}`;
    columns.set(key, [...(columns.get(key) ?? []), i]);
  });
  const out: Dressed[] = [];
  [...columns.values()].forEach((column, c) => {
    const next = seeded(seed * 4099 + c * 131 + 29);
    // about a third of a column's shelves left spare, spread through it:
    // every third, from a place of the seed's choosing
    const from = Math.floor(next() * 3);
    let above: Kind | null = null;
    [...column]
      .sort((a, b) => shelves[a]!.y - shelves[b]!.y)
      .forEach((i, k) => {
        const dressed = dressShelf(
          shelves[i]!,
          (k + from) % 3 === 0,
          above,
          next,
        );
        above = dressed.group[0] ?? null;
        out[i] = dressed;
      });
  });
  return out;
};

/** a group's things, odd in number and no two neighbours alike, that
    fit the shelf; one alone on a spare shelf, or none */
const groupOf = (
  run: Run,
  spare: boolean,
  above: Kind | null,
  next: () => number,
): Kind[] => {
  const books = run.room >= BOOK_ROOM;
  const objects = (["vase", "plant", "box"] as const).filter(
    (k) => run.room >= SIZES[k].h[0] + HEADROOM,
  );
  const kinds: Kind[] = [
    ...(books ? (["books", "stack"] as const) : []),
    ...objects,
  ];
  if (kinds.length === 0) return [];
  if (spare) {
    // nearly empty, or empty: one small object, or nothing
    const small = objects.filter((k) => k !== "plant");
    return next() < 0.5 && small.length > 0
      ? [small[Math.floor(next() * small.length)]!]
      : [];
  }
  const wide = run.bayW - 2 * SIDE;
  // five on a wide shelf now and then, three where three fit, else one
  const count =
    wide > GROUP_WIDE.five && next() < 0.4
      ? 5
      : wide > GROUP_WIDE.three
        ? 3
        : 1;
  const out: Kind[] = [];
  // books lead most groups, standing or laid flat, and not the same as
  // the shelf above's lead
  const lead: Kind[] = books
    ? (["books", "books", "stack"] as const).filter((k) => k !== above)
    : objects;
  out.push(lead[Math.floor(next() * lead.length)] ?? kinds[0]!);
  while (out.length < count) {
    const prev = out[out.length - 1];
    const can = kinds.filter(
      (k) => k !== prev && !(isBooks(k) && out.some(isBooks)),
    );
    if (can.length === 0) break;
    out.push(can[Math.floor(next() * can.length)]!);
  }
  // an even group (a kind ran out) loses its last
  if (out.length % 2 === 0) out.pop();
  return out;
};
const isBooks = (k: Kind) => k === "books" || k === "stack";

const dressShelf = (
  run: Run,
  spare: boolean,
  above: Kind | null,
  next: () => number,
): Dressed => {
  let group = groupOf(run, spare, above, next);
  const wide = run.bayW - 2 * SIDE;
  // each thing's width; the group shortened by two while it overflows
  const widthOf = (k: Kind) =>
    k === "books"
      ? within(next(), BOOKS_W)
      : k === "stack"
        ? within(next(), STACK_W)
        : within(next(), SIZES[k].w);
  // a run of books alone takes most of the shelf
  let widths = group.map((k) =>
    group.length === 1 && k === "books"
      ? wide * within(next(), [ALONE_SHARE, 1])
      : widthOf(k),
  );
  let gaps = group.map(() => within(next(), GAP));
  const span = () =>
    widths.reduce((a, b) => a + b, 0) +
    gaps.slice(1).reduce((a, b) => a + b, 0);
  // too wide: a standing run gives up width first, down to a handful
  // of books, then the rest shrink to their smallest and close up
  const standing = group.indexOf("books");
  if (standing >= 0 && span() > wide)
    widths[standing] = Math.max(
      fewest("books"),
      widths[standing]! - (span() - wide),
    );
  if (span() > wide) {
    widths = group.map((k, i) => (k === "books" ? widths[i]! : fewest(k)));
    gaps = gaps.map(() => GAP[0]);
  }
  while (group.length > 1 && span() > wide) {
    group = group.slice(0, -2);
    widths = widths.slice(0, -2);
    gaps = gaps.slice(0, -2);
  }
  if (group.length === 1 && span() > wide) widths[0] = wide;
  // the group set to one side or the middle, as a stylist would
  const room = wide - span();
  const at = next();
  let x = run.x0 + SIDE + (at < 0.35 ? 0 : at < 0.7 ? room : room / 2);
  const books: Run[] = [];
  const objects: ShelfObject[] = [];
  group.forEach((k, i) => {
    if (i > 0) x += gaps[i]!;
    const w = widths[i]!;
    if (isBooks(k)) {
      books.push({
        ...run,
        x0: x,
        bayW: w,
        seed: run.seed + i * 31,
        lay: k === "stack" ? "flat" : "standing",
      });
    } else {
      const size = SIZES[k];
      const h = Math.min(within(next(), size.h), run.room - HEADROOM);
      const d = Math.min(w, run.deep * 0.8);
      objects.push({
        kind: k,
        x: x + w / 2,
        y: run.y,
        z: run.z,
        w,
        h,
        d,
        turn: (next() < 0.5 ? -1 : 1) * within(next(), TURN),
        tone: Math.floor(next() * TONES),
      });
    }
    x += w;
  });
  return { group, books, objects };
};
