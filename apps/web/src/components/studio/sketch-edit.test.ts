import { edgeId, rectangleSketch } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import {
  addArc,
  addCircle,
  addLine,
  addRectangleHole,
  constrain,
  dimension,
  hitAt,
  remove,
  setDimension,
  snap,
} from "./sketch-edit";

describe("the sketcher's edits", () => {
  it("adds a rectangle hole held square with its two sizes", () => {
    const [s, ids] = addRectangleHole(
      rectangleSketch(600, 400),
      { x: 100, y: 100 },
      { x: 220, y: 180 },
    );
    expect(ids).toHaveLength(4);
    expect(s.holes).toEqual([ids]);
    const kinds = s.constraints.slice(6).map((c) => c.kind);
    expect(kinds).toEqual([
      "horizontal",
      "vertical",
      "horizontal",
      "vertical",
      "distance",
      "distance",
    ]);
    expect(s.constraints.find((c) => c.name === "hole 1 length")).toMatchObject(
      { mm: 120 },
    );
    expect(s.constraints.find((c) => c.name === "hole 1 width")).toMatchObject({
      mm: 80,
    });
  });
  it("adds a circle with its radius held, and an arc through its ends", () => {
    const [s, c] = addCircle(
      rectangleSketch(600, 400),
      { x: 300, y: 200 },
      { x: 320, y: 200 },
    );
    expect(s.geometry![0]).toMatchObject({ id: c, kind: "circle", radius: 20 });
    expect(s.constraints.at(-1)).toMatchObject({ kind: "radius", c, mm: 20 });
    const [t, a] = addArc(
      s,
      { x: 100, y: 100 },
      { x: 150, y: 100 },
      { x: 100, y: 180 },
    );
    const arc = t.geometry!.find((g) => g.id === a)!;
    expect(arc.kind).toBe("arc");
    const end = t.points.find((p) => p.id === (arc as { end: string }).end)!;
    expect(Math.hypot(end.x - 100, end.y - 100)).toBeCloseTo(50);
  });
  it("lays constraints that fit what was picked, and refuses what does not", () => {
    const base = rectangleSketch(600, 400);
    const [s] = addLine(base, { x: 100, y: 100 }, { x: 200, y: 150 });
    const line = s.geometry![0]!.id;
    expect(
      constrain(s, "parallel", [
        { kind: "line", id: line },
        { kind: "line", id: edgeId("a", "b") },
      ])!.constraints.at(-1),
    ).toMatchObject({ kind: "parallel" });
    expect(
      constrain(s, "horizontal", [{ kind: "line", id: line }])!.constraints.at(
        -1,
      ),
    ).toMatchObject({ kind: "horizontal", a: "p1", b: "p2" });
    expect(constrain(s, "tangent", [{ kind: "line", id: line }])).toBeNull();
    expect(
      constrain(s, "fix", [{ kind: "point", id: "p1" }])!.constraints.at(-1),
    ).toMatchObject({ kind: "fix", x: 100, y: 100 });
  });
  it("lays a dimension and sets it anew", () => {
    const s = rectangleSketch(600, 400);
    const [t, id] = dimension(s, [
      { kind: "point", id: "a" },
      { kind: "point", id: "c" },
    ])!;
    expect(t.constraints.find((c) => c.id === id)).toMatchObject({
      kind: "distance",
      mm: 721,
    });
    expect(
      setDimension(t, id, 700).constraints.find((c) => c.id === id),
    ).toMatchObject({ mm: 700 });
    const [u, r] = dimension(
      addCircle(s, { x: 300, y: 200 }, { x: 330, y: 200 })[0],
      [{ kind: "curve", id: "c1" }],
    )!;
    expect(u.constraints.find((c) => c.id === r)).toMatchObject({
      kind: "radius",
      mm: 30,
    });
    expect(
      dimension(s, [
        { kind: "line", id: edgeId("a", "b") },
        { kind: "line", id: edgeId("b", "c") },
      ])![0].constraints.at(-1),
    ).toMatchObject({ kind: "angle", deg: 90 });
  });
  it("removes a hole with its point, a line with its constraints, never the outline", () => {
    const [s, ids] = addRectangleHole(
      rectangleSketch(600, 400),
      { x: 100, y: 100 },
      { x: 220, y: 180 },
    );
    const gone = remove(s, { kind: "point", id: ids[0]! });
    expect(gone.holes).toEqual([]);
    expect(gone.points.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(gone.constraints).toHaveLength(6);
    expect(remove(s, { kind: "point", id: "a" })).toBe(s);
    const [t] = addLine(s, { x: 10, y: 10 }, { x: 50, y: 10 });
    const line = t.geometry![0]!.id;
    const held = constrain(t, "horizontal", [{ kind: "line", id: line }])!;
    const after = remove(held, { kind: "line", id: line });
    expect(after.geometry).toEqual([]);
    expect(
      after.constraints.some((c) => c.kind === "horizontal" && c.a === "p5"),
    ).toBe(false);
  });
  it("finds what is under the pointer and snaps a drawn place", () => {
    const s = addCircle(
      rectangleSketch(600, 400),
      { x: 300, y: 200 },
      { x: 330, y: 200 },
    )[0];
    expect(hitAt(s, { x: 2, y: 3 }, 8)).toEqual({ kind: "point", id: "a" });
    expect(hitAt(s, { x: 300, y: 4 }, 8)).toEqual({
      kind: "line",
      id: edgeId("a", "b"),
    });
    expect(hitAt(s, { x: 331, y: 200 }, 8)).toEqual({
      kind: "curve",
      id: "c1",
    });
    expect(hitAt(s, { x: 150, y: 150 }, 8)).toBeNull();
    expect(snap(s, { x: 597, y: 3 }, 8, null)).toMatchObject({
      at: { x: 600, y: 0 },
      to: "point",
    });
    expect(snap(s, { x: 302, y: 3 }, 8, null)).toMatchObject({
      at: { x: 300, y: 0 },
      to: "midpoint",
    });
    expect(snap(s, { x: 150, y: 153 }, 8, { x: 50, y: 150 })).toMatchObject({
      at: { x: 150, y: 150 },
      to: "level",
    });
    expect(snap(s, { x: 150, y: 150 }, 8, { x: 50, y: 50 })).toMatchObject({
      to: null,
    });
  });
});
