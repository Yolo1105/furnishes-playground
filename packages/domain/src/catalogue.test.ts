import { describe, expect, it } from "vitest";
import {
  ACCESSORIES,
  billOfParts,
  boxes,
  buildSteps,
  counts,
  defaultConfig,
  partPrices,
  priceOf,
  products,
  RECOMMENDATIONS,
  RELATIONSHIPS,
} from "./index";

describe("the catalogue", () => {
  it("holds the thirteen recipes, each with its own id", () => {
    expect(products).toHaveLength(13);
    expect(new Set(products.map((p) => p.id)).size).toBe(13);
  });

  it("names only accessories it has", () => {
    for (const p of products)
      for (const a of [...p.defaultAccessories, ...p.optionalAccessories])
        expect(ACCESSORIES[a], `${p.id} names ${a}`).toBeDefined();
  });

  it("recommends and relates only pieces it has", () => {
    const ids = new Set(products.map((p) => p.id));
    for (const [from, recs] of Object.entries(RECOMMENDATIONS)) {
      expect(ids.has(from)).toBe(true);
      for (const r of recs)
        expect(ids.has(r.id), `${from} → ${r.id}`).toBe(true);
    }
    for (const r of RELATIONSHIPS) {
      expect(ids.has(r.from)).toBe(true);
      expect(ids.has(r.to)).toBe(true);
    }
  });
});

describe("the parts, the steps and the price", () => {
  it("counts parts, steps and boxes for every recipe", () => {
    for (const p of products) {
      const c = defaultConfig(p);
      const rows = billOfParts(p, c);
      expect(rows.length, p.id).toBeGreaterThan(0);
      const n = counts(p, c);
      expect(n.parts).toBe(rows.reduce((s, r) => s + r.quantity, 0));
      expect(buildSteps(p, c).length).toBeGreaterThan(1);
      expect(boxes(p, c).length).toBeGreaterThan(0);
      expect(n.heaviestKg).toBeLessThanOrEqual(20);
    }
  });

  it("prices every recipe from its parts, in whole fives", () => {
    for (const p of products) {
      const price = priceOf(p);
      expect(price.sgd, p.id).toBeGreaterThan(50);
      expect(price.sgd % 5).toBe(0);
      expect(price.lines.length).toBeGreaterThan(2);
    }
  });

  it("prices a door and its hinges on top of an open front", () => {
    const p = products.find((x) => x.id === "sideboard")!;
    const open = priceOf(p, { doors: false, accessories: [] }).sgd;
    const doors = priceOf(p, { doors: true, accessories: [] }).sgd;
    expect(doors).toBeGreaterThan(open);
    expect(billOfParts(p, { doors: true, accessories: [] })).toContainEqual(
      expect.objectContaining({ group: "Doors", quantity: 3 }),
    );
  });

  it("shares a piece's price out over its parts", () => {
    const p = products.find((x) => x.id === "entry")!;
    const parts = partPrices(p);
    const sum = Object.values(parts).reduce((s, v) => s + v, 0);
    expect(Math.abs(sum - priceOf(p).sgd)).toBeLessThan(
      Object.keys(parts).length,
    );
  });

  it("gives the same answer twice", () => {
    const p = products.find((x) => x.id === "bookwall")!;
    expect(priceOf(p)).toEqual(priceOf(p));
  });
});
