import {
  type FeatureStatus,
  type Finder,
  featuresToBuild,
  holesOf,
  onPlane,
  type Op,
  outlineOf,
  type Part,
  type PartFeature,
  type PartSketch,
  planeAxes,
  planeOfNormal,
  roundsOf,
  type Sketch,
  type Vec3,
} from "@furnishes/domain";
import type * as Replicad from "replicad";

/**
 * A part built with replicad, feature by feature in the order of its
 * history (part.ts). Each feature is run on the body so far and
 * reports how it went; one that fails stops the build, the ones after
 * it are not built, and the body stands as it was before it, so the
 * part never vanishes under a bad radius. Pure: the kernel comes in as
 * an argument, so the part worker and a Node test share this file.
 */
type R = typeof Replicad;
export type Shape3D = Replicad.Shape3D;

/** how finely a solid is meshed, mm and radians */
export const MESH = { tolerance: 0.2, angularTolerance: 0.3 };

/** the sketch as replicad draws it: the outline, its corners rounded
    where asked, with the holes and the rounds cut; a sketch of rounds
    alone (a hole to cut) is the rounds themselves */
export const drawingOf = (r: R, sketch: Sketch): Replicad.Drawing => {
  const rounds = roundsOf(sketch).map((o) =>
    r.drawCircle(o.r).translate(o.x, o.y),
  );
  if (sketch.loop.length < 3) {
    if (!rounds.length) throw new Error("the sketch draws nothing");
    return rounds.slice(1).reduce((a, b) => a.fuse(b), rounds[0]!);
  }
  const pts = outlineOf(sketch);
  let pen = r.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  let drawing = pen.close();
  const radius = Math.max(...sketch.loop.map((id) => sketch.corners[id] ?? 0));
  if (radius > 0) drawing = drawing.fillet(radius);
  for (const hole of holesOf(sketch)) {
    let h = r.draw(hole[0]);
    for (const p of hole.slice(1)) h = h.lineTo(p);
    drawing = drawing.cut(h.close());
  }
  for (const o of rounds) drawing = drawing.cut(o);
  return drawing;
};

/** the drawing laid on the sketch's plane, `at` mm along its normal */
const laid = (d: Replicad.Drawing, s: PartSketch, at: number) =>
  d.sketchOnPlane(s.plane, at) as Replicad.Sketch;

const AXIS: Record<"x" | "y" | "z", Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};
const scaled = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

/** the rules of a finder applied, edge by edge */
const ruled = <F extends Replicad.EdgeFinder | Replicad.FaceFinder>(
  finder: F,
  f: Finder,
): F => {
  let out = finder;
  for (const rule of f.rules) {
    switch (rule.rule) {
      case "inPlane":
        out = out.inPlane(rule.plane, rule.at) as F;
        break;
      case "parallelTo":
        out = out.parallelTo(rule.plane) as F;
        break;
      case "inDirection":
        if ("inDirection" in out)
          out = out.inDirection(
            rule.axis.toUpperCase() as "X" | "Y" | "Z",
          ) as F;
        break;
      case "ofLength":
        if ("ofLength" in out)
          out = out.ofLength((l) => Math.abs(l - rule.mm) < 0.05) as F;
        break;
      case "containsPoint":
        out = out.containsPoint(rule.point) as F;
        break;
      case "inBox":
        out = out.inBox(rule.from, rule.to) as F;
        break;
      case "ofCurveType":
        if ("ofCurveType" in out) out = out.ofCurveType(rule.type) as F;
        break;
    }
  }
  return out;
};

/** the edges a finder picks on a body, checked before a fillet or a
    chamfer so a rule that finds nothing says so rather than doing
    nothing */
export const edgesFound = (r: R, body: Shape3D, f: Finder) =>
  ruled(new r.EdgeFinder(), f).find(body);

/** a new solid worked into the body so far */
const applied = (body: Shape3D | null, solid: Shape3D, op: Op): Shape3D => {
  if (op === "cut") {
    if (!body) throw new Error("there is no body to cut from yet");
    return body.cut(solid);
  }
  if (op === "join") return body ? body.fuse(solid) : solid;
  if (body) throw new Error("a body already stands: join it or cut it instead");
  return solid;
};

const sketchOf = (part: Part, id: string) => {
  const s = part.sketches.find((x) => x.id === id);
  if (!s) throw new Error(`there is no sketch ${id}`);
  return s;
};

/** one feature run on the body so far */
const run = (
  r: R,
  part: Part,
  body: Shape3D | null,
  f: PartFeature,
): Shape3D => {
  switch (f.kind) {
    case "extrude": {
      const s = sketchOf(part, f.sketch);
      const d = drawingOf(r, s.sketch);
      const back =
        f.direction === "symmetric"
          ? f.distance / 2
          : f.direction === "two"
            ? (f.back ?? 0)
            : 0;
      const solid = laid(d, s, s.at - back).extrude(f.distance + back);
      return applied(body, solid, f.op);
    }
    case "revolve": {
      const s = sketchOf(part, f.sketch);
      const d = drawingOf(r, s.sketch);
      const a = planeAxes(s.plane);
      let direction: Vec3;
      let origin: Vec3;
      if (typeof f.axis === "string") {
        direction = f.axis === "x" ? a.u : a.v;
        origin = onPlane(s.plane, s.at, 0, 0);
      } else {
        const lineId = f.axis.line;
        const line = s.sketch.geometry?.find(
          (g) => g.id === lineId && g.kind === "line",
        );
        if (!line || line.kind !== "line")
          throw new Error(`there is no line ${lineId} to revolve about`);
        const at = (id: string) => s.sketch.points.find((p) => p.id === id)!;
        const p = at(line.a);
        const q = at(line.b);
        origin = onPlane(s.plane, s.at, p.x, p.y);
        const end = onPlane(s.plane, s.at, q.x, q.y);
        direction = [
          end[0] - origin[0],
          end[1] - origin[1],
          end[2] - origin[2],
        ];
      }
      const solid = laid(d, s, s.at).revolve(direction, {
        origin,
        angle: f.angle,
      });
      return applied(body, solid, f.op);
    }
    case "fillet":
    case "chamfer": {
      if (!body) throw new Error("there is no body to round yet");
      const n = edgesFound(r, body, f.edges).length;
      if (!n) throw new Error("no edge matches the rule");
      return f.kind === "fillet"
        ? body.fillet(f.radius, (e) => ruled(e, f.edges))
        : body.chamfer(f.distance, (e) => ruled(e, f.edges));
    }
    case "mirror": {
      if (!body) throw new Error("there is no body to mirror yet");
      const origin = scaled(planeAxes(f.plane).n, f.at);
      return body.fuse(body.clone().mirror(f.plane, origin));
    }
    case "pattern": {
      if (!body) throw new Error("there is no body to repeat yet");
      if (f.count < 2) return body;
      let out = body;
      for (let i = 1; i < f.count; i++) {
        const copy =
          f.mode === "linear"
            ? body.clone().translate(scaled(AXIS[f.axis], i * f.spacing))
            : body.clone().rotate((360 / f.count) * i, [0, 0, 0], AXIS[f.axis]);
        out = out.fuse(copy);
      }
      return out;
    }
  }
};

export type Built = { body: Shape3D | null; statuses: FeatureStatus[] };

/** the part built up to its rollback marker: the body, or none when
    nothing built, and every feature's state */
export const buildPart = async (
  r: R,
  part: Part,
  upTo?: number,
): Promise<Built> => {
  let body: Shape3D | null = null;
  if (part.base) {
    const shape = await r.importSTEP(new Blob([part.base.step]));
    body = shape as Shape3D;
  }
  const toBuild = new Set(featuresToBuild(part, upTo).map((f) => f.id));
  const statuses: FeatureStatus[] = [];
  let stopped = false;
  for (const f of part.features) {
    if (f.suppressed) {
      statuses.push({ id: f.id, state: "suppressed" });
      continue;
    }
    if (!toBuild.has(f.id) || stopped) {
      statuses.push({ id: f.id, state: "notBuilt" });
      continue;
    }
    const t0 = performance.now();
    try {
      body = run(r, part, body, f);
      statuses.push({ id: f.id, state: "ok", ms: performance.now() - t0 });
    } catch (error) {
      statuses.push({
        id: f.id,
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
        ms: performance.now() - t0,
      });
      stopped = true;
    }
  }
  return { body, statuses };
};

/** one face of the mesh, for picking: where it is and which way it
    faces, and the plane it lies in when it is flat and square to an
    axis (the rule a pick turns into) */
export type FaceInfo = {
  id: number;
  centre: Vec3;
  normal: Vec3 | null;
  plane: { plane: "XY" | "XZ" | "YZ"; at: number } | null;
  /** the box round the face, mm */
  box: [Vec3, Vec3];
};

export type PartMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  /** which triangles belong to which face, by their index */
  faceGroups: { start: number; count: number; faceId: number }[];
  faces: FaceInfo[];
  /** the edges as line segments, pairs of points, mm */
  edges: Float32Array;
  bounds: [Vec3, Vec3];
  /** the part seen from above: the hull round its points, mm */
  outline: [number, number][];
  /** the part seen from above for real: the polygons of its body's
      projection, holes included (cut-solid's silhouetteOf), mm; the
      worker fills it in after the mesh, null when it could not */
  silhouette: [number, number][][] | null;
};

export { partOutline } from "./part-outline";

/** the convex hull of some points, counter-clockwise (monotone chain) */
export const hullOf = (pts: [number, number][]): [number, number][] => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (
    o: [number, number],
    a: [number, number],
    b: [number, number],
  ) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0
    )
      lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of [...p].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0
    )
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

/** the body meshed for the stage, with what picking needs */
export const meshOf = (body: Shape3D): PartMesh => {
  const m = body.mesh(MESH);
  const e = body.meshEdges(MESH);
  // the mesh names each face by the kernel's own hash; the faces are
  // listed in the body's order, and the groups renamed to that index
  const byHash = new Map<number, number>();
  const faces: FaceInfo[] = body.faces.map((face, id) => {
    byHash.set(face.hashCode, id);
    const centre = face.center.toTuple();
    const flat = face.geomType === "PLANE";
    const normal = flat ? face.normalAt().normalized().toTuple() : null;
    return {
      id,
      centre,
      normal,
      plane: normal ? planeOfNormal(normal, centre) : null,
      box: face.boundingBox.bounds,
    };
  });
  const bounds = body.boundingBox.bounds;
  const flat: [number, number][] = [];
  for (let i = 0; i < m.vertices.length; i += 3)
    flat.push([m.vertices[i]!, m.vertices[i + 1]!]);
  return {
    positions: Float32Array.from(m.vertices),
    normals: Float32Array.from(m.normals),
    indices: Uint32Array.from(m.triangles),
    faceGroups: m.faceGroups.map((g) => ({
      ...g,
      faceId: byHash.get(g.faceId) ?? -1,
    })),
    faces,
    edges: Float32Array.from(e.lines),
    bounds,
    outline: hullOf(flat),
    silhouette: null,
  };
};
