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

/** geometry beyond the outline's edges: a free line, an arc through
    its start and end about its centre, a circle about its centre */
export type SketchLine = { id: string; kind: "line"; a: string; b: string };
export type SketchArc = {
  id: string;
  kind: "arc";
  centre: string;
  start: string;
  end: string;
};
export type SketchCircle = {
  id: string;
  kind: "circle";
  centre: string;
  radius: number;
};
export type SketchGeometry = SketchLine | SketchArc | SketchCircle;

/** a constraint holds points, lines (an outline edge by `edgeId`, or a
    line of the geometry) and curves (arcs, circles) to each other; a
    dimension may carry a name, so it can be read by it */
export type SketchConstraint = (
  | { kind: "horizontal"; a: string; b: string }
  | { kind: "vertical"; a: string; b: string }
  | { kind: "distance"; a: string; b: string; mm: number }
  | { kind: "coincident"; a: string; b: string }
  | { kind: "parallel"; l1: string; l2: string }
  | { kind: "perpendicular"; l1: string; l2: string }
  /** a line tangent to an arc or a circle */
  | { kind: "tangent"; l: string; c: string }
  /** two lines of one length, or two circles of one radius */
  | { kind: "equal"; a: string; b: string }
  | { kind: "radius"; c: string; mm: number }
  | { kind: "diameter"; c: string; mm: number }
  | { kind: "angle"; l1: string; l2: string; deg: number }
  | { kind: "pointOnLine"; p: string; l: string }
  | { kind: "pointOnCurve"; p: string; c: string }
  /** a point held where it is */
  | { kind: "fix"; p: string; x: number; y: number }
  /** two points mirrored about a line */
  | { kind: "symmetric"; a: string; b: string; l: string }
) & { id: string; name?: string };

export type Sketch = {
  points: SketchPoint[];
  /** the outline, point ids in order, closed back to the first */
  loop: string[];
  constraints: SketchConstraint[];
  /** a corner rounded: the point's id and the radius, mm */
  corners: Record<string, number>;
  /** geometry beyond the outline's edges, when there is any */
  geometry?: SketchGeometry[];
  /** inner outlines cut out as holes, each point ids in order */
  holes?: string[][];
};

/** the id an outline edge from `a` to `b` has among the solver's lines */
export const edgeId = (a: string, b: string) => `edge-${a}-${b}`;

/** what holds a sketch: how many degrees of freedom are left (nought
    is fully constrained), and which constraints fight or repeat */
export type SketchSolve = {
  sketch: Sketch;
  dof: number;
  conflicting: string[];
  redundant: string[];
  /** whether the solver settled */
  ok: boolean;
};

/** the solver's own words for a sketch, as planegcs reads them */
export type Primitive =
  | { id: string; type: "point"; x: number; y: number; fixed: boolean }
  | { id: string; type: "line"; p1_id: string; p2_id: string }
  | { id: string; type: "circle"; c_id: string; radius: number }
  | {
      id: string;
      type: "arc";
      c_id: string;
      start_id: string;
      end_id: string;
      radius: number;
      start_angle: number;
      end_angle: number;
    }
  | { id: string; type: "arc_rules"; a_id: string }
  | { id: string; type: "horizontal_pp"; p1_id: string; p2_id: string }
  | { id: string; type: "vertical_pp"; p1_id: string; p2_id: string }
  | {
      id: string;
      type: "p2p_distance";
      p1_id: string;
      p2_id: string;
      distance: number;
    }
  | { id: string; type: "p2p_coincident"; p1_id: string; p2_id: string }
  | { id: string; type: "parallel"; l1_id: string; l2_id: string }
  | { id: string; type: "perpendicular_ll"; l1_id: string; l2_id: string }
  | { id: string; type: "tangent_lc"; l_id: string; c_id: string }
  | { id: string; type: "tangent_la"; l_id: string; a_id: string }
  | { id: string; type: "equal_length"; l1_id: string; l2_id: string }
  | { id: string; type: "equal_radius_cc"; c1_id: string; c2_id: string }
  | { id: string; type: "circle_radius"; c_id: string; radius: number }
  | { id: string; type: "arc_radius"; a_id: string; radius: number }
  | { id: string; type: "circle_diameter"; c_id: string; diameter: number }
  | { id: string; type: "arc_diameter"; a_id: string; diameter: number }
  | {
      id: string;
      type: "l2l_angle_ll";
      l1_id: string;
      l2_id: string;
      angle: number;
    }
  | { id: string; type: "point_on_line_pl"; p_id: string; l_id: string }
  | { id: string; type: "point_on_circle"; p_id: string; c_id: string }
  | { id: string; type: "point_on_arc"; p_id: string; a_id: string }
  | { id: string; type: "coordinate_x"; p_id: string; x: number }
  | { id: string; type: "coordinate_y"; p_id: string; y: number }
  | {
      id: string;
      type: "p2p_symmetric_ppl";
      p1_id: string;
      p2_id: string;
      l_id: string;
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

/** the rectangle with a square `cut` long by `deep` wide taken out of
    its far top corner: an L, every edge level or upright, the notch
    held by its two distances */
export const notchSketch = (
  length: number,
  width: number,
  cut: number,
  deep: number,
): Sketch => {
  const c = Math.round(Math.min(cut, length / 2));
  const d = Math.round(Math.min(deep, width / 2));
  return {
    points: [
      point("a", 0, 0, true),
      point("b", length, 0),
      point("c", length, width - d),
      point("e", length - c, width - d),
      point("f", length - c, width),
      point("d", 0, width),
    ],
    loop: ["a", "b", "c", "e", "f", "d"],
    constraints: [
      { id: "ab", kind: "horizontal", a: "a", b: "b" },
      { id: "bc", kind: "vertical", a: "b", b: "c" },
      { id: "ce", kind: "horizontal", a: "c", b: "e" },
      { id: "ef", kind: "vertical", a: "e", b: "f" },
      { id: "fd", kind: "horizontal", a: "f", b: "d" },
      { id: "da", kind: "vertical", a: "d", b: "a" },
      { id: "len", kind: "distance", a: "a", b: "b", mm: length },
      { id: "wid", kind: "distance", a: "d", b: "a", mm: width },
      { id: "cut", kind: "distance", a: "c", b: "e", mm: c, name: "notch" },
      { id: "deep", kind: "distance", a: "e", b: "f", mm: d, name: "depth" },
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

/** the kind of curve a geometry id names, for the solver's words */
const curveOf = (s: Sketch, id: string) =>
  s.geometry?.find((g) => g.id === id)?.kind ?? "line";

/** the sketch as the solver's primitives: the points, a line an edge,
    the geometry beyond (an arc with its rules, so its ends stay on
    it), then the constraints; a line and a constraint follow the
    points they name, as the solver asks */
export const toPrimitives = (s: Sketch): Primitive[] => {
  const at = new Map(s.points.map((p) => [p.id, p]));
  const out: Primitive[] = s.points.map((p) => ({
    id: p.id,
    type: "point",
    x: p.x,
    y: p.y,
    fixed: p.fixed,
  }));
  const loops = [s.loop, ...(s.holes ?? [])];
  for (const loop of loops)
    loop.forEach((id, i) => {
      const next = loop[(i + 1) % loop.length]!;
      out.push({ id: edgeId(id, next), type: "line", p1_id: id, p2_id: next });
    });
  for (const g of s.geometry ?? []) {
    if (g.kind === "line")
      out.push({ id: g.id, type: "line", p1_id: g.a, p2_id: g.b });
    else if (g.kind === "circle")
      out.push({ id: g.id, type: "circle", c_id: g.centre, radius: g.radius });
    else {
      const c = at.get(g.centre)!;
      const a = at.get(g.start)!;
      const b = at.get(g.end)!;
      out.push({
        id: g.id,
        type: "arc",
        c_id: g.centre,
        start_id: g.start,
        end_id: g.end,
        radius: Math.hypot(a.x - c.x, a.y - c.y),
        start_angle: Math.atan2(a.y - c.y, a.x - c.x),
        end_angle: Math.atan2(b.y - c.y, b.x - c.x),
      });
      out.push({ id: `${g.id}-rules`, type: "arc_rules", a_id: g.id });
    }
  }
  for (const c of s.constraints) {
    switch (c.kind) {
      case "horizontal":
        out.push({ id: c.id, type: "horizontal_pp", p1_id: c.a, p2_id: c.b });
        break;
      case "vertical":
        out.push({ id: c.id, type: "vertical_pp", p1_id: c.a, p2_id: c.b });
        break;
      case "distance":
        out.push({
          id: c.id,
          type: "p2p_distance",
          p1_id: c.a,
          p2_id: c.b,
          distance: c.mm,
        });
        break;
      case "coincident":
        out.push({ id: c.id, type: "p2p_coincident", p1_id: c.a, p2_id: c.b });
        break;
      case "parallel":
        out.push({ id: c.id, type: "parallel", l1_id: c.l1, l2_id: c.l2 });
        break;
      case "perpendicular":
        out.push({
          id: c.id,
          type: "perpendicular_ll",
          l1_id: c.l1,
          l2_id: c.l2,
        });
        break;
      case "tangent":
        out.push(
          curveOf(s, c.c) === "arc"
            ? { id: c.id, type: "tangent_la", l_id: c.l, a_id: c.c }
            : { id: c.id, type: "tangent_lc", l_id: c.l, c_id: c.c },
        );
        break;
      case "equal":
        out.push(
          curveOf(s, c.a) === "line"
            ? { id: c.id, type: "equal_length", l1_id: c.a, l2_id: c.b }
            : { id: c.id, type: "equal_radius_cc", c1_id: c.a, c2_id: c.b },
        );
        break;
      case "radius":
        out.push(
          curveOf(s, c.c) === "arc"
            ? { id: c.id, type: "arc_radius", a_id: c.c, radius: c.mm }
            : { id: c.id, type: "circle_radius", c_id: c.c, radius: c.mm },
        );
        break;
      case "diameter":
        out.push(
          curveOf(s, c.c) === "arc"
            ? { id: c.id, type: "arc_diameter", a_id: c.c, diameter: c.mm }
            : { id: c.id, type: "circle_diameter", c_id: c.c, diameter: c.mm },
        );
        break;
      case "angle":
        out.push({
          id: c.id,
          type: "l2l_angle_ll",
          l1_id: c.l1,
          l2_id: c.l2,
          angle: (c.deg * Math.PI) / 180,
        });
        break;
      case "pointOnLine":
        out.push({ id: c.id, type: "point_on_line_pl", p_id: c.p, l_id: c.l });
        break;
      case "pointOnCurve":
        out.push(
          curveOf(s, c.c) === "arc"
            ? { id: c.id, type: "point_on_arc", p_id: c.p, a_id: c.c }
            : { id: c.id, type: "point_on_circle", p_id: c.p, c_id: c.c },
        );
        break;
      case "fix":
        out.push({ id: `${c.id}-x`, type: "coordinate_x", p_id: c.p, x: c.x });
        out.push({ id: `${c.id}-y`, type: "coordinate_y", p_id: c.p, y: c.y });
        break;
      case "symmetric":
        out.push({
          id: c.id,
          type: "p2p_symmetric_ppl",
          p1_id: c.a,
          p2_id: c.b,
          l_id: c.l,
        });
        break;
    }
  }
  return out;
};

/** the constraint a solver's primitive id came from (a fix is two) */
export const constraintIdOf = (primitiveId: string) =>
  primitiveId.replace(/-(x|y)$/, "");

/** the sketch with the solver's points taken back */
export const solved = (s: Sketch, primitives: readonly Primitive[]): Sketch => {
  const at = new Map(
    primitives
      .filter(
        (p): p is Extract<Primitive, { type: "point" }> => p.type === "point",
      )
      .map((p) => [p.id, p]),
  );
  const radii = new Map(
    primitives
      .filter(
        (p): p is Extract<Primitive, { type: "circle" }> => p.type === "circle",
      )
      .map((p) => [p.id, p.radius]),
  );
  return {
    ...s,
    points: s.points.map((p) => {
      const q = at.get(p.id);
      return q ? { ...p, x: q.x, y: q.y } : p;
    }),
    ...(s.geometry
      ? {
          geometry: s.geometry.map((g) =>
            g.kind === "circle" && radii.has(g.id)
              ? { ...g, radius: radii.get(g.id)! }
              : g,
          ),
        }
      : {}),
  };
};

/** the points a loop runs through, mm */
const loopPoints = (s: Sketch, loop: readonly string[]): [number, number][] => {
  const at = new Map(s.points.map((p) => [p.id, p]));
  return loop.map((id) => {
    const p = at.get(id)!;
    return [p.x, p.y];
  });
};

/** the holes' outlines, mm, each in order */
export const holesOf = (s: Sketch): [number, number][][] =>
  (s.holes ?? []).map((h) => loopPoints(s, h));

/** the round holes: every circle drawn is cut through, mm */
export const roundsOf = (s: Sketch): { x: number; y: number; r: number }[] => {
  const at = new Map(s.points.map((p) => [p.id, p]));
  return (s.geometry ?? []).flatMap((g) => {
    if (g.kind !== "circle") return [];
    const c = at.get(g.centre)!;
    return [{ x: c.x, y: c.y, r: g.radius }];
  });
};

/** how many degrees of freedom a sketch has before any constraint:
    two a free point, one more a circle's radius */
export const freeDof = (s: Sketch) =>
  s.points.filter((p) => !p.fixed).length * 2 +
  (s.geometry?.filter((g) => g.kind === "circle").length ?? 0);

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
