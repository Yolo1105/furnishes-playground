import { defaultConfig, depthOf, products } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { furnishesForm } from "./furnishes-forms";
import { fightsOf, type Slab } from "./z-fight";

/**
 * No two surfaces of a built piece lie in the same place facing the same
 * way (the stability page's stripes that crawl as the camera moves): a
 * door's face sits proud of the carcass's front, a thing on a shelf
 * stands back from the shelf's edge, a cap stands off the panel.
 */
const m = (mm: number) => mm / 1000;

describe("z-fighting", () => {
  it("finds two boxes' faces in one place, and not a box on a box", () => {
    const fights = fightsOf([
      { id: "a", at: [0, 0, 0], dims: [1, 1, 1] },
      // its front flush with a's, overlapping: a fight on z
      { id: "b", at: [0.2, 0, 0.25], dims: [0.4, 0.4, 0.5] },
      // standing on a's top: its foot faces down, a's top up
      { id: "c", at: [0, 0.6, 0], dims: [0.2, 0.2, 0.2] },
    ]);
    expect(fights.map((f) => `${f.a}${f.b}${f.axis}${f.side}`)).toEqual([
      "ab21",
    ]);
  });

  it("leaves none in any recipe, with or without doors", () => {
    const found: string[] = [];
    for (const r of products)
      for (const doors of [false, true]) {
        const f = furnishesForm({
          recipe: r,
          size: [m(r.width), m(r.height), m(depthOf(r))],
          doors,
          accessories: defaultConfig(r).accessories,
          colours: ["#d9b98a"],
          seed: 7,
        });
        const slabs: Slab[] = f.parts.flatMap((p, i) =>
          "dims" in p && !p.rotation
            ? [{ id: `${p.role}#${i}`, at: p.at, dims: p.dims }]
            : [],
        );
        for (const x of fightsOf(slabs))
          found.push(
            `${r.id}${doors ? " (doors)" : ""}: ${x.a} and ${x.b} on ${"xyz"[x.axis]}${x.side > 0 ? "+" : "-"} at ${x.at.toFixed(4)}`,
          );
      }
    expect(found).toEqual([]);
  });
});
