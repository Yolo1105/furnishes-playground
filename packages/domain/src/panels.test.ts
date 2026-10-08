import { describe, expect, it } from "vitest";
import {
  axisField,
  boundsOf,
  overlapBoxes,
  panelBoxSize,
  panelRows,
  resizeAlongAxis,
  SNAP_MM,
  snapGroupDelta,
  snapHintOf,
  snapResizeFace,
  type Panel,
  type Vec3,
} from "./panels";

/**
 * The snapping's invariants, as Panelizer pins them: a snap fires only
 * where the panels overlap in their plane, a flush fit reports its
 * lines under one correction, and a centre line is offered only by a
 * neighbour whose thickness runs along that axis.
 */
let seq = 0;
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: "Part",
  normal: "z",
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  grain: "length",
  kind: "panel",
  ...over,
});
const at = (p: Panel, position: Vec3) => ({ panel: p, position });

describe("panelBoxSize and axisField", () => {
  it("lays the thickness along the normal", () => {
    expect(
      panelBoxSize(panel({ normal: "x", length: 400, width: 700 })),
    ).toEqual([18, 700, 400]);
    expect(panelBoxSize(panel({ normal: "y" }))).toEqual([600, 18, 400]);
    expect(panelBoxSize(panel({ normal: "z" }))).toEqual([600, 400, 18]);
    expect(axisField("y", 1)).toBe("thickness");
    expect(axisField("x", 2)).toBe("length");
  });
});

describe("snapHintOf", () => {
  it("sits on the snapped plane and spans the contact patch", () => {
    const h = snapHintOf(0, {
      plane: 40,
      kind: "butt",
      lo: [10, 20, 30],
      hi: [50, 60, 70],
    });
    expect(h.at).toEqual([40, 40, 50]);
    expect(h.size).toEqual([0, 40, 40]);
  });
  it("never has a negative span", () => {
    const h = snapHintOf(0, {
      plane: 0,
      kind: "butt",
      lo: [0, 90, 0],
      hi: [0, 10, 0],
    });
    expect(h.size[1]).toBe(0);
  });
});

describe("snapGroupDelta", () => {
  it("does not snap to a panel it does not overlap in its plane", () => {
    const moving = panel({ length: 100, width: 100 });
    const far = panel({ length: 100, width: 100, position: [105, 100_000, 0] });
    const r = snapGroupDelta([at(moving, [0, 0, 0])], [far], SNAP_MM);
    expect(r.correction).toEqual([0, 0, 0]);
    expect(r.snaps).toEqual([null, null, null]);
  });
  it("does nothing with no neighbour near", () => {
    const r = snapGroupDelta(
      [at(panel(), [0, 0, 0])],
      [panel({ position: [10_000, 0, 0] })],
      SNAP_MM,
    );
    expect(r.correction).toEqual([0, 0, 0]);
  });
  it("pulls a near-miss butt joint closed, on that axis alone", () => {
    const neighbour = panel();
    const mover = panel();
    // the neighbour spans z -9..9; the mover at 20 spans 11..29: a 2 mm gap
    const r = snapGroupDelta([at(mover, [0, 0, 20])], [neighbour], SNAP_MM);
    expect(r.correction[2]).toBeCloseTo(-2, 10);
    expect(r.correction[0]).toBe(0);
    expect(r.snaps[2]!.hits.some((h) => h.kind === "butt")).toBe(true);
    expect(r.snaps[2]!.hits.some((h) => Math.abs(h.plane - 9) < 1e-9)).toBe(
      true,
    );
  });
  it("reports a flush fit's lines under one correction", () => {
    const r = snapGroupDelta([at(panel(), [3, 0, 0])], [panel()], SNAP_MM);
    expect(r.correction[0]).toBeCloseTo(-3, 10);
    expect(r.snaps[0]!.correction).toBeCloseTo(-3, 10);
    expect(r.snaps[0]!.hits.length).toBeGreaterThan(1);
  });
  it("offers a centre line only where the neighbour's thickness runs", () => {
    // an upright side: its thickness runs along x
    const side = panel({ normal: "x", length: 400, width: 700 });
    // a shelf's low face 5 mm short of the side's centre line
    const shelf = panel({ normal: "y", length: 300, width: 380 });
    const r = snapGroupDelta([at(shelf, [150 + 5, 0, 0])], [side], SNAP_MM);
    expect(r.correction[0]).toBeCloseTo(-5, 10);
    expect(r.snaps[0]!.hits.some((h) => h.kind === "middle")).toBe(true);
    // on y the side merely spans the axis: no centre line to snap to
    const r2 = snapGroupDelta([at(shelf, [0, 5, 0])], [side], SNAP_MM);
    expect(r2.snaps[1]?.hits.every((h) => h.kind === "butt") ?? true).toBe(
      true,
    );
  });
  it("lets any member of a group pull the whole group", () => {
    const neighbour = panel({ position: [0, 0, 0] });
    const a = panel({ position: [0, 0, 100] });
    const b = panel({ position: [0, 0, 200] });
    // a is proposed 2 mm short of butting the neighbour; b rides along
    const r = snapGroupDelta(
      [at(a, [0, 0, 20]), at(b, [0, 0, 120])],
      [neighbour],
      SNAP_MM,
    );
    expect(r.correction[2]).toBeCloseTo(-2, 10);
  });
});

describe("snapResizeFace", () => {
  it("lands a dragged face on a neighbour's face within reach", () => {
    const side = panel({
      normal: "x",
      length: 400,
      width: 700,
      position: [300, 0, 0],
    });
    const shelf = panel({ normal: "y", length: 500, width: 380 });
    // the shelf's +x face at 250 dragged 38 mm toward the side's near face at 291
    const r = snapResizeFace(shelf, 0, 1, 38, [side], SNAP_MM);
    expect(r.delta).toBeCloseTo(41, 10);
    expect(r.snap?.kind).toBe("butt");
  });
  it("passes a raw delta through when nothing is near", () => {
    const r = snapResizeFace(panel(), 0, 1, 7, [], SNAP_MM);
    expect(r).toEqual({ delta: 7, snap: null });
  });
});

describe("resizeAlongAxis", () => {
  it("holds the far face and shifts the centre by half", () => {
    const r = resizeAlongAxis(panel(), 0, 1, 40);
    expect(r).toEqual({ field: "length", value: 640, position: [20, 0, 0] });
  });
  it("holds the centre when symmetric", () => {
    const r = resizeAlongAxis(panel(), 1, -1, -10, true);
    expect(r).toEqual({ field: "width", value: 420, position: [0, 0, 0] });
  });
  it("refuses the thickness axis", () => {
    expect(resizeAlongAxis(panel(), 2, 1, 5)).toBeNull();
  });
});

describe("overlapBoxes, boundsOf and panelRows", () => {
  it("finds where two panels stand in the same space", () => {
    const a = panel({ normal: "y", length: 600, width: 400 });
    const b = panel({
      normal: "x",
      length: 400,
      width: 700,
      position: [0, 0, 0],
    });
    const boxes = overlapBoxes([a, b]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.size).toEqual([18, 18, 400]);
  });
  it("ignores a sliver under the joint tolerance", () => {
    const a = panel({ position: [0, 0, 0] });
    const b = panel({ position: [0, 0, 17] }); // 1 mm into a
    expect(overlapBoxes([a, b])).toHaveLength(0);
  });
  it("boxes a set and counts the sizes", () => {
    const side = panel({
      normal: "x",
      length: 400,
      width: 700,
      position: [-291, 350, 0],
    });
    const side2 = { ...side, id: "s2", position: [291, 350, 0] as Vec3 };
    const shelf = panel({
      normal: "y",
      length: 564,
      width: 400,
      position: [0, 300, 0],
    });
    expect(boundsOf([side, side2, shelf])).toEqual({
      min: [-300, 0, -200],
      max: [300, 700, 200],
    });
    const rows = panelRows([side, side2, shelf]);
    expect(rows.map((r) => [r.length, r.width, r.quantity])).toEqual([
      [700, 400, 2],
      [564, 400, 1],
    ]);
  });
});
