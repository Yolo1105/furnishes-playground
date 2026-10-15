import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fitOf,
  KINDS,
  kindOf,
  colourIn,
  COLOUR_WORDS,
  retrieve,
  snapFor,
  styleOf,
  LOD_HYSTERESIS,
  LOD_NEAR,
  lodAt,
  type Variant,
  variantFor,
} from "./prop-variants";

const listed = JSON.parse(
  readFileSync(join(__dirname, "../../../public/props/index.json"), "utf8"),
) as { models: Variant[] };

describe("a room item's real model", () => {
  it("lists models that are in the folder", () => {
    for (const m of listed.models)
      expect(() =>
        readFileSync(join(__dirname, `../../../public/props/${m.file}.glb`)),
      ).not.toThrow();
  });
  it("is scaled no more than a tenth on any axis", () => {
    const table: Variant = {
      file: "t",
      kind: "coffee-table",
      style: "boxy",
      size: [0.6, 0.39, 1.2],
    };
    // turned a quarter, a 1.2 × 0.6 table fits a 1.15 × 0.6 item
    expect(fitOf(table, [1.15, 0.4, 0.6])?.turned).toBe(true);
    // a 1.0 m table is a sixth short: not stretched, no fit
    expect(fitOf(table, [1.0, 0.4, 0.6])).toBeNull();
    // a 2.4 m sofa is not the 1.81 m Chesterfield blown up
    expect(variantFor(listed.models, "sofa", [2.4, 0.8, 0.9])).toBeNull();
  });
  it("picks the nearest variant of the kind", () => {
    const two: Variant = {
      file: "a",
      kind: "sofa",
      style: "boxy",
      size: [1.7, 0.8, 0.9],
    };
    const three: Variant = {
      file: "b",
      kind: "sofa",
      style: "boxy",
      size: [2.3, 0.8, 0.9],
    };
    expect(variantFor([two, three], "sofa", [2.25, 0.8, 0.9])?.v.file).toBe(
      "b",
    );
    expect(variantFor([two, three], "sofa", [1.75, 0.8, 0.9])?.v.file).toBe(
      "a",
    );
  });
  it("knows an item's kind by its name", () => {
    expect(kindOf("Three-seat sofa", "seating")).toBe("sofa");
    expect(kindOf("Reading armchair", "seating")).toBe("armchair");
    expect(kindOf("Floor lamp", "lighting")).toBe("floor-lamp");
    expect(kindOf("Bookwall", "storage")).toBeNull();
  });
  it("switches to the far copy with a margin, so it never flickers", () => {
    const past = LOD_HYSTERESIS + 0.1;
    expect(lodAt(LOD_NEAR + 0.1, 0)).toBe(0);
    expect(lodAt(LOD_NEAR + past, 0)).toBe(1);
    expect(lodAt(LOD_NEAR - 0.1, 1)).toBe(1);
    expect(lodAt(LOD_NEAR - past, 1)).toBe(0);
  });
});

describe("choosing by design (round 8, Part 2)", () => {
  it("never draws a boxy sofa as a curved one", () => {
    // the 2.19 m glam velvet sofa fits a 2.2 m item, but it is curved
    expect(
      variantFor(listed.models, "sofa", [2.2, 0.8, 1.0], "boxy"),
    ).toBeNull();
    expect(
      variantFor(listed.models, "sofa", [2.2, 0.8, 1.0], "curved")?.v.file,
    ).toBe("glam_velvet_sofa");
  });
  it("lists every model with its design and a kind it knows", () => {
    for (const m of listed.models) {
      expect(["boxy", "curved", "organic"]).toContain(m.style);
      expect(KINDS).toContain(m.kind);
    }
  });
  it("reads a design from the name", () => {
    expect(styleOf("Sofa", "sofa")).toBe("boxy");
    expect(styleOf("Velvet sofa", "sofa")).toBe("curved");
    expect(styleOf("Potted plant", "plant")).toBe("organic");
  });
  it("knows the kinds the details asked for", () => {
    expect(kindOf("Cushion")).toBe("cushion");
    expect(kindOf("Wool throw")).toBe("throw");
    expect(kindOf("Fridge")).toBe("fridge");
    expect(kindOf("WC")).toBe("toilet");
    expect(kindOf("Basin")).toBe("basin");
    expect(kindOf("Queen bed")).toBe("bed");
    expect(kindOf("Bedside cabinet")).toBe("cabinet");
    expect(kindOf("Dish rack")).toBe("dish-rack");
    expect(kindOf("Kitchen tap")).toBe("tap");
    expect(kindOf("Basin mixer")).toBe("tap");
  });
  it("sizes a stand-in item to its model, within reason", () => {
    // the room's armchair, 0.8 × 0.85 × 0.8, takes the boxy armchair's size
    const a = snapFor(listed.models, "armchair", "boxy", [0.8, 0.85, 0.8]);
    expect(a?.v.file).toBe("modern_arm_chair_01");
    // a standing lamp is not the arc lamp four times its width
    expect(
      snapFor(listed.models, "floor-lamp", "organic", [0.3, 1.5, 0.3]),
    ).toBeNull();
    // a sofa keeps its size and its built form
    expect(snapFor(listed.models, "sofa", "boxy", [2.4, 0.8, 0.9])).toBeNull();
    // an item a model already fits is left as it is
    expect(
      snapFor(listed.models, "vase", "organic", [0.2, 0.39, 0.2]),
    ).toBeNull();
  });
  it("retrieves a real model before anything is generated: kind, design, size, colour", () => {
    // a green velvet armchair: a curved one, its cloth green, at the
    // model's own size (an armchair takes it)
    const chair = retrieve(
      listed.models,
      "a green velvet armchair",
      [0.8, 0.85, 0.8],
    )!;
    expect(chair.kind).toBe("armchair");
    expect(chair.style).toBe("curved");
    expect(chair.v.style).toBe("curved");
    expect(chair.colour).toBe(COLOUR_WORDS.green);
    expect(chair.size).toEqual(chair.v.size);
    // a plant within a tenth of its size: the item keeps its own
    const fig = retrieve(
      listed.models,
      "a tall fiddle-leaf fig",
      [0.4, 0.9, 0.4],
    );
    expect(fig?.v.file).toMatch(/potted_plant/);
    expect(fig?.colour).toBeNull();
    // nothing of the kind, or a kind kept to its built form
    expect(retrieve(listed.models, "a sculpture", [0.4, 0.4, 0.4])).toBeNull();
    expect(
      retrieve(listed.models, "an oak dining chair", [0.45, 0.85, 0.48]),
    ).toBeNull();
    expect(colourIn("a Navy rug")).toBe(COLOUR_WORDS.navy);
    expect(colourIn("a reddish lamp")).toBeNull();
  });
});
