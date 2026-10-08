import { describe, expect, it } from "vitest";
import {
  carcassPanels,
  newPanel,
  PLINTH_MM,
  priceOfPanels,
  settledPanels,
  shelvesFor,
} from "./carcass";
import { boundsOf, overlapBoxes, type Vec3 } from "./panels";
import { partPrice } from "./price";

describe("carcassPanels", () => {
  it("fills the size it is asked for, standing on the floor", () => {
    const panels = carcassPanels({
      width: 600,
      depth: 400,
      height: 900,
      bays: 1,
      doors: false,
    });
    expect(boundsOf(panels)).toEqual({
      min: [-300, 0, -200],
      max: [300, 900, 200],
    });
    const names = panels.map((p) => p.name);
    expect(names).toEqual([
      "Plinth",
      "Bottom",
      "Top",
      "Back",
      "Side",
      "Side",
      "Shelf",
    ]);
    expect(overlapBoxes(panels)).toHaveLength(0);
    expect(shelvesFor(900 - PLINTH_MM - 36)).toBe(1);
  });
  it("puts a divider between bays and a door on each", () => {
    const panels = carcassPanels({
      width: 1200,
      depth: 400,
      height: 1500,
      bays: 2,
      doors: true,
    });
    expect(panels.filter((p) => p.name === "Divider")).toHaveLength(1);
    expect(panels.filter((p) => p.kind === "door")).toHaveLength(2);
    // three shelves a bay, the inside being over 1.2 m
    expect(panels.filter((p) => p.name === "Shelf")).toHaveLength(6);
    // the parts meet at joints, never stand in each other's space
    expect(overlapBoxes(panels)).toHaveLength(0);
    expect(new Set(panels.map((p) => p.id)).size).toBe(panels.length);
  });
  it("draws the same body the studio draws: sides outside the shelves", () => {
    const panels = carcassPanels({
      width: 600,
      depth: 400,
      height: 900,
      bays: 1,
      doors: false,
    });
    const shelf = panels.find((p) => p.name === "Shelf")!;
    expect(shelf.length).toBe(564);
    expect(shelf.position[0]).toBe(0);
  });
});

describe("settledPanels", () => {
  it("brings the box to the frame and reads the size", () => {
    const panels = carcassPanels({
      width: 600,
      depth: 400,
      height: 900,
      bays: 1,
      doors: false,
    }).map((p) => ({
      ...p,
      position: [
        p.position[0] + 100,
        p.position[1] + 50,
        p.position[2],
      ] as Vec3,
    }));
    const s = settledPanels(panels);
    expect([s.width, s.depth, s.height]).toEqual([600, 400, 900]);
    expect(boundsOf(s.panels)).toEqual({
      min: [-300, 0, -200],
      max: [300, 900, 200],
    });
  });
  it("is empty for nothing", () => {
    expect(settledPanels([])).toEqual({
      panels: [],
      width: 0,
      depth: 0,
      height: 0,
    });
  });
});

describe("priceOfPanels", () => {
  it("adds the parts up from the one table of rates", () => {
    const panels = carcassPanels({
      width: 600,
      depth: 400,
      height: 900,
      bays: 1,
      doors: true,
    });
    const own = panels.reduce(
      (t, p) =>
        t + partPrice(p.kind, `${p.length} × ${p.width} × ${p.thickness} mm`),
      0,
    );
    expect(priceOfPanels(panels)).toBe(own);
    expect(priceOfPanels(panels)).toBeGreaterThan(0);
  });
});

describe("newPanel", () => {
  it("adds a shelf across the inside, numbered after the ones there", () => {
    const panels = carcassPanels({
      width: 600,
      depth: 400,
      height: 900,
      bays: 1,
      doors: false,
    });
    const shelf = newPanel(panels, "shelf");
    expect(shelf.id).toBe("shelf-1");
    expect([shelf.length, shelf.width]).toEqual([564, 382]);
    expect(newPanel([...panels, shelf], "shelf").id).toBe("shelf-2");
    const door = newPanel(panels, "door");
    expect(door.kind).toBe("door");
    expect(door.position[2]).toBe(191);
  });
});
