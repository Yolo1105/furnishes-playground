import { DESIGN_FINISHES, designOf, recipeFromWords } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { COLOURS } from "./piece-detail";
import { propsOf, useScene } from "./scene-store";

/**
 * A designed piece in the room (round 8, Part 3a): the recipe's panels
 * are the piece, so its size, price and finish are the recipe's; going
 * back from edited panels is going back to the design.
 */
const recipe = recipeFromWords("A 1.6 m low bookcase with two doors, oak");

describe("a designed piece", () => {
  it("comes in finishes the studio paints", () => {
    expect(COLOURS.map((c) => c.id)).toEqual([...DESIGN_FINISHES]);
  });
  it("stands as its panels, the recipe's size, price and finish", () => {
    const s = useScene.getState();
    const id = s.addDesign({ ...recipe, finish: "walnut" }, "living");
    const after = useScene.getState();
    const node = after.groups.flatMap((g) => g.items).find((n) => n.id === id)!;
    expect(node).toMatchObject({
      name: "Low bookcase",
      kind: "piece",
      category: "storage",
      price: designOf(recipe).price,
    });
    expect(node.design?.bays).toBe(3);
    const p = propsOf(node, after.overrides);
    expect([p.width, p.height, p.depth]).toEqual([1600, 800, 320]);
    expect(p.colour).toBe("walnut");
    expect(p.panels).toHaveLength(designOf(recipe).panels.length);
    // the panels edited, then back to the design
    after.setPanels(id, p.panels!.slice(0, 3));
    expect(propsOf(node, useScene.getState().overrides).panels).toHaveLength(3);
    useScene.getState().setPanels(id, undefined);
    expect(propsOf(node, useScene.getState().overrides).panels).toHaveLength(
      designOf(recipe).panels.length,
    );
    // a second is numbered after the first
    const two = useScene.getState().addDesign(recipe, "living");
    expect(
      useScene
        .getState()
        .groups.flatMap((g) => g.items)
        .find((n) => n.id === two)?.name,
    ).toBe("Low bookcase 2");
  });
});
