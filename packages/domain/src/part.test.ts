import { describe, expect, it } from "vitest";
import {
  boxPart,
  bracketPart,
  featureSummary,
  featuresToBuild,
  finderSummary,
  freshPartId,
  knobPart,
  moveFeature,
  onPlane,
  planeOfNormal,
  removeFeature,
  removeSketch,
  updateFeature,
} from "./part";
import { freeDof } from "./sketch";

describe("a part's history", () => {
  it("moves, updates and removes features, and drops a sketch's features with it", () => {
    const b = bracketPart();
    expect(b.features.map((f) => f.id)).toEqual(["f1", "f2", "f3", "f4"]);
    expect(moveFeature(b, "f4", 0).features.map((f) => f.id)).toEqual([
      "f4",
      "f1",
      "f2",
      "f3",
    ]);
    expect(moveFeature(b, "f1", 9).features.map((f) => f.id)).toEqual([
      "f2",
      "f3",
      "f4",
      "f1",
    ]);
    expect(moveFeature(b, "nope", 0)).toBe(b);
    expect(removeFeature(b, "f2").features).toHaveLength(3);
    const f3 = updateFeature(b, "f3", { suppressed: true }).features[2]!;
    expect(f3.suppressed).toBe(true);
    // the screw hole's sketch gone, its cut goes too
    expect(removeSketch(b, "s2").features.map((f) => f.id)).toEqual([
      "f1",
      "f3",
      "f4",
    ]);
    expect(freshPartId(b, "f")).toBe("f5");
    expect(freshPartId(b, "s")).toBe("s3");
  });
  it("builds up to the rollback marker, the suppressed left out", () => {
    const b = updateFeature(bracketPart(), "f2", { suppressed: true });
    expect(featuresToBuild(b).map((f) => f.id)).toEqual(["f1", "f3", "f4"]);
    expect(featuresToBuild(b, 2).map((f) => f.id)).toEqual(["f1"]);
    expect(featuresToBuild(b, 0)).toEqual([]);
  });
  it("puts words to features and finders", () => {
    const b = bracketPart();
    expect(featureSummary(b.features[0]!)).toBe("Extrude 30 mm");
    expect(featureSummary(b.features[1]!)).toBe("Extrude 30 mm, cut");
    expect(featureSummary(b.features[2]!)).toBe("Fillet 8 mm");
    expect(featureSummary(b.features[3]!)).toBe("Chamfer 1.5 mm");
    expect(featureSummary(knobPart().features[0]!)).toBe("Revolve 360°");
    expect(finderSummary({ rules: [] })).toBe("every edge");
    expect(
      finderSummary({ rules: [{ rule: "inPlane", plane: "XY", at: 18 }] }),
    ).toBe("in the XY plane at 18 mm");
    expect(
      finderSummary({
        rules: [
          { rule: "inDirection", axis: "x" },
          { rule: "ofLength", mm: 30 },
        ],
      }),
    ).toBe("along x and 30 mm long");
  });
  it("lays sketch points on their planes and reads a face's plane back", () => {
    expect(onPlane("XY", 18, 100, 50)).toEqual([100, 50, 18]);
    expect(onPlane("XZ", 0, 100, 50)).toEqual([100, 0, 50]);
    expect(onPlane("YZ", 30, 100, 50)).toEqual([30, 100, 50]);
    expect(planeOfNormal([0, 0, 1], [5, 5, 18])).toEqual({
      plane: "XY",
      at: 18,
    });
    expect(planeOfNormal([0, -1, 0], [5, 7, 18])).toEqual({
      plane: "XZ",
      at: -7,
    });
    expect(planeOfNormal([1, 0, 0], [30, 7, 18])).toEqual({
      plane: "YZ",
      at: 30,
    });
    expect(planeOfNormal([0.7, 0.7, 0], [0, 0, 0])).toBeNull();
  });
  it("the presets' sketches are held and a box is one extrude", () => {
    for (const p of [knobPart(), bracketPart()])
      for (const s of p.sketches)
        expect(freeDof(s.sketch) - s.sketch.constraints.length).toBe(0);
    const box = boxPart("Block", 100, 50, 18);
    expect(box.features).toHaveLength(1);
    expect(box.sketches[0]!.plane).toBe("XY");
  });
});
