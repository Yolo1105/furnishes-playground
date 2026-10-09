import { describe, expect, it } from "vitest";
import {
  backGroove,
  carcassPanels,
  cutListCsv,
  hingeCups,
  nest,
  SHEET,
  systemHoles,
} from "@furnishes/domain";
import { cutListHtml, machiningOf, partRows } from "./cut-list-print";

/**
 * The printable cut list: every sheet the nesting made is drawn and
 * every part is on a sheet and in the table, and the parts it lists
 * are the parts the CSV lists.
 */
const cabinet = () =>
  carcassPanels({
    width: 900,
    depth: 400,
    height: 800,
    bays: 2,
    doors: true,
  }).map((p) => ({
    ...p,
    features:
      p.kind === "door" ? hingeCups(p) : [...systemHoles(p), backGroove(p)],
  }));

describe("the printable cut list", () => {
  it("draws every sheet and lists every part, as the CSV does", () => {
    const panels = cabinet();
    const list = nest(panels, SHEET);
    const html = cutListHtml("Base cabinet", panels, list);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@page { size: A4 landscape");
    // one drawing a sheet, each part drawn on its sheet
    expect(html.match(/<svg class="sheet"/g)).toHaveLength(list.sheets.length);
    for (const s of list.sheets)
      for (const pl of s.placements) expect(html).toContain(`>${pl.name}<`);
    // the table counts every part once, by its size
    const rows = partRows(panels);
    expect(rows.reduce((n, r) => n + r.names.length, 0)).toBe(panels.length);
    for (const p of panels) expect(html).toContain(p.name);
    // the CSV's parts are the page's parts
    const csv = cutListCsv(list, panels);
    const csvNames = csv
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[1]!.replace(/"/g, ""))
      .sort();
    expect(csvNames).toEqual(panels.map((p) => p.name).sort());
    // the machining reads in words
    const side = [...panels].sort(
      (a, b) => b.features.length - a.features.length,
    )[0]!;
    expect(machiningOf(side)).toMatch(/\d+ × 5 mm holes, 1 groove/);
    expect(html).toContain(machiningOf(side));
    expect(html).toContain("all four edges");
  });
});
