import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  fitOf,
  kindOf,
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
    const two: Variant = { file: "a", kind: "sofa", size: [1.7, 0.8, 0.9] };
    const three: Variant = { file: "b", kind: "sofa", size: [2.3, 0.8, 0.9] };
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
    expect(lodAt(LOD_NEAR + 0.1, 0)).toBe(0);
    expect(lodAt(LOD_NEAR + 0.5, 0)).toBe(1);
    expect(lodAt(LOD_NEAR - 0.1, 1)).toBe(1);
    expect(lodAt(LOD_NEAR - 0.5, 1)).toBe(0);
  });
});
