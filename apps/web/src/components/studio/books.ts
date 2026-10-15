import { BufferGeometry, Float32BufferAttribute } from "three";
import { seeded, within } from "./seeded";

/**
 * Books on a shelf as a stylist leaves them, and as one mesh: each book
 * a block of pages between its covers with a softly rounded spine, its
 * spine, covers and page edges cut from one picture of many spines
 * (book-spines.ts paints it), so a shelf of books is one draw.
 *
 * The run is laid as real shelves are: books of a set standing together
 * at about one height, sizes from a paperback to an atlas (170–300 mm
 * tall, 12–60 mm thick, of their own depths), their spines near the
 * front, a gap here and there, the last one leaning on its neighbour;
 * now and then a few laid flat in a stack instead. Plain data and
 * geometry (no canvas), so it is tested here.
 */

/** the picture the spines are cut from, px, and its cells */
export const ATLAS = 1024;
/** the spines' rows: two, each this tall, px */
const ROW_H = 480;
/** the page edges' strip under the rows, px */
const PAGES_Y = 2 * ROW_H;
const PAGES_H = ATLAS - PAGES_Y;
/** the page edges' cells: cream, white, aged, and a dusty top */
export const PAGE_CELLS = 4;
/** a spine's width class, px across its cell */
const CLASS_W = { thin: 32, medium: 48, thick: 72 } as const;
type SpineClass = keyof typeof CLASS_W;
/** a row's cells, in order: 14 thin, 8 medium and 2 thick spines */
const ROW: SpineClass[] = [
  "thin",
  "medium",
  "thin",
  "thin",
  "thick",
  "thin",
  "medium",
  "thin",
  "medium",
  "thin",
  "thin",
  "medium",
  "thin",
  "medium",
  "thin",
  "thin",
  "medium",
  "thin",
  "thick",
  "thin",
  "medium",
  "thin",
  "medium",
  "thin",
];
/** a cell of the picture, px from its top left */
export type Cell = {
  x: number;
  y: number;
  w: number;
  h: number;
  cls: SpineClass;
};
export const SPINE_CELLS: readonly Cell[] = [0, 1].flatMap((r) => {
  let x = 0;
  return ROW.map((cls): Cell => {
    const c = { x, y: r * ROW_H, w: CLASS_W[cls], h: ROW_H, cls };
    x += CLASS_W[cls];
    return c;
  });
});
export const pageCell = (i: number): Cell => {
  const w = ATLAS / PAGE_CELLS;
  return { x: i * w, y: PAGES_Y, w, h: PAGES_H, cls: "thin" };
};
/** the share of a spine's cell at its foot left plain, its cloth's own
    colour, which the covers are cut from */
export const COVER_SHARE = 0.06;

/** one book: where its foot's middle stands (m, in the run's frame),
    its thickness, height and depth, how far it leans or lies, and its
    spine's and page edges' cells */
export type Book = {
  x: number;
  y: number;
  z: number;
  t: number;
  h: number;
  d: number;
  /** a lean about the depth, radians: positive tips its top to -x */
  lean: number;
  /** laid flat: its height runs along the shelf, its spine to the front */
  flat: boolean;
  /** a small turn about the vertical, radians (a stack's books) */
  turn: number;
  spine: number;
  pages: number;
};

/** the run a shelf gives (furnishes-forms.ts's BookRun) */
export type Run = {
  x0: number;
  y: number;
  bayW: number;
  z: number;
  deep: number;
  room: number;
  seed: number;
  /** standing, or laid flat in a stack (shelf-style.ts); left to the
      seed when not said */
  lay?: "standing" | "flat" | undefined;
};

/** sizes, m: heights, thicknesses and depths a shelf's books come in */
const SIZE = {
  h: [0.17, 0.3],
  t: [0.012, 0.06],
  d: [0.12, 0.24],
} as const;
/** how far in from the bay's side a run starts, m */
const SIDE = 0.015;
/** how often a shelf's books lie flat in a stack instead */
const FLAT_SHARE = 0.25;
/** the last book's lean, radians: 3° to 8° */
const LEAN = [(3 * Math.PI) / 180, (8 * Math.PI) / 180] as const;

/** a spine cell for a book this thick, from its class, picked by `r` */
const spineFor = (t: number, r: number) => {
  const cls: SpineClass = t < 0.025 ? "thin" : t < 0.042 ? "medium" : "thick";
  const of = SPINE_CELLS.flatMap((c, i) => (c.cls === cls ? [i] : []));
  return of[Math.floor(r * of.length)]!;
};

/** a shelf's books, laid out from its run */
export const bookLayout = (run: Run): Book[] => {
  const next = seeded(run.seed * 7919 + 17);
  const maxH = run.room - 0.015;
  if (maxH < SIZE.h[0] - 0.02 || run.bayW < 0.2 || run.deep < 0.1) return [];
  const front = run.z + run.deep / 2;
  const deepest = Math.min(SIZE.d[1], run.deep - 0.01);
  const books: Book[] = [];
  const pages = () => Math.floor(next() * (PAGE_CELLS - 1));
  // a stack laid flat at one end, the rest of the bay left empty
  if (run.lay ? run.lay === "flat" : next() < FLAT_SHARE) {
    const n = 2 + Math.floor(next() * 4);
    const fromLeft = next() < 0.5;
    let y = run.y;
    // a stack the stylist set out spans its run; one left to the seed
    // takes some of the bay
    let len = run.lay
      ? run.bayW - 2 * SIDE
      : Math.min(run.bayW * 0.6, within(next(), [0.24, 0.3]));
    for (let i = 0; i < n && y - run.y < maxH - 0.06; i++) {
      const t = within(next(), [0.015, 0.045]);
      const d = Math.min(deepest, within(next(), SIZE.d));
      books.push({
        x: fromLeft
          ? run.x0 + SIDE + len / 2
          : run.x0 + run.bayW - SIDE - len / 2,
        y,
        z: front - d / 2 - 0.005 - next() * 0.01,
        t,
        h: len,
        d,
        lean: 0,
        flat: true,
        turn: (next() - 0.5) * 0.08,
        spine: spineFor(t, next()),
        pages: pages(),
      });
      y += t;
      len *= within(next(), [0.86, 0.98]);
    }
    return books;
  }
  // books standing: a run along most of the bay, in sets of a height
  // a run the stylist set out (shelf-style.ts) is filled; a bay left to
  // the books alone keeps some of its width free
  const until =
    run.x0 + run.bayW * (run.lay ? 1 : within(next(), [0.55, 0.85]));
  let x = run.x0 + SIDE;
  let setH = 0;
  let setLeft = 0;
  let setD = 0;
  while (x < until) {
    if (setLeft <= 0) {
      setH = within(next(), SIZE.h);
      setD = within(next(), SIZE.d);
      setLeft = 2 + Math.floor(next() * 6);
    }
    setLeft--;
    const h = Math.min(maxH, SIZE.h[1], setH * within(next(), [0.94, 1.04]));
    // most books are 20–35 mm; a few thin pamphlets and thick volumes
    const r = next();
    const t =
      r < 0.15
        ? within(next(), [SIZE.t[0], 0.02])
        : r < 0.88
          ? within(next(), [0.02, 0.036])
          : within(next(), [0.036, SIZE.t[1]]);
    if (x + t > run.x0 + run.bayW - SIDE) break;
    const d = Math.min(deepest, setD * within(next(), [0.95, 1.05]));
    books.push({
      x: x + t / 2,
      y: run.y,
      z: front - d / 2 - 0.008 - next() * 0.012,
      t,
      h,
      d,
      lean: 0,
      flat: false,
      turn: 0,
      spine: spineFor(t, next()),
      pages: pages(),
    });
    // a hair between most; now and then a finger's gap, a book out
    const g = next();
    x += t + (g < 0.75 ? 0.0015 : g < 0.93 ? 0.006 : 0.03);
  }
  // the last one leans on its neighbour, its foot kicked out a little
  const last = books[books.length - 1];
  const prev = books[books.length - 2];
  if (last && prev && run.x0 + run.bayW - (last.x + last.t / 2) > 0.06) {
    const a = within(next(), LEAN);
    last.lean = a;
    // it pivots on its foot's near corner and rests on the neighbour's
    // top (or the neighbour on its top, the taller of the two): the
    // corner stands out from the neighbour's side by as much
    const out = Math.min(prev.h * Math.tan(a), last.h * Math.sin(a));
    last.x = prev.x + prev.t / 2 + out + last.t / 2;
  }
  return books;
};

/* ---------- geometry ---------- */

/** how far a spine bulges, m, at most, and its segments across */
const BULGE = 0.0025;
const ACROSS = 4;

type Out = { pos: number[]; nor: number[]; uv: number[] };
type V = [number, number, number];
/** an atlas point, px, to the picture's coordinates (flipped in v, as a
    canvas texture is) */
const uvOf = (px: number, py: number): [number, number] => [
  px / ATLAS,
  1 - py / ATLAS,
];

const quad = (
  o: Out,
  [a, b, c, d]: [V, V, V, V],
  n: V,
  [ua, ub, uc, ud]: [number, number][],
) => {
  for (const [p, t] of [
    [a, ua],
    [b, ub],
    [c, uc],
    [a, ua],
    [c, uc],
    [d, ud],
  ] as const) {
    o.pos.push(...p);
    o.nor.push(...n);
    o.uv.push(...t!);
  }
};

/** one book's triangles in its own frame: x across its thickness, y up
    its height from its foot, z to its spine at the front */
const bookShape = (o: Out, b: Book) => {
  const { t, h, d } = b;
  const cell = SPINE_CELLS[b.spine]!;
  const page = pageCell(b.pages);
  const dusty = pageCell(PAGE_CELLS - 1);
  const bulge = Math.min(BULGE, t * 0.1);
  const zs = d / 2;
  const zOf = (x: number) => zs + bulge * (1 - ((2 * x) / t) ** 2);
  // the spine: a soft round across, the cell's full width, its top
  // and foot the cell's
  for (let i = 0; i < ACROSS; i++) {
    const x0 = -t / 2 + (t * i) / ACROSS;
    const x1 = -t / 2 + (t * (i + 1)) / ACROSS;
    const nOf = (x: number): V => {
      const slope = (-8 * bulge * x) / (t * t);
      const l = Math.hypot(slope, 1);
      return [-slope / l, 0, 1 / l];
    };
    const u0 = cell.x + (cell.w * i) / ACROSS;
    const u1 = cell.x + (cell.w * (i + 1)) / ACROSS;
    const nm = nOf((x0 + x1) / 2);
    quad(
      o,
      [
        [x0, 0, zOf(x0)],
        [x1, 0, zOf(x1)],
        [x1, h, zOf(x1)],
        [x0, h, zOf(x0)],
      ],
      nm,
      [
        uvOf(u0, cell.y + cell.h),
        uvOf(u1, cell.y + cell.h),
        uvOf(u1, cell.y),
        uvOf(u0, cell.y),
      ],
    );
  }
  // the covers: the cloth's plain foot of the cell
  const cy0 = cell.y + cell.h * (1 - COVER_SHARE);
  const cy1 = cell.y + cell.h;
  const cover = (s: -1 | 1) =>
    quad(
      o,
      s > 0
        ? [
            [t / 2, 0, zs],
            [t / 2, 0, -zs],
            [t / 2, h, -zs],
            [t / 2, h, zs],
          ]
        : [
            [-t / 2, 0, -zs],
            [-t / 2, 0, zs],
            [-t / 2, h, zs],
            [-t / 2, h, -zs],
          ],
      [s, 0, 0],
      [
        uvOf(cell.x + 2, cy1 - 1),
        uvOf(cell.x + cell.w - 2, cy1 - 1),
        uvOf(cell.x + cell.w - 2, cy0 + 1),
        uvOf(cell.x + 2, cy0 + 1),
      ],
    );
  cover(1);
  cover(-1);
  // the page edges: the top a dusty strip, the foot and the fore-edge
  // the book's own paper, the leaves running along
  const pages = (corners: [V, V, V, V], n: V, c: Cell, leavesAlong: boolean) =>
    quad(
      o,
      corners,
      n,
      leavesAlong
        ? [
            uvOf(c.x + 4, c.y + c.h - 4),
            uvOf(c.x + c.w - 4, c.y + c.h - 4),
            uvOf(c.x + c.w - 4, c.y + 4),
            uvOf(c.x + 4, c.y + 4),
          ]
        : [
            uvOf(c.x + 4, c.y + c.h - 4),
            uvOf(c.x + 4, c.y + 4),
            uvOf(c.x + c.w - 4, c.y + 4),
            uvOf(c.x + c.w - 4, c.y + c.h - 4),
          ],
    );
  pages(
    [
      [-t / 2, h, zs],
      [t / 2, h, zs],
      [t / 2, h, -zs],
      [-t / 2, h, -zs],
    ],
    [0, 1, 0],
    dusty,
    false,
  );
  pages(
    [
      [-t / 2, 0, -zs],
      [t / 2, 0, -zs],
      [t / 2, 0, zs],
      [-t / 2, 0, zs],
    ],
    [0, -1, 0],
    page,
    false,
  );
  pages(
    [
      [t / 2, 0, -zs],
      [-t / 2, 0, -zs],
      [-t / 2, h, -zs],
      [t / 2, h, -zs],
    ],
    [0, 0, -1],
    page,
    true,
  );
};

/** a point and a normal of a book's frame put where the book stands */
const placer = (b: Book) => {
  // standing: leaned about its foot's corner on the side it leans to;
  // flat: turned a quarter about the depth, so its height runs along x
  // and it lies on its cover, the spine still to the front
  const cl = Math.cos(b.lean);
  const sl = Math.sin(b.lean);
  const ct = Math.cos(b.turn);
  const st = Math.sin(b.turn);
  const pivot = b.lean > 0 ? -b.t / 2 : b.t / 2;
  const turn = ([x, y, z]: V): V => [x * ct + z * st, y, -x * st + z * ct];
  return {
    at: ([x, y, z]: V): V => {
      if (b.flat) {
        // a turn, not a mirror (a mirror turns the faces inside out):
        // y up the height becomes x, x across the thickness becomes down
        const [tx, ty, tz] = turn([y - b.h / 2, b.t / 2 - x, z]);
        return [b.x + tx, b.y + ty, b.z + tz];
      }
      const px = x - pivot;
      const lx = px * cl - y * sl + pivot;
      const ly = px * sl + y * cl;
      return [b.x + lx, b.y + ly, b.z + z];
    },
    n: ([x, y, z]: V): V => {
      if (b.flat) return turn([y, -x, z]);
      return [x * cl - y * sl, x * sl + y * cl, z];
    },
  };
};

/** a shelf's books as one geometry, in the piece's frame */
export const booksGeometry = (books: readonly Book[]) => {
  if (!books.length) return null;
  const all: Out = { pos: [], nor: [], uv: [] };
  for (const b of books) {
    const own: Out = { pos: [], nor: [], uv: [] };
    bookShape(own, b);
    const { at, n } = placer(b);
    for (let i = 0; i < own.pos.length; i += 3) {
      all.pos.push(...at([own.pos[i]!, own.pos[i + 1]!, own.pos[i + 2]!]));
      all.nor.push(...n([own.nor[i]!, own.nor[i + 1]!, own.nor[i + 2]!]));
    }
    all.uv.push(...own.uv);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(all.pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(all.nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(all.uv, 2));
  return g;
};
