/**
 * A panel's profile as a sketch: the points of its outline in the
 * face's frame (u along the length, v up the width, mm), the loop
 * through them, and the constraints that hold it (an edge level or
 * upright, a distance between two points, a point held still), with
 * a corner rounded by a radius where asked. The solver (FreeCAD's
 * planegcs, in the studio's worker) takes the sketch as primitives
 * (`toPrimitives`) and hands the points back solved (`solved`); the
 * solid is the profile drawn and extruded by the thickness, in the
 * worker too. The presets are the shapes a panel is usually given: a
 * plain rectangle, one with a corner cut off, one narrowed at the top.
 */
export type SketchPoint = { id: string; x: number; y: number; fixed: boolean };

export type SketchConstraint =
  | { id: string; kind: "horizontal"; a: string; b: string }
  | { id: string; kind: "vertical"; a: string; b: string }
  | { id: string; kind: "distance"; a: string; b: string; mm: number };

export type Sketch = {
  points: SketchPoint[];
  /** the outline, point ids in order, closed back to the first */
  loop: string[];
  constraints: SketchConstraint[];
  /** a corner rounded: the point's id and the radius, mm */
  corners: Record<string, number>;
};

/** the solver's own words for a sketch, as planegcs reads them */
export type Primitive =
  | { id: string; type: "point"; x: number; y: number; fixed: boolean }
  | { id: string; type: "line"; p1_id: string; p2_id: string }
  | { id: string; type: "horizontal_pp"; p1_id: string; p2_id: string }
  | { id: string; type: "vertical_pp"; p1_id: string; p2_id: string }
  | {
      id: string;
      type: "p2p_distance";
      p1_id: string;
      p2_id: string;
      distance: number;
    };

const point = (id: string, x: number, y: number, fixed = false) => ({
  id,
  x,
  y,
  fixed,
});

/** a plain rectangle, length by width: its corner at the origin held
    still, each edge level or upright, two distances holding its size */
export const rectangleSketch = (length: number, width: number): Sketch => ({
  points: [
    point("a", 0, 0, true),
    point("b", length, 0),
    point("c", length, width),
    point("d", 0, width),
  ],
  loop: ["a", "b", "c", "d"],
  constraints: [
    { id: "ab", kind: "horizontal", a: "a", b: "b" },
    { id: "bc", kind: "vertical", a: "b", b: "c" },
    { id: "cd", kind: "horizontal", a: "c", b: "d" },
    { id: "da", kind: "vertical", a: "d", b: "a" },
    { id: "len", kind: "distance", a: "a", b: "b", mm: length },
    { id: "wid", kind: "distance", a: "b", b: "c", mm: width },
  ],
  corners: {},
});

/** the rectangle with its far top corner cut off by `cut` each way:
    a fifth point, the cut edge free, the two short edges held */
export const cutCornerSketch = (
  length: number,
  width: number,
  cut: number,
): Sketch => {
  const c = Math.min(cut, length / 2, width / 2);
  return {
    points: [
      point("a", 0, 0, true),
      point("b", length, 0),
      point("c", length, width - c),
      point("e", length - c, width),
      point("d", 0, width),
    ],
    loop: ["a", "b", "c", "e", "d"],
    constraints: [
      { id: "ab", kind: "horizontal", a: "a", b: "b" },
      { id: "bc", kind: "vertical", a: "b", b: "c" },
      { id: "ed", kind: "horizontal", a: "e", b: "d" },
      { id: "da", kind: "vertical", a: "d", b: "a" },
      { id: "len", kind: "distance", a: "a", b: "b", mm: length },
      { id: "wid", kind: "distance", a: "d", b: "a", mm: width },
      { id: "cut-up", kind: "distance", a: "c", b: "b", mm: width - c },
      { id: "cut-in", kind: "distance", a: "e", b: "d", mm: length - c },
    ],
    corners: {},
  };
};

/** the rectangle narrowed at the top by `taper` on the far side: the
    top edge level and shorter, the far edge on the slant */
export const taperSketch = (
  length: number,
  width: number,
  taper: number,
): Sketch => {
  const t = Math.min(taper, length / 2);
  return {
    points: [
      point("a", 0, 0, true),
      point("b", length, 0),
      point("c", length - t, width),
      point("d", 0, width),
    ],
    loop: ["a", "b", "c", "d"],
    constraints: [
      { id: "ab", kind: "horizontal", a: "a", b: "b" },
      { id: "cd", kind: "horizontal", a: "c", b: "d" },
      { id: "da", kind: "vertical", a: "d", b: "a" },
      { id: "len", kind: "distance", a: "a", b: "b", mm: length },
      { id: "wid", kind: "distance", a: "d", b: "a", mm: width },
      { id: "top", kind: "distance", a: "c", b: "d", mm: length - t },
    ],
    corners: {},
  };
};

/** the sketch with every corner rounded by `radius` */
export const rounded = (s: Sketch, radius: number): Sketch => ({
  ...s,
  corners: Object.fromEntries(s.loop.map((id) => [id, radius])),
});

/** a held distance set anew (a length typed in) */
export const withDistance = (s: Sketch, id: string, mm: number): Sketch => ({
  ...s,
  constraints: s.constraints.map((c) =>
    c.id === id && c.kind === "distance" ? { ...c, mm } : c,
  ),
});

/** the sketch as the solver's primitives: the points, a line an edge,
    then the constraints; a line and a constraint follow the points
    they name, as the solver asks */
export const toPrimitives = (s: Sketch): Primitive[] => {
  const out: Primitive[] = s.points.map((p) => ({
    id: p.id,
    type: "point",
    x: p.x,
    y: p.y,
    fixed: p.fixed,
  }));
  s.loop.forEach((id, i) => {
    const next = s.loop[(i + 1) % s.loop.length]!;
    out.push({
      id: `edge-${id}-${next}`,
      type: "line",
      p1_id: id,
      p2_id: next,
    });
  });
  for (const c of s.constraints)
    out.push(
      c.kind === "horizontal"
        ? { id: c.id, type: "horizontal_pp", p1_id: c.a, p2_id: c.b }
        : c.kind === "vertical"
          ? { id: c.id, type: "vertical_pp", p1_id: c.a, p2_id: c.b }
          : {
              id: c.id,
              type: "p2p_distance",
              p1_id: c.a,
              p2_id: c.b,
              distance: c.mm,
            },
    );
  return out;
};

/** the sketch with the solver's points taken back */
export const solved = (s: Sketch, primitives: readonly Primitive[]): Sketch => {
  const at = new Map(
    primitives
      .filter(
        (p): p is Extract<Primitive, { type: "point" }> => p.type === "point",
      )
      .map((p) => [p.id, p]),
  );
  return {
    ...s,
    points: s.points.map((p) => {
      const q = at.get(p.id);
      return q ? { ...p, x: q.x, y: q.y } : p;
    }),
  };
};

/** the outline's points in order, mm */
export const outlineOf = (s: Sketch): [number, number][] => {
  const at = new Map(s.points.map((p) => [p.id, p]));
  return s.loop.map((id) => {
    const p = at.get(id)!;
    return [p.x, p.y];
  });
};

/** the box round the outline: its length and width */
export const sketchSize = (s: Sketch) => {
  const pts = outlineOf(s);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    length: Math.round(Math.max(...xs) - Math.min(...xs)),
    width: Math.round(Math.max(...ys) - Math.min(...ys)),
  };
};

/** the outline with its rounded corners drawn as arcs, `steps` points
    an arc, for a drawing or a cut list's picture */
export const outlineWithCorners = (
  s: Sketch,
  steps = 6,
): [number, number][] => {
  const pts = outlineOf(s);
  const n = pts.length;
  const out: [number, number][] = [];
  pts.forEach((p, i) => {
    const r = s.corners[s.loop[i]!] ?? 0;
    if (r <= 0) return out.push(p);
    const prev = pts[(i - 1 + n) % n]!;
    const next = pts[(i + 1) % n]!;
    const inA = unit(prev, p);
    const outB = unit(p, next);
    // the tangent points sit `r / tan(half the turn)` back along each edge
    const turn = Math.acos(
      Math.max(-1, Math.min(1, inA[0] * outB[0] + inA[1] * outB[1])),
    );
    const back = r / Math.tan((Math.PI - turn) / 2);
    const a: [number, number] = [p[0] - inA[0] * back, p[1] - inA[1] * back];
    const b: [number, number] = [p[0] + outB[0] * back, p[1] + outB[1] * back];
    // the arc's centre lies `r` in from the tangent point, square to the edge
    const cross = inA[0] * outB[1] - inA[1] * outB[0];
    const side = cross > 0 ? 1 : -1;
    const centre: [number, number] = [
      a[0] - inA[1] * r * side,
      a[1] + inA[0] * r * side,
    ];
    const a0 = Math.atan2(a[1] - centre[1], a[0] - centre[0]);
    const a1 = Math.atan2(b[1] - centre[1], b[0] - centre[0]);
    let sweep = a1 - a0;
    if (side > 0 && sweep < 0) sweep += 2 * Math.PI;
    if (side < 0 && sweep > 0) sweep -= 2 * Math.PI;
    for (let k = 0; k <= steps; k++) {
      const ang = a0 + (sweep * k) / steps;
      out.push([centre[0] + r * Math.cos(ang), centre[1] + r * Math.sin(ang)]);
    }
  });
  return out;
};

const unit = (from: [number, number], to: [number, number]) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l] as [number, number];
};
