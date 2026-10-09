import {
  type CutList,
  KERF,
  MARGIN,
  nest,
  type Panel,
  SHEET,
  type SheetLayout,
} from "@furnishes/domain";

/**
 * The cut list as a page to print: one sheet of stock per drawing,
 * the parts laid on it as the nesting put them with their names,
 * sizes and grain arrows; a table of the parts (each size and grain
 * once, with its count), their edge banding and machining; and the
 * totals. Plain HTML with the page set up for printing (A4 landscape,
 * one sheet a page), so the browser's own Print to PDF makes the file
 * and no PDF library rides in the studio.
 */
/** the stock's size drawn at this many pixels a millimetre */
const PX_PER_MM = 0.36;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** the edges a panel is banded on: a door all round, a board on the
    long edge the room sees */
export const bandingOf = (p: Pick<Panel, "kind">) =>
  p.kind === "door" ? "all four edges" : "front edge";

/** a panel's machining in words: how many of each */
export const machiningOf = (p: Pick<Panel, "features">) => {
  const f = p.features ?? [];
  if (!f.length) return "none";
  const holes = f.filter((x) => x.kind === "hole");
  const grooves = f.filter((x) => x.kind === "groove");
  const cutouts = f.filter((x) => x.kind === "cutout");
  const parts: string[] = [];
  const sizes = [...new Set(holes.map((h) => h.d))].sort((a, b) => a - b);
  for (const d of sizes) {
    const n = holes.filter((h) => h.d === d).length;
    parts.push(`${n} × ${d} mm ${n === 1 ? "hole" : "holes"}`);
  }
  if (grooves.length)
    parts.push(
      `${grooves.length} ${grooves.length === 1 ? "groove" : "grooves"}`,
    );
  if (cutouts.length)
    parts.push(
      `${cutouts.length} ${cutouts.length === 1 ? "cut-out" : "cut-outs"}`,
    );
  return parts.join(", ");
};

/** the parts table's rows: one a size, grain and kind, with its count */
export type PartRow = {
  names: string[];
  length: number;
  width: number;
  thickness: number;
  grain: Panel["grain"];
  banding: string;
  machining: string;
};
export const partRows = (panels: readonly Panel[]): PartRow[] => {
  const rows = new Map<string, PartRow>();
  for (const p of panels) {
    const key = [
      Math.round(p.length),
      Math.round(p.width),
      Math.round(p.thickness),
      p.grain,
      p.kind,
      machiningOf(p),
    ].join("|");
    const row = rows.get(key);
    if (row) row.names.push(p.name);
    else
      rows.set(key, {
        names: [p.name],
        length: Math.round(p.length),
        width: Math.round(p.width),
        thickness: Math.round(p.thickness),
        grain: p.grain,
        banding: bandingOf(p),
        machining: machiningOf(p),
      });
  }
  return [...rows.values()].sort(
    (a, b) => b.length * b.width - a.length * a.width,
  );
};

/** one sheet drawn: its outline, the margin, each part with its name,
    size and grain arrow */
const sheetSvg = (s: SheetLayout, panels: readonly Panel[]) => {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const W = s.sheet.length * PX_PER_MM;
  const H = s.sheet.width * PX_PER_MM;
  const parts = s.placements
    .map((pl) => {
      const p = byId.get(pl.panelId);
      const x = pl.x * PX_PER_MM;
      const y = pl.y * PX_PER_MM;
      const w = pl.w * PX_PER_MM;
      const h = pl.h * PX_PER_MM;
      // the grain on the sheet runs along its length; a part that keeps
      // its grain shows the arrow the way its grain lies on the sheet
      const grain = p?.grain ?? "none";
      const along = grain === "none" ? null : pl.rotated ? "down" : "across";
      const arrow =
        along === null
          ? ""
          : along === "across"
            ? `<line x1="${x + 6}" y1="${y + h - 8}" x2="${x + Math.min(w - 6, 40)}" y2="${y + h - 8}" class="grain" marker-end="url(#arrow)"/>`
            : `<line x1="${x + 8}" y1="${y + h - 6}" x2="${x + 8}" y2="${y + Math.max(6, h - 40)}" class="grain" marker-end="url(#arrow)"/>`;
      const small = w < 60 || h < 24;
      return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" class="part"/>
  ${arrow}
  <text x="${x + w / 2}" y="${y + h / 2 - (small ? 0 : 5)}" class="name${small ? " small" : ""}">${esc(pl.name)}</text>
  ${small ? "" : `<text x="${x + w / 2}" y="${y + h / 2 + 9}" class="size">${Math.round(pl.w)} × ${Math.round(pl.h)}</text>`}
</g>`;
    })
    .join("\n");
  const m = MARGIN * PX_PER_MM;
  return `<svg class="sheet" viewBox="${-2} ${-2} ${W + 4} ${H + 4}" width="${W}" height="${H}" role="img" aria-label="Sheet ${s.index + 1}">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>
  <rect x="0" y="0" width="${W}" height="${H}" class="stock"/>
  <rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" class="margin"/>
  ${parts}
</svg>`;
};

/** the page: the drawings, the table and the totals */
export const cutListHtml = (
  piece: string,
  panels: readonly Panel[],
  list: CutList = nest(panels, SHEET),
) => {
  const rows = partRows(panels);
  const area = panels.reduce((t, p) => t + (p.length * p.width) / 1e6, 0);
  const used = list.sheets.length
    ? list.sheets.reduce((t, s) => t + s.used, 0) / list.sheets.length
    : 0;
  const sheets = list.sheets
    .map(
      (s) => `<section class="page">
  <h2>Sheet ${s.index + 1} of ${list.sheets.length} <small>${s.sheet.length} × ${s.sheet.width} × ${s.sheet.thickness} mm · ${Math.round(s.used * 100)}% used · ${s.placements.length} ${s.placements.length === 1 ? "part" : "parts"}</small></h2>
  ${sheetSvg(s, panels)}
</section>`,
    )
    .join("\n");
  const table = rows
    .map(
      (r) => `<tr>
  <td>${esc(r.names.join(", "))}</td>
  <td class="num">${r.length} × ${r.width} × ${r.thickness}</td>
  <td class="num">${r.names.length}</td>
  <td>${r.grain === "none" ? "any way" : `along the ${r.grain}`}</td>
  <td>${esc(r.banding)}</td>
  <td>${esc(r.machining)}</td>
</tr>`,
    )
    .join("\n");
  const unplaced = list.unplaced.length
    ? `<p class="warn">Too big for a sheet: ${list.unplaced.map((u) => esc(u.name)).join(", ")}.</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(piece)} · cut list</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 12px/1.4 ${FONT}; color: #1a1a1a; background: #fff; }
  header, .page, .parts { padding: 0 0 12px; }
  header { display: flex; align-items: baseline; gap: 16px; border-bottom: 1px solid #ddd; margin-bottom: 12px; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 14px; margin: 0 0 8px; }
  h2 small, header p { font-weight: 400; color: #666; font-size: 12px; }
  .page { break-after: page; }
  .page:last-of-type { break-after: auto; }
  .sheet { display: block; max-width: 100%; height: auto; }
  .stock { fill: #faf6ef; stroke: #1a1a1a; stroke-width: 1.5; }
  .margin { fill: none; stroke: #bbb; stroke-dasharray: 4 3; }
  .part { fill: #fff; stroke: #1a1a1a; stroke-width: 1; }
  .name { font: 600 10px ${FONT}; text-anchor: middle; dominant-baseline: middle; }
  .name.small { font-size: 7px; }
  .size { font: 9px ${FONT}; text-anchor: middle; fill: #555; font-variant-numeric: tabular-nums; }
  .grain { stroke: #8a6d3b; stroke-width: 1.2; }
  marker path { fill: #8a6d3b; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
  td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-top: 10px; color: #444; }
  .warn { color: #b3261e; }
  .print { font: inherit; padding: 6px 12px; margin-left: auto; }
  @media print { .print { display: none; } }
</style>
</head>
<body>
<header>
  <h1>${esc(piece)}</h1>
  <p>Cut list · ${panels.length} ${panels.length === 1 ? "part" : "parts"} on ${list.sheets.length} ${list.sheets.length === 1 ? "sheet" : "sheets"} of ${SHEET.length} × ${SHEET.width} × ${SHEET.thickness} mm · ${KERF} mm kerf · ${MARGIN} mm margin</p>
  <button type="button" class="print" onclick="window.print()">Print</button>
</header>
${sheets}
<section class="parts">
  <h2>Parts</h2>
  <table>
    <thead><tr><th>Part</th><th>L × W × T mm</th><th>Qty</th><th>Grain</th><th>Edge banding</th><th>Machining</th></tr></thead>
    <tbody>
${table}
    </tbody>
  </table>
  ${unplaced}
  <p class="totals">${panels.length} parts · ${area.toFixed(2)} m² of board · ${list.sheets.length} ${list.sheets.length === 1 ? "sheet" : "sheets"} · ${Math.round(used * 100)}% of each sheet used on average.</p>
</section>
</body>
</html>
`;
};

/** the page opened in a window of its own, ready to print */
export const printCutList = (piece: string, panels: readonly Panel[]) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(cutListHtml(piece, panels));
  w.document.close();
};
