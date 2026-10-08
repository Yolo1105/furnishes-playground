import { describe, expect, it } from "vitest";
import { carcassPanels } from "./carcass";
import { cutListCsv, KERF, MARGIN, nest, SHEET } from "./cutlist";
import { dxfOf } from "./dxf";
import { systemHoles } from "./features";
import { panelRows, type Panel } from "./panels";

let seq = 0;
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: "Part",
  normal: "z",
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  grain: "length",
  kind: "panel",
  ...over,
});

describe("nest", () => {
  it("lays parts on a sheet clear of the margin, a kerf between them", () => {
    const list = nest([panel(), panel()]);
    expect(list.sheets).toHaveLength(1);
    const [a, b] = list.sheets[0]!.placements;
    expect(a!.x).toBe(MARGIN);
    expect(a!.y).toBe(MARGIN);
    // the second stands beside or below the first, a kerf away
    expect(b!.x === a!.x + a!.w + KERF || b!.y === a!.y + a!.h + KERF).toBe(
      true,
    );
    expect(list.unplaced).toHaveLength(0);
  });
  it("keeps a grained part's grain along the sheet and turns a free one", () => {
    const grained = nest([
      panel({ length: 400, width: 1100, grain: "length" }),
    ]);
    expect(grained.sheets[0]!.placements[0]!.rotated).toBe(false);
    const free = nest([panel({ length: 1100, width: 1900, grain: "none" })]);
    expect(free.sheets[0]!.placements[0]!.rotated).toBe(true);
  });
  it("opens a second sheet when the first is full, and names a part too big", () => {
    const big = Array.from({ length: 5 }, () =>
      panel({ length: 1200, width: 1100, grain: "none" }),
    );
    const list = nest(big);
    expect(list.sheets.length).toBeGreaterThan(1);
    const huge = nest([panel({ length: 3000, width: 100 })]);
    expect(huge.unplaced).toHaveLength(1);
    expect(huge.sheets).toHaveLength(0);
  });
  it("writes the list as CSV with a part a line", () => {
    const ps = [panel({ name: "Side" }), panel({ name: "Top" })];
    const csv = cutListCsv(nest(ps), ps);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("sheet,part,length_mm");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"Side"');
    expect(lines[1]).toContain(`,${SHEET.thickness},`);
  });
});

describe("a cabinet of twenty panels", () => {
  it("is counted, nested and drawn in under the gate", () => {
    const panels = carcassPanels({
      width: 1800,
      depth: 400,
      height: 900,
      bays: 3,
      doors: true,
    });
    while (panels.length < 20)
      panels.push(panel({ name: "Shelf", id: `extra-${panels.length}` }));
    const sides = panels.filter((p) => p.name === "Side");
    const features = Object.fromEntries(
      sides.map((s) => [
        s.id,
        systemHoles({ length: s.length, width: s.width }),
      ]),
    );
    const t0 = performance.now();
    const rows = panelRows(panels);
    const list = nest(panels);
    const drawings = panels.map((p) =>
      dxfOf({ ...p, features: features[p.id] ?? [] }),
    );
    const ms = performance.now() - t0;
    expect(panels.length).toBe(20);
    expect(rows.length).toBeGreaterThan(0);
    expect(list.sheets.length).toBeGreaterThan(0);
    expect(drawings.every((d) => d.includes("EOF"))).toBe(true);
    expect(ms).toBeLessThan(200);
  });
});
