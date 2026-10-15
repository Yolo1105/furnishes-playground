import { describe, expect, it } from "vitest";
import {
  bayWidth,
  checkRecipe,
  designOf,
  designPanels,
  recipeFromWords,
  type DesignRecipe,
} from "./design";
import { boundsOf, overlapBoxes } from "./panels";

const BOOKCASE: DesignRecipe = {
  name: "Low bookcase",
  width: 1600,
  height: 800,
  depth: 320,
  bays: 3,
  shelves: 1,
  doors: 2,
  drawers: 0,
  plinth: true,
  finish: "oak",
};

describe("recipeFromWords", () => {
  it("reads the brief's example as a piece that can be made", () => {
    const r = recipeFromWords("A 1.6 m low bookcase with two doors, oak");
    expect(r).toMatchObject({
      name: "Low bookcase",
      width: 1600,
      height: 800,
      depth: 320,
      bays: 3,
      doors: 2,
      drawers: 0,
      finish: "oak",
      plinth: true,
    });
    expect(checkRecipe(r)).toEqual([]);
  });
  it("reads sizes by the word that names them, in any unit", () => {
    const r = recipeFromWords(
      "a sideboard 180 cm wide, 75 cm tall and 450 mm deep with 2 drawers",
    );
    expect([r.width, r.height, r.depth]).toEqual([1800, 750, 450]);
    expect(r.drawers).toBe(2);
    expect(checkRecipe(r)).toEqual([]);
  });
  it("gives a piece that passes the rules whatever is asked", () => {
    for (const t of [
      "a tall bookcase with 8 shelves 40 cm tall",
      "a 3 m wardrobe with doors",
      "a tiny bedside with a drawer, walnut, on legs",
      "something",
    ])
      expect(checkRecipe(recipeFromWords(t))).toEqual([]);
  });
});

describe("checkRecipe", () => {
  it("passes a piece within the rules", () => {
    expect(checkRecipe(BOOKCASE)).toEqual([]);
  });
  it("names a shelf longer than a board spans, and the bays that fix it", () => {
    const p = checkRecipe({ ...BOOKCASE, bays: 1, doors: 0 });
    expect(p.map((x) => x.field)).toEqual(["bays"]);
    expect(p[0]!.message).toMatch(/at least 2 bays/);
  });
  it("names a door wider than its hinges hold", () => {
    const p = checkRecipe({ ...BOOKCASE, bays: 2, doors: 2 });
    expect(p.map((x) => x.field)).toEqual(["doors"]);
  });
  it("names sizes out of range and counts that are not whole", () => {
    const p = checkRecipe({ ...BOOKCASE, width: 3000, shelves: 1.5 });
    expect(p.map((x) => x.field).sort()).toEqual(["shelves", "width"]);
  });
  it("names more doors and drawers than bays", () => {
    const p = checkRecipe({ ...BOOKCASE, doors: 2, drawers: 2 });
    expect(p.map((x) => x.field)).toEqual(["doors"]);
  });
  it("names shelves too close together", () => {
    const p = checkRecipe({ ...BOOKCASE, shelves: 6 });
    expect(p.map((x) => x.field)).toEqual(["shelves"]);
  });
});

describe("designPanels", () => {
  it("is the size of the recipe, its parts never in each other's space", () => {
    const panels = designPanels(BOOKCASE);
    expect(boundsOf(panels)).toEqual({
      min: [-800, 0, -160],
      max: [800, 800, 160],
    });
    expect(overlapBoxes(panels)).toHaveLength(0);
    expect(panels.filter((p) => p.name === "Door")).toHaveLength(2);
    expect(panels.filter((p) => p.name === "Divider")).toHaveLength(2);
  });
  it("puts a drawer at a bay's foot and shelves on the 32 mm step", () => {
    const r = { ...BOOKCASE, doors: 1, drawers: 1, shelves: 2, height: 1200 };
    const panels = designPanels(r);
    expect(panels.filter((p) => p.name === "Drawer front")).toHaveLength(1);
    expect(overlapBoxes(panels)).toHaveLength(0);
    // a bay's shelves stand on a whole number of steps over its floor
    const open = panels.filter((p) => p.id.startsWith("shelf-2-"));
    for (const s of open) expect((s.position[1] - 78) % 32).toBe(0);
  });
  it("stands on the floor without a plinth", () => {
    const panels = designPanels({ ...BOOKCASE, plinth: false });
    expect(panels.some((p) => p.name === "Plinth")).toBe(false);
    expect(boundsOf(panels)?.min[1]).toBe(0);
  });
});

describe("designOf", () => {
  it("prices the panels and cuts them all from sheets", () => {
    const d = designOf(BOOKCASE);
    expect(d.price).toBeGreaterThan(0);
    expect(d.cut.unplaced).toEqual([]);
    expect(d.cut.sheets.length).toBeGreaterThan(0);
    expect(bayWidth(BOOKCASE)).toBeCloseTo((1600 - 72) / 3);
  });
});
