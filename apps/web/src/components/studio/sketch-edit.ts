import {
  edgeId,
  type Sketch,
  type SketchConstraint,
  type SketchGeometry,
  type SketchPoint,
} from "@furnishes/domain";

/**
 * What the sketcher does to a sketch, pure: a point, a line, a
 * rectangle (as a hole, held square with its two sizes), a circle
 * or an arc added; a constraint or a dimension laid between picked
 * things; a thing removed with what named it; the nearest point or
 * line under the pointer, and the snaps a drawn point takes (another
 * point, a midpoint, level or upright with the last). Every id is new
 * to the sketch, so two of a kind can stand in one.
 */
export type Pt = { x: number; y: number };
/** what the pointer is over: a point, an edge or a line, a curve */
export type Hit =
  | { kind: "point"; id: string }
  | { kind: "line"; id: string }
  | { kind: "curve"; id: string }
  | null;

/** an id no point, geometry or constraint of the sketch has */
export const freshId = (s: Sketch, prefix: string) => {
  const taken = new Set<string>([
    ...s.points.map((p) => p.id),
    ...(s.geometry ?? []).map((g) => g.id),
    ...s.constraints.map((c) => c.id),
  ]);
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

const at = (s: Sketch, id: string) => s.points.find((p) => p.id === id);

/** every line the solver knows: the outline's and the holes' edges,
    and the free lines, as [id, a, b] */
export const linesOf = (s: Sketch): [string, string, string][] => {
  const out: [string, string, string][] = [];
  for (const loop of [s.loop, ...(s.holes ?? [])])
    loop.forEach((id, i) => {
      const next = loop[(i + 1) % loop.length]!;
      out.push([edgeId(id, next), id, next]);
    });
  for (const g of s.geometry ?? [])
    if (g.kind === "line") out.push([g.id, g.a, g.b]);
  return out;
};

/** a point added, free */
export const addPoint = (s: Sketch, p: Pt): [Sketch, string] => {
  const id = freshId(s, "p");
  return [
    { ...s, points: [...s.points, { id, x: p.x, y: p.y, fixed: false }] },
    id,
  ];
};

/** a free line between two points, both added when not given */
export const addLine = (
  s: Sketch,
  a: Pt | string,
  b: Pt | string,
): [Sketch, string] => {
  let out = s;
  let ia: string;
  let ib: string;
  if (typeof a === "string") ia = a;
  else [out, ia] = addPoint(out, a);
  if (typeof b === "string") ib = b;
  else [out, ib] = addPoint(out, b);
  const id = freshId(out, "l");
  return [
    {
      ...out,
      geometry: [...(out.geometry ?? []), { id, kind: "line", a: ia, b: ib }],
    },
    id,
  ];
};

/** a rectangle from two opposite corners as a hole: four points, the
    hole's loop, its edges held level and upright, its two sizes held */
export const addRectangleHole = (
  s: Sketch,
  from: Pt,
  to: Pt,
): [Sketch, string[]] => {
  const x0 = Math.min(from.x, to.x);
  const x1 = Math.max(from.x, to.x);
  const y0 = Math.min(from.y, to.y);
  const y1 = Math.max(from.y, to.y);
  let out = s;
  const ids: string[] = [];
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const) {
    let id: string;
    [out, id] = addPoint(out, { x, y });
    ids.push(id);
  }
  const [a, b, c, d] = ids as [string, string, string, string];
  const n = (out.holes?.length ?? 0) + 1;
  const constraints: SketchConstraint[] = [
    { id: freshId(out, "h"), kind: "horizontal", a, b },
    { id: `${freshId(out, "h")}v`, kind: "vertical", a: b, b: c },
    { id: `${freshId(out, "h")}t`, kind: "horizontal", a: c, b: d },
    { id: `${freshId(out, "h")}l`, kind: "vertical", a: d, b: a },
    {
      id: `hole${n}-len`,
      kind: "distance",
      a,
      b,
      mm: Math.round(x1 - x0),
      name: `hole ${n} length`,
    },
    {
      id: `hole${n}-wid`,
      kind: "distance",
      a: b,
      b: c,
      mm: Math.round(y1 - y0),
      name: `hole ${n} width`,
    },
  ];
  return [
    {
      ...out,
      holes: [...(out.holes ?? []), ids],
      constraints: [...out.constraints, ...constraints],
    },
    ids,
  ];
};

/** a circle about a centre, through a point on its rim, its radius
    held */
export const addCircle = (s: Sketch, centre: Pt, rim: Pt): [Sketch, string] => {
  const [out, c] = addPoint(s, centre);
  const id = freshId(out, "c");
  const radius = Math.max(
    1,
    Math.round(Math.hypot(rim.x - centre.x, rim.y - centre.y)),
  );
  return [
    {
      ...out,
      geometry: [
        ...(out.geometry ?? []),
        { id, kind: "circle", centre: c, radius },
      ],
      constraints: [
        ...out.constraints,
        {
          id: `${id}-r`,
          kind: "radius",
          c: id,
          mm: radius,
          name: `${id} radius`,
        },
      ],
    },
    id,
  ];
};

/** an arc about a centre from a start to an end (the end put on the
    arc's radius), counter-clockwise */
export const addArc = (
  s: Sketch,
  centre: Pt,
  start: Pt,
  end: Pt,
): [Sketch, string] => {
  const r = Math.hypot(start.x - centre.x, start.y - centre.y) || 1;
  const ang = Math.atan2(end.y - centre.y, end.x - centre.x);
  const onArc = {
    x: centre.x + r * Math.cos(ang),
    y: centre.y + r * Math.sin(ang),
  };
  const [o1, c] = addPoint(s, centre);
  const [o2, a] = addPoint(o1, start);
  const [out, b] = addPoint(o2, onArc);
  const id = freshId(out, "a");
  return [
    {
      ...out,
      geometry: [
        ...(out.geometry ?? []),
        { id, kind: "arc", centre: c, start: a, end: b },
      ],
    },
    id,
  ];
};

/** a constraint laid between what was picked, when the kind fits
    what was picked; null when it does not */
export const constrain = (
  s: Sketch,
  kind:
    | "horizontal"
    | "vertical"
    | "coincident"
    | "parallel"
    | "perpendicular"
    | "equal"
    | "tangent"
    | "fix"
    | "symmetric"
    | "pointOnLine",
  picked: readonly Exclude<Hit, null>[],
): Sketch | null => {
  const points = picked.filter((h) => h.kind === "point").map((h) => h.id);
  const lines = picked.filter((h) => h.kind === "line").map((h) => h.id);
  const curves = picked.filter((h) => h.kind === "curve").map((h) => h.id);
  const id = freshId(s, kind.slice(0, 3));
  let c: SketchConstraint | null = null;
  const endsOf = (lineId: string) => linesOf(s).find((l) => l[0] === lineId);
  switch (kind) {
    case "horizontal":
    case "vertical": {
      // two points, or a line's two ends
      const ab =
        points.length === 2
          ? points
          : lines.length === 1
            ? endsOf(lines[0]!)?.slice(1)
            : null;
      if (ab) c = { id, kind, a: ab[0]!, b: ab[1]! };
      break;
    }
    case "coincident":
      if (points.length === 2) c = { id, kind, a: points[0]!, b: points[1]! };
      break;
    case "parallel":
    case "perpendicular":
      if (lines.length === 2) c = { id, kind, l1: lines[0]!, l2: lines[1]! };
      break;
    case "equal":
      if (lines.length === 2) c = { id, kind, a: lines[0]!, b: lines[1]! };
      else if (curves.length === 2)
        c = { id, kind, a: curves[0]!, b: curves[1]! };
      break;
    case "tangent":
      if (lines.length === 1 && curves.length === 1)
        c = { id, kind, l: lines[0]!, c: curves[0]! };
      break;
    case "fix":
      if (points.length === 1) {
        const p = at(s, points[0]!)!;
        c = { id, kind, p: p.id, x: p.x, y: p.y };
      }
      break;
    case "symmetric":
      if (points.length === 2 && lines.length === 1)
        c = { id, kind, a: points[0]!, b: points[1]!, l: lines[0]! };
      break;
    case "pointOnLine":
      if (points.length === 1 && lines.length === 1)
        c = { id, kind, p: points[0]!, l: lines[0]! };
      break;
  }
  return c ? { ...s, constraints: [...s.constraints, c] } : null;
};

/** a dimension laid: a distance between two points (or a line's
    ends), a radius on a curve, an angle between two lines; the value
    as it stands, to be typed over */
export const dimension = (
  s: Sketch,
  picked: readonly Exclude<Hit, null>[],
): [Sketch, string] | null => {
  const points = picked.filter((h) => h.kind === "point").map((h) => h.id);
  const lines = picked.filter((h) => h.kind === "line").map((h) => h.id);
  const curves = picked.filter((h) => h.kind === "curve").map((h) => h.id);
  const id = freshId(s, "dim");
  let c: SketchConstraint | null = null;
  const ab =
    points.length === 2
      ? points
      : lines.length === 1 && !curves.length
        ? linesOf(s)
            .find((l) => l[0] === lines[0])
            ?.slice(1)
        : null;
  if (ab) {
    const a = at(s, ab[0]!)!;
    const b = at(s, ab[1]!)!;
    c = {
      id,
      kind: "distance",
      a: a.id,
      b: b.id,
      mm: Math.round(Math.hypot(b.x - a.x, b.y - a.y)),
    };
  } else if (curves.length === 1) {
    const g = s.geometry?.find((x) => x.id === curves[0]);
    if (g?.kind === "circle") c = { id, kind: "radius", c: g.id, mm: g.radius };
    else if (g?.kind === "arc") {
      const ctr = at(s, g.centre)!;
      const st = at(s, g.start)!;
      c = {
        id,
        kind: "radius",
        c: g.id,
        mm: Math.round(Math.hypot(st.x - ctr.x, st.y - ctr.y)),
      };
    }
  } else if (lines.length === 2) {
    const dirOf = (lid: string) => {
      const l = linesOf(s).find((x) => x[0] === lid)!;
      const a = at(s, l[1])!;
      const b = at(s, l[2])!;
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    const deg = Math.round(
      (((dirOf(lines[1]!) - dirOf(lines[0]!)) * 180) / Math.PI + 360) % 180,
    );
    c = { id, kind: "angle", l1: lines[0]!, l2: lines[1]!, deg };
  }
  return c ? [{ ...s, constraints: [...s.constraints, c] }, id] : null;
};

/** a dimension's value set anew */
export const setDimension = (s: Sketch, id: string, value: number): Sketch => ({
  ...s,
  constraints: s.constraints.map((c) =>
    c.id !== id
      ? c
      : c.kind === "distance" || c.kind === "radius" || c.kind === "diameter"
        ? { ...c, mm: value }
        : c.kind === "angle"
          ? { ...c, deg: value }
          : c,
  ),
});

/** a thing removed with what named it: a constraint alone; a free
    line, curve or point with the constraints on it; a hole's point
    with its hole; an outline point never (the outline stays whole) */
export const remove = (
  s: Sketch,
  hit: Exclude<Hit, null> | { kind: "constraint"; id: string },
): Sketch => {
  if (hit.kind === "constraint")
    return { ...s, constraints: s.constraints.filter((c) => c.id !== hit.id) };
  const names = (c: SketchConstraint) =>
    Object.entries(c)
      .filter(([k]) => k !== "id" && k !== "kind" && k !== "name")
      .map(([, v]) => v);
  const goneIds = new Set<string>([hit.id]);
  let points = s.points;
  let geometry = s.geometry ?? [];
  let holes = s.holes ?? [];
  if (hit.kind === "point") {
    if (s.loop.includes(hit.id)) return s;
    const hole = holes.find((h) => h.includes(hit.id));
    if (hole) {
      for (const id of hole) goneIds.add(id);
      holes = holes.filter((h) => h !== hole);
      hole.forEach((id, i) =>
        goneIds.add(edgeId(id, hole[(i + 1) % hole.length]!)),
      );
    }
    points = points.filter((p) => !goneIds.has(p.id));
    geometry = geometry.filter((g) => {
      const uses =
        g.kind === "line"
          ? [g.a, g.b]
          : g.kind === "circle"
            ? [g.centre]
            : [g.centre, g.start, g.end];
      const gone = uses.some((u) => goneIds.has(u));
      if (gone) goneIds.add(g.id);
      return !gone;
    });
  } else {
    const g = geometry.find((x) => x.id === hit.id);
    if (!g) {
      // an outline or hole edge: it cannot go by itself
      return s;
    }
    geometry = geometry.filter((x) => x.id !== hit.id);
    // its points go with it when nothing else stands on them
    const used = new Set<string>([
      ...s.loop,
      ...holes.flat(),
      ...geometry.flatMap((x) =>
        x.kind === "line"
          ? [x.a, x.b]
          : x.kind === "circle"
            ? [x.centre]
            : [x.centre, x.start, x.end],
      ),
    ]);
    const own =
      g.kind === "line"
        ? [g.a, g.b]
        : g.kind === "circle"
          ? [g.centre]
          : [g.centre, g.start, g.end];
    for (const id of own) if (!used.has(id)) goneIds.add(id);
    points = points.filter((p) => !goneIds.has(p.id));
  }
  return {
    ...s,
    points,
    geometry,
    holes,
    constraints: s.constraints.filter(
      (c) => !names(c).some((v) => typeof v === "string" && goneIds.has(v)),
    ),
  };
};

/** the point within `reach` of a place, the nearest; else the line
    or curve within it; else nothing */
export const hitAt = (s: Sketch, p: Pt, reach: number): Hit => {
  let best: { hit: Hit; d: number } = { hit: null, d: reach };
  for (const q of s.points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < best.d) best = { hit: { kind: "point", id: q.id }, d };
  }
  if (best.hit) return best.hit;
  for (const [id, a, b] of linesOf(s)) {
    const d = segmentDistance(p, at(s, a)!, at(s, b)!);
    if (d < best.d) best = { hit: { kind: "line", id }, d };
  }
  for (const g of s.geometry ?? []) {
    if (g.kind === "line") continue;
    const c = at(s, g.centre)!;
    const r =
      g.kind === "circle"
        ? g.radius
        : Math.hypot(at(s, g.start)!.x - c.x, at(s, g.start)!.y - c.y);
    const d = Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - r);
    if (d < best.d) best = { hit: { kind: "curve", id: g.id }, d };
  }
  return best.hit;
};

/** how far a place is from a segment */
export const segmentDistance = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** the snap a drawn place takes: a point within reach, a line's
    midpoint, else level or upright with the last place within reach;
    which, so the sketcher can say */
export const snap = (
  s: Sketch,
  p: Pt,
  reach: number,
  last: Pt | null,
): {
  at: Pt;
  to: "point" | "midpoint" | "level" | "upright" | null;
  id?: string;
} => {
  const hit = hitAt(s, p, reach);
  if (hit?.kind === "point") {
    const q = at(s, hit.id)!;
    return { at: { x: q.x, y: q.y }, to: "point", id: hit.id };
  }
  for (const [id, a, b] of linesOf(s)) {
    const pa = at(s, a)!;
    const pb = at(s, b)!;
    const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    if (Math.hypot(m.x - p.x, m.y - p.y) < reach)
      return { at: m, to: "midpoint", id };
  }
  if (last) {
    if (Math.abs(p.y - last.y) < reach)
      return { at: { x: p.x, y: last.y }, to: "level" };
    if (Math.abs(p.x - last.x) < reach)
      return { at: { x: last.x, y: p.y }, to: "upright" };
  }
  return { at: p, to: null };
};

/** what names a point, for drawing it as held or free */
export const heldBy = (s: Sketch, pointId: string) =>
  s.constraints.filter((c) =>
    Object.entries(c).some(
      ([k, v]) => k !== "id" && k !== "kind" && v === pointId,
    ),
  );

export type { SketchGeometry, SketchPoint };
