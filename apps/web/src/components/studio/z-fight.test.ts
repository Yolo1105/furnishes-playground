import { defaultConfig, depthOf, products } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { furnishesForm } from "./furnishes-forms";
import { type Face, fightsOf, planeFightsOf, type Slab } from "./z-fight";

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

describe("z-fighting among a room's surfaces", () => {
  const face = (
    id: string,
    finish: string,
    at: number,
    rect: [number, number, number, number],
    side: 1 | -1 = 1,
  ): Face => ({ id, finish, axis: 2, side, at, rect });
  it("finds two finishes in one plane, the same way round", () => {
    const fights = planeFightsOf([
      face("wall", "plaster", 0, [0, 0, 3, 2.6]),
      // a cap flush with the wall's face, over it
      face("cap", "grey", 0.0004, [0, 2.5, 3, 2.6]),
      // a skirting a centimetre proud: clear
      face("skirting", "white", 0.012, [0, 0, 3, 0.1]),
    ]);
    expect(fights.map((f) => `${f.a}/${f.b}`)).toEqual(["cap/wall"]);
  });
  it("leaves one finish over itself, edges touching and hidden faces", () => {
    expect(
      planeFightsOf([
        // two runs of skirting meeting at a corner
        face("run1", "white", 0, [0, 0, 1, 0.1]),
        face("run2", "white", 0, [0.9, 0, 2, 0.1]),
        // a jamb's back and a threshold's end, both against the reveal
        face("jamb", "frame", 1, [0, 0, 0.3, 2.1]),
        face("sill", "stone", 1, [0, 0, 0.3, 0.012]),
        face("reveal", "plaster", 1, [0, 0, 0.3, 2.1], -1),
        // two finishes side by side, sharing an edge only
        face("left", "oak", 2, [0, 0, 1, 1]),
        face("right", "ash", 2, [1, 0, 2, 1]),
        // two rooms' outer faces, behind a third room's own face
        face("outerA", "white", 3, [0, 0, 1, 1]),
        face("outerB", "cream", 3.0005, [0.5, 0, 1.5, 1]),
        face("inside", "sage", 3.002, [0, 0, 2, 1]),
        // two rooms' walls at a corner, the later one a hair behind
        { ...face("earlier", "white", 4, [0, 0, 1, 1]), bias: "1/1" },
        { ...face("later", "cream", 4, [0, 0, 1, 1]), bias: "1/2" },
      ]),
    ).toEqual([]);
  });
});
