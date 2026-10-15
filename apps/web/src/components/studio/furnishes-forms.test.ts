import { defaultConfig, depthOf, products } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { type FormPart, furnishesForm } from "./furnishes-forms";

const m = (mm: number) => mm / 1000;
const formOf = (id: string, accessories?: string[], doors = false) => {
  const r = products.find((p) => p.id === id)!;
  return furnishesForm({
    recipe: r,
    size: [m(r.width), m(r.height), m(depthOf(r))],
    doors,
    accessories: accessories ?? defaultConfig(r).accessories,
    colours: ["#d9b98a"],
    seed: 7,
  });
};

/** the box round a part, its half sizes (a turned part by its longest) */
const half = (p: FormPart): [number, number, number] => {
  if ("dims" in p) {
    const [w, h, d] = p.dims;
    if (!p.rotation) return [w / 2, h / 2, d / 2];
    // turned about the upright only (a screen's leaf): as tall as it is
    if (p.rotation[0] === 0 && p.rotation[2] === 0) {
      const across = Math.hypot(w, d) / 2;
      return [across, h / 2, across];
    }
    const r = Math.hypot(w, h, d) / 2;
    return [r, r, r];
  }
  const [r, h] = p.rod;
  // upright, a rod's height is its length; turned, its longest reach
  if (!p.rotation) return [r, h / 2, r];
  const big = Math.max(r, h / 2);
  return [big, big, big];
};

describe("the Furnishes forms", () => {
  it("builds every recipe inside its own box, standing on the floor", () => {
    for (const r of products) {
      const f = formOf(r.id);
      const [w, h, d] = [m(r.width), m(r.height), m(depthOf(r))];
      expect(f.parts.length, r.id).toBeGreaterThan(8);
      // a turned part is measured by its longest reach, an add-on may
      // stand a little off a side, as a rail or a hook does, and a thing
      // may stand on the top, as a bedside's lamp does
      const slack = 0.08;
      const onTop = 0.45;
      for (const p of f.parts) {
        const [hx, hy, hz] = half(p);
        expect(Math.abs(p.at[0]) - hx, `${r.id} x`).toBeLessThan(w / 2 + slack);
        expect(p.at[1] - hy, `${r.id} y`).toBeGreaterThan(-0.001);
        expect(p.at[1] + hy, `${r.id} top`).toBeLessThan(h + onTop);
        expect(Math.abs(p.at[2]) - hz, `${r.id} z`).toBeLessThan(d / 2 + slack);
      }
    }
  });

  it("puts a piece that moves on four castors a bay, and one that stays on its base", () => {
    const castors = (id: string) =>
      formOf(id).parts.filter(
        (p) => p.role === "dark" && "rod" in p && p.rotation !== undefined,
      ).length;
    expect(castors("kitchen")).toBe(4);
    expect(castors("work-cart")).toBe(4);
    expect(castors("mobile-screen")).toBe(4);
    expect(castors("island")).toBe(8);
    expect(castors("entry")).toBe(0);
    expect(castors("sideboard")).toBe(0);
  });

  it("tells the pieces of one size apart by what they are for", () => {
    const sig = (id: string) => JSON.stringify(formOf(id).parts);
    // three 600 × 1200 × 400 bodies, and two 600 × 800 × 400 trolleys
    expect(sig("entry")).not.toBe(sig("desk"));
    expect(sig("entry")).not.toBe(sig("mobile-screen"));
    expect(sig("desk")).not.toBe(sig("mobile-screen"));
    expect(sig("kitchen")).not.toBe(sig("work-cart"));
    // the coat stand is not a taller entry organiser: its one low shelf
    const shelves = (id: string) =>
      formOf(id).parts.filter(
        (p) =>
          p.role === "body" && "dims" in p && p.dims[1] < 0.02 && p.at[1] > 0.1,
      ).length;
    expect(shelves("coat-rack")).toBeLessThan(shelves("entry"));
  });

  it("draws the bookwall's books on both sides of its middle panel", () => {
    const f = formOf("bookwall");
    expect(f.books.some((b) => b.z > 0)).toBe(true);
    expect(f.books.some((b) => b.z < 0)).toBe(true);
  });

  it("draws the charging dock on the top only when it is chosen", () => {
    const dockOf = (accessories: string[]) =>
      formOf("sideboard", accessories).parts.filter(
        (p) => p.role === "base" && "dims" in p && p.dims[0] === 0.28,
      );
    expect(dockOf([])).toHaveLength(0);
    const [dock] = dockOf(["charging-dock"]);
    expect(dock).toBeDefined();
    // standing on the sideboard's top, not in it
    expect(dock!.at[1]).toBeGreaterThan(m(800) - 0.01);
  });

  it("gives a door a face a bay when the doors are on, none when off", () => {
    expect(formOf("sideboard", [], true).doors).toHaveLength(3);
    expect(formOf("sideboard", [], false).doors).toHaveLength(0);
    // a design that takes no door has none whatever is asked
    expect(formOf("bookwall", [], true).doors).toHaveLength(0);
  });

  it("builds the workstation's desk across the front of its tower", () => {
    const r = products.find((p) => p.id === "workstation")!;
    const desk = formOf("workstation").parts.find(
      (p) =>
        p.role === "body" &&
        "dims" in p &&
        Math.abs(p.dims[0] - m(r.width)) < 1e-6,
    );
    expect(desk).toBeDefined();
    expect(desk!.at[1]).toBeGreaterThan(0.6);
    expect(desk!.at[1]).toBeLessThan(0.8);
    expect(desk!.at[2]).toBeGreaterThan(0);
  });
});
