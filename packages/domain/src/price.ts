import { defaultConfig, type Configuration, type Product } from "./catalogue";
import { billOfParts, type PartKind } from "./parts";
import { counts } from "./steps";

/**
 * What a piece would cost, counted from the parts it is made of.
 *
 * This is an ESTIMATE and is labelled as one everywhere it is shown. It
 * is not a price list: there is one table of rates below, and every
 * piece's figure is worked out from its own bill of parts, so correcting
 * a rate corrects every piece at once. Nothing is typed in per piece, so
 * no piece can drift.
 *
 * The rates are the house site's first guesses at European trade prices
 * in 2026, brought to Singapore dollars at 1.45 to the euro and rounded.
 * They are the part of this that most needs replacing with real ones.
 */
export const RATES = {
  /** one 2440 × 1220 × 18 mm sheet of birch plywood, delivered */
  sheet: 125,
  sheetM2: 2.977,
  /** offcuts: the drawn area is never the area bought */
  waste: 0.12,
  /** sanding and oil, both faces, per m² */
  finishM2: 3.5,
  /** a furniture bolt and the insert it turns into */
  bolt: 0.6,
  /** the one L-key, parked in the base */
  key: 1.6,
  /** a base, by tier */
  feet: 13,
  casters: 23,
  /** a rail, a hook strip, a tray: the small steel and the fixings */
  accessory: 9,
  /** hinges, catch and handle for one door leaf */
  doorParts: 10,
  /** one box, its tray and the printed sheet */
  box: 5.5,
  /** our own minutes on one part: cutting, edging, sanding, checking, packing */
  minutesPerPart: 1.6,
  /** what an hour of that costs us */
  hour: 60,
  /** rent, machines, drawings, returns, the studio and what is left over */
  overhead: 2.15,
} as const;

export type Line = { label: string; sgd: number };

export type Price = {
  /** what we would ask, S$, rounded to the nearest five */
  sgd: number;
  /** what it costs us, before the overhead, line by line */
  lines: Line[];
  /** what it is made of */
  m2: number;
  panels: number;
  bolts: number;
  boxes: number;
};

/** the face area of a part, m², from the spec it is drawn with
    ("564 × 380 × 18 mm") */
function area(spec: string | undefined): number {
  if (!spec) return 0;
  const mm = [...spec.matchAll(/(\d{2,4})\s*(?=×|mm)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0);
  if (mm.length < 2) return 0;
  const [a = 0, b = 0] = mm.sort((x, y) => y - x);
  return (a * b) / 1_000_000;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** what one part costs in material, by what it is */
const material = (kind: PartKind, spec: string) =>
  kind === "panel" || kind === "door"
    ? (area(spec) * (1 + RATES.waste) * RATES.sheet) / RATES.sheetM2 +
      area(spec) * 2 * RATES.finishM2 +
      (kind === "door" ? RATES.doorParts : 0)
    : kind === "base"
      ? /caster|wheel/i.test(spec)
        ? RATES.casters
        : RATES.feet
      : kind === "accessory"
        ? RATES.accessory
        : 0.5;

/** what one piece in one configuration is made of, priced line by line */
export function priceOf(
  p: Product,
  c: Configuration = defaultConfig(p),
): Price {
  const rows = billOfParts(p, c);
  const n = counts(p, c);
  let m2 = 0;
  let panels = 0;
  let bases = 0;
  let casters = 0;
  let doors = 0;
  let extras = 0;
  for (const r of rows) {
    if (r.kind === "panel" || r.kind === "door") {
      m2 += area(r.spec) * r.quantity;
      panels += r.quantity;
      if (r.kind === "door") doors += r.quantity;
    } else if (r.kind === "base") {
      bases += r.quantity;
      if (/caster|wheel/i.test(r.spec)) casters += r.quantity;
    } else if (r.kind === "accessory") {
      extras += r.quantity;
    }
  }
  const bought = m2 * (1 + RATES.waste);
  const lines: Line[] = [
    {
      label: "Birch plywood, cut",
      sgd: (bought / RATES.sheetM2) * RATES.sheet,
    },
    { label: "Sanded and oiled", sgd: m2 * 2 * RATES.finishM2 },
    {
      label: "Bolts, key and fittings",
      sgd:
        n.bolts * RATES.bolt +
        RATES.key +
        doors * RATES.doorParts +
        extras * RATES.accessory,
    },
    {
      label: "Base",
      sgd: casters * RATES.casters + (bases - casters) * RATES.feet,
    },
    {
      label: "Our work on it",
      sgd: ((n.parts * RATES.minutesPerPart) / 60) * RATES.hour,
    },
    { label: "Boxes", sgd: n.boxes * RATES.box },
  ].filter((l) => l.sgd > 0.01);
  const cost = lines.reduce((t, l) => t + l.sgd, 0);
  return {
    sgd: round5(cost * RATES.overhead),
    lines: lines.map((l) => ({ ...l, sgd: Math.round(l.sgd) })),
    m2: Math.round(m2 * 100) / 100,
    panels,
    bolts: n.bolts,
    boxes: n.boxes,
  };
}

/** what each part of one piece costs, from the same rates. The pieces
    of the price that belong to no single part (the bolts, our time, the
    boxes and the overhead) are shared out over the parts by what they
    are worth, so the parts add up to the piece. */
export function partPrices(
  p: Product,
  c: Configuration = defaultConfig(p),
): Record<string, number> {
  const rows = billOfParts(p, c);
  const own = new Map<string, number>();
  for (const r of rows) own.set(r.id, material(r.kind, r.spec) * r.quantity);
  const total = [...own.values()].reduce((t, v) => t + v, 0) || 1;
  const whole = priceOf(p, c).sgd;
  const out: Record<string, number> = {};
  for (const [id, v] of own)
    out[id] = Math.max(1, Math.round((v / total) * whole));
  return out;
}

/** one part on its own, as the + strip sells it: a shelf, a divider, a
    back panel, a door, a drawer; priced from the same rates with the
    same overhead, rounded to the nearest five */
export function partPrice(kind: PartKind, spec: string) {
  return round5(
    (material(kind, spec) + (RATES.minutesPerPart / 60) * RATES.hour) *
      RATES.overhead,
  );
}
