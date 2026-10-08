import type { Panel } from "./panels";

/**
 * The cut list: the panels nested onto sheets. A sheet is the shop's
 * stock (2440 × 1220 × 18 mm birch plywood, its grain along the
 * length); the parts are placed by MaxRects (best short side fit,
 * biggest part first), each with the saw's kerf reserved beside it
 * and a clear margin round the sheet, a grained part keeping its grain
 * along the sheet's. The nesting is Panelizer's (MIT, LICENSES.md),
 * rewritten to the house's shapes; the sheet is one of the shop's
 * rates (price.ts) so the cost and the cut agree.
 */
export type Sheet = { length: number; width: number; thickness: number };
/** the shop's sheet */
export const SHEET: Sheet = { length: 2440, width: 1220, thickness: 18 };
/** the saw's kerf and the sheet's clear margin, mm */
export const KERF = 3;
export const MARGIN = 10;

/** one part on a sheet, mm from the sheet's corner */
export type Placement = {
  panelId: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** turned a quarter from as drawn */
  rotated: boolean;
};

export type SheetLayout = {
  index: number;
  sheet: Sheet;
  placements: Placement[];
  /** the parts' area over the sheet's, 0 to 1 */
  used: number;
};

export type CutList = {
  sheets: SheetLayout[];
  /** parts too big for the sheet in any orientation */
  unplaced: { panelId: string; name: string }[];
};

type Footprint = { w: number; h: number; rotated: boolean };
type FreeRect = { x: number; y: number; w: number; h: number };
type Bin = {
  free: FreeRect[];
  placements: Placement[];
  usedArea: number;
};
type Fit = FreeRect & {
  reservedW: number;
  reservedH: number;
  rotated: boolean;
};

/** the ways a part may lie: a grained part keeps its grain along the
    sheet's length; one without turns too */
const footprints = (p: Panel): Footprint[] => {
  const { length: l, width: w, grain } = p;
  if (grain === "length") return [{ w: l, h: w, rotated: false }];
  if (grain === "width") return [{ w, h: l, rotated: true }];
  return [
    { w: l, h: w, rotated: false },
    { w, h: l, rotated: true },
  ];
};

const contains = (a: FreeRect, b: FreeRect) =>
  a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

/** what of `free` is left round `used`: up to four rectangles */
const splitFree = (free: FreeRect, used: FreeRect): FreeRect[] => {
  const apart =
    used.x >= free.x + free.w ||
    used.x + used.w <= free.x ||
    used.y >= free.y + free.h ||
    used.y + used.h <= free.y;
  if (apart) return [free];
  const out: FreeRect[] = [];
  if (used.y > free.y)
    out.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  if (used.y + used.h < free.y + free.h)
    out.push({
      x: free.x,
      y: used.y + used.h,
      w: free.w,
      h: free.y + free.h - (used.y + used.h),
    });
  if (used.x > free.x)
    out.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  if (used.x + used.w < free.x + free.w)
    out.push({
      x: used.x + used.w,
      y: free.y,
      w: free.x + free.w - (used.x + used.w),
      h: free.h,
    });
  return out;
};

/** the tightest spot for a part in a bin: the free rectangle leaving
    the least on its shorter side, then on its longer */
const bestFit = (bin: Bin, p: Panel, kerf: number): Fit | null => {
  let best: Fit | null = null;
  let bestShort = Infinity;
  let bestLong = Infinity;
  for (const f of footprints(p)) {
    const reservedW = f.w + kerf;
    const reservedH = f.h + kerf;
    for (const fr of bin.free) {
      if (reservedW > fr.w || reservedH > fr.h) continue;
      const short = Math.min(fr.w - reservedW, fr.h - reservedH);
      const long = Math.max(fr.w - reservedW, fr.h - reservedH);
      if (short < bestShort || (short === bestShort && long < bestLong)) {
        bestShort = short;
        bestLong = long;
        best = {
          x: fr.x,
          y: fr.y,
          w: f.w,
          h: f.h,
          reservedW,
          reservedH,
          rotated: f.rotated,
        };
      }
    }
  }
  return best;
};

const place = (bin: Bin, p: Panel, kerf: number, margin: number) => {
  const fit = bestFit(bin, p, kerf);
  if (!fit) return false;
  const used = { x: fit.x, y: fit.y, w: fit.reservedW, h: fit.reservedH };
  const split = bin.free.flatMap((fr) => splitFree(fr, used));
  bin.free = split.filter(
    (r, i) => !split.some((o, j) => j !== i && contains(o, r)),
  );
  bin.placements.push({
    panelId: p.id,
    name: p.name,
    x: margin + fit.x,
    y: margin + fit.y,
    w: fit.w,
    h: fit.h,
    rotated: fit.rotated,
  });
  bin.usedArea += p.length * p.width;
  return true;
};

/** the panels of one thickness nested onto sheets, biggest first,
    each into the first open sheet with room, else a new one */
export const nest = (
  panels: readonly Panel[],
  sheet: Sheet = SHEET,
  kerf = KERF,
  margin = MARGIN,
): CutList => {
  const uL = sheet.length - 2 * margin;
  const uW = sheet.width - 2 * margin;
  const bins: Bin[] = [];
  const unplaced: CutList["unplaced"] = [];
  const sorted = [...panels].sort(
    (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width),
  );
  for (const p of sorted) {
    if (!footprints(p).some((f) => f.w <= uL && f.h <= uW)) {
      unplaced.push({ panelId: p.id, name: p.name });
      continue;
    }
    if (bins.some((bin) => place(bin, p, kerf, margin))) continue;
    const bin: Bin = {
      // one kerf more, so a part reserved with its kerf still sits
      // flush to the far margin
      free: [{ x: 0, y: 0, w: uL + kerf, h: uW + kerf }],
      placements: [],
      usedArea: 0,
    };
    place(bin, p, kerf, margin);
    bins.push(bin);
  }
  return {
    sheets: bins.map((b, i) => ({
      index: i + 1,
      sheet,
      placements: b.placements,
      used: b.usedArea / (sheet.length * sheet.width),
    })),
    unplaced,
  };
};

/** the cut list as CSV: a line a part, with its sheet and place */
export const cutListCsv = (list: CutList, panels: readonly Panel[]) => {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const rows = [
    "sheet,part,length_mm,width_mm,thickness_mm,grain,x_mm,y_mm,rotated",
  ];
  for (const s of list.sheets)
    for (const pl of s.placements) {
      const p = byId.get(pl.panelId);
      rows.push(
        [
          s.index,
          `"${pl.name}"`,
          p?.length ?? pl.w,
          p?.width ?? pl.h,
          p?.thickness ?? s.sheet.thickness,
          p?.grain ?? "",
          pl.x,
          pl.y,
          pl.rotated ? "yes" : "no",
        ].join(","),
      );
    }
  for (const u of list.unplaced)
    rows.push(
      [`"too big"`, `"${u.name}"`, "", "", "", "", "", "", ""].join(","),
    );
  return rows.join("\n");
};
