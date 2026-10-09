import type { Vec3 } from "./panels";
import { rectangleSketch, type Sketch } from "./sketch";

/**
 * A part: sketches on planes, turned into one solid by an ordered
 * history of features, as Fusion's timeline has it. Nothing here
 * touches a kernel: the studio's part worker reads a Part and builds
 * it with replicad, feature by feature, and reports each one's state.
 * Millimetres throughout; the part's own frame has x across, y into
 * the depth and z up, the XY plane its floor.
 *
 * An edge or a face a feature works on is never kept by its index in
 * the kernel (which changes with every rebuild, the topological naming
 * problem) but by a rule that finds it again: the edges lying in a
 * plane, running along an axis, of a length, through a point, within a
 * box. A fillet on "the edges in the plane z = 18" stays on the top
 * edges when the sketch under it grows.
 */
export type PlaneName = "XY" | "XZ" | "YZ";
export type Axis3 = "x" | "y" | "z";

/** a sketch laid on a plane, `at` mm along the plane's normal */
export type PartSketch = {
  id: string;
  name: string;
  plane: PlaneName;
  at: number;
  sketch: Sketch;
};

/** one rule an edge or a face must satisfy to be found again */
export type FinderRule =
  | { rule: "inPlane"; plane: PlaneName; at: number }
  | { rule: "parallelTo"; plane: PlaneName }
  | { rule: "inDirection"; axis: Axis3 }
  | { rule: "ofLength"; mm: number }
  | { rule: "containsPoint"; point: Vec3 }
  | { rule: "inBox"; from: Vec3; to: Vec3 }
  | { rule: "ofCurveType"; type: "LINE" | "CIRCLE" };
/** what is found: every edge (or face) that satisfies all the rules;
    no rule at all is every edge */
export type Finder = { rules: FinderRule[] };

/** what a new solid does to the body so far */
export type Op = "new" | "join" | "cut";

type FeatureBase = { id: string; name?: string; suppressed?: boolean };
export type PartFeature = FeatureBase &
  (
    | {
        kind: "extrude";
        sketch: string;
        distance: number;
        direction: "one" | "symmetric" | "two";
        /** the second way's distance, for `two` */
        back?: number;
        op: Op;
      }
    | {
        kind: "revolve";
        sketch: string;
        /** the sketch's own axis through its origin, or one of its lines */
        axis: "x" | "y" | { line: string };
        angle: number;
        op: Op;
      }
    | { kind: "fillet"; edges: Finder; radius: number }
    | { kind: "chamfer"; edges: Finder; distance: number }
    | { kind: "mirror"; plane: PlaneName; at: number }
    | {
        kind: "pattern";
        mode: "linear";
        axis: Axis3;
        count: number;
        spacing: number;
      }
    | { kind: "pattern"; mode: "circular"; axis: Axis3; count: number }
  );
export type FeatureKind = PartFeature["kind"];

export type Part = {
  id: string;
  name: string;
  units: "mm";
  sketches: PartSketch[];
  features: PartFeature[];
  /** a body brought in as STEP, which the features then work on */
  base?: { name: string; step: string };
};

/** how a feature came out of a build: built, failed with its words,
    left out (suppressed), or not built because an earlier one failed
    or the history was rolled back before it */
export type FeatureState = "ok" | "failed" | "suppressed" | "notBuilt";
export type FeatureStatus = {
  id: string;
  state: FeatureState;
  message?: string;
  ms?: number;
};

/** the plane's axes in the part's frame: u and v across the sketch,
    n along its normal (replicad's own XY, XZ and YZ) */
export const planeAxes = (plane: PlaneName): { u: Vec3; v: Vec3; n: Vec3 } => {
  switch (plane) {
    case "XY":
      return { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
    case "XZ":
      return { u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] };
    case "YZ":
      return { u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] };
  }
};

/** a point of a sketch on its plane, in the part's frame */
export const onPlane = (
  plane: PlaneName,
  at: number,
  u: number,
  v: number,
): Vec3 => {
  const a = planeAxes(plane);
  return [0, 1, 2].map((i) => a.u[i]! * u + a.v[i]! * v + a.n[i]! * at) as Vec3;
};

/** the plane whose normal runs along an axis, with its offset, for a
    face found at a point: a face facing up at z = 18 is in XY at 18 */
export const planeOfNormal = (
  normal: Vec3,
  point: Vec3,
  tolerance = 1e-3,
): { plane: PlaneName; at: number } | null => {
  const [x, y, z] = normal.map(Math.abs);
  if (z! > 1 - tolerance && x! < tolerance && y! < tolerance)
    return { plane: "XY", at: point[2] };
  if (y! > 1 - tolerance && x! < tolerance && z! < tolerance)
    return { plane: "XZ", at: -point[1] };
  if (x! > 1 - tolerance && y! < tolerance && z! < tolerance)
    return { plane: "YZ", at: point[0] };
  return null;
};

const ids = (part: Part) => [
  ...part.sketches.map((s) => s.id),
  ...part.features.map((f) => f.id),
];
/** an id not yet in the part, `prefix` and the next number */
export const freshPartId = (part: Part, prefix: string) => {
  const taken = new Set(ids(part));
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

/** a part of one sketch extruded: a box `length` by `width` by
    `height`, standing on the XY plane */
export const boxPart = (
  name: string,
  length: number,
  width: number,
  height: number,
): Part => ({
  id: "part",
  name,
  units: "mm",
  sketches: [
    {
      id: "s1",
      name: "Base",
      plane: "XY",
      at: 0,
      sketch: rectangleSketch(length, width),
    },
  ],
  features: [
    {
      id: "f1",
      name: "Extrude",
      kind: "extrude",
      sketch: "s1",
      distance: height,
      direction: "one",
      op: "new",
    },
  ],
});

/** the feature's words: its kind and the values that matter */
export const featureSummary = (f: PartFeature) => {
  switch (f.kind) {
    case "extrude":
      return `Extrude ${f.distance} mm${f.direction === "symmetric" ? " both ways" : f.direction === "two" ? ` and ${f.back ?? 0} mm back` : ""}${f.op === "cut" ? ", cut" : f.op === "join" ? ", join" : ""}`;
    case "revolve":
      return `Revolve ${f.angle}°${f.op === "cut" ? ", cut" : f.op === "join" ? ", join" : ""}`;
    case "fillet":
      return `Fillet ${f.radius} mm`;
    case "chamfer":
      return `Chamfer ${f.distance} mm`;
    case "mirror":
      return `Mirror across ${f.plane}${f.at ? ` at ${f.at}` : ""}`;
    case "pattern":
      return f.mode === "linear"
        ? `${f.count} along ${f.axis}, ${f.spacing} mm apart`
        : `${f.count} round ${f.axis}`;
  }
};

/** a finder rule's words */
export const ruleSummary = (r: FinderRule) => {
  switch (r.rule) {
    case "inPlane":
      return `in the ${r.plane} plane at ${r.at} mm`;
    case "parallelTo":
      return `parallel to ${r.plane}`;
    case "inDirection":
      return `along ${r.axis}`;
    case "ofLength":
      return `${r.mm} mm long`;
    case "containsPoint":
      return `through ${r.point.map((v) => Math.round(v)).join(", ")}`;
    case "inBox":
      return `within ${r.from.map(Math.round).join(", ")} to ${r.to.map(Math.round).join(", ")}`;
    case "ofCurveType":
      return r.type === "LINE" ? "straight" : "round";
  }
};
export const finderSummary = (f: Finder) =>
  f.rules.length ? f.rules.map(ruleSummary).join(" and ") : "every edge";

/** the feature moved to another place in the history */
export const moveFeature = (part: Part, id: string, to: number): Part => {
  const from = part.features.findIndex((f) => f.id === id);
  if (from < 0) return part;
  const features = [...part.features];
  const [f] = features.splice(from, 1);
  features.splice(Math.max(0, Math.min(features.length, to)), 0, f!);
  return { ...part, features };
};

export const removeFeature = (part: Part, id: string): Part => ({
  ...part,
  features: part.features.filter((f) => f.id !== id),
});

export const updateFeature = (
  part: Part,
  id: string,
  patch: Partial<PartFeature>,
): Part => ({
  ...part,
  features: part.features.map((f) =>
    f.id === id ? ({ ...f, ...patch } as PartFeature) : f,
  ),
});

export const updateSketch = (
  part: Part,
  id: string,
  patch: Partial<PartSketch>,
): Part => ({
  ...part,
  sketches: part.sketches.map((s) => (s.id === id ? { ...s, ...patch } : s)),
});

/** a sketch dropped from the part, with every feature on it */
export const removeSketch = (part: Part, id: string): Part => ({
  ...part,
  sketches: part.sketches.filter((s) => s.id !== id),
  features: part.features.filter((f) => !("sketch" in f) || f.sketch !== id),
});

/** the features a build runs, in order: up to the rollback marker
    (`upTo` features), the suppressed ones left out */
export const featuresToBuild = (part: Part, upTo?: number) =>
  part.features
    .slice(0, upTo ?? part.features.length)
    .filter((f) => !f.suppressed);

/** a drawer knob: a profile revolved about the sketch's y axis, its
    rim filleted */
export const knobPart = (): Part => ({
  id: "knob",
  name: "Drawer knob",
  units: "mm",
  sketches: [
    {
      id: "s1",
      name: "Profile",
      plane: "XZ",
      at: 0,
      sketch: {
        points: [
          { id: "a", x: 0, y: 0, fixed: true },
          { id: "b", x: 6, y: 0, fixed: false },
          { id: "c", x: 6, y: 14, fixed: false },
          { id: "d", x: 15, y: 18, fixed: false },
          { id: "e", x: 15, y: 26, fixed: false },
          { id: "f", x: 0, y: 26, fixed: false },
        ],
        loop: ["a", "b", "c", "d", "e", "f"],
        constraints: [
          { id: "ab", kind: "horizontal", a: "a", b: "b" },
          { id: "bc", kind: "vertical", a: "b", b: "c" },
          { id: "de", kind: "vertical", a: "d", b: "e" },
          { id: "ef", kind: "horizontal", a: "e", b: "f" },
          { id: "fa", kind: "vertical", a: "f", b: "a" },
          { id: "stem", kind: "distance", a: "a", b: "b", mm: 6, name: "stem" },
          {
            id: "neck",
            kind: "distance",
            a: "b",
            b: "c",
            mm: 14,
            name: "neck",
          },
          {
            id: "head",
            kind: "distance",
            a: "e",
            b: "f",
            mm: 15,
            name: "head",
          },
          { id: "lip", kind: "distance", a: "d", b: "e", mm: 8, name: "lip" },
          {
            id: "tall",
            kind: "distance",
            a: "f",
            b: "a",
            mm: 26,
            name: "tall",
          },
        ],
        corners: {},
      },
    },
  ],
  features: [
    {
      id: "f1",
      name: "Revolve",
      kind: "revolve",
      sketch: "s1",
      axis: "y",
      angle: 360,
      op: "new",
    },
    {
      id: "f2",
      name: "Fillet rim",
      kind: "fillet",
      edges: { rules: [{ rule: "inPlane", plane: "XY", at: 26 }] },
      radius: 3,
    },
  ],
});

/** a shelf bracket: an L extruded, a screw hole cut through its
    upright, the outer corner rounded and the front edges chamfered */
export const bracketPart = (): Part => ({
  id: "bracket",
  name: "Shelf bracket",
  units: "mm",
  sketches: [
    {
      id: "s1",
      name: "L",
      plane: "YZ",
      at: 0,
      sketch: {
        points: [
          { id: "a", x: 0, y: 0, fixed: true },
          { id: "b", x: 120, y: 0, fixed: false },
          { id: "c", x: 120, y: 20, fixed: false },
          { id: "d", x: 20, y: 20, fixed: false },
          { id: "e", x: 20, y: 120, fixed: false },
          { id: "f", x: 0, y: 120, fixed: false },
        ],
        loop: ["a", "b", "c", "d", "e", "f"],
        constraints: [
          { id: "ab", kind: "horizontal", a: "a", b: "b" },
          { id: "bc", kind: "vertical", a: "b", b: "c" },
          { id: "cd", kind: "horizontal", a: "c", b: "d" },
          { id: "de", kind: "vertical", a: "d", b: "e" },
          { id: "ef", kind: "horizontal", a: "e", b: "f" },
          { id: "fa", kind: "vertical", a: "f", b: "a" },
          {
            id: "reach",
            kind: "distance",
            a: "a",
            b: "b",
            mm: 120,
            name: "reach",
          },
          {
            id: "rise",
            kind: "distance",
            a: "f",
            b: "a",
            mm: 120,
            name: "rise",
          },
          { id: "arm", kind: "distance", a: "b", b: "c", mm: 20, name: "arm" },
          { id: "leg", kind: "distance", a: "e", b: "f", mm: 20, name: "leg" },
        ],
        corners: {},
      },
    },
    {
      id: "s2",
      name: "Screw hole",
      plane: "YZ",
      at: 0,
      sketch: {
        points: [{ id: "ctr", x: 10, y: 80, fixed: true }],
        loop: [],
        geometry: [{ id: "c1", kind: "circle", centre: "ctr", radius: 2.5 }],
        constraints: [{ id: "c1-r", kind: "radius", c: "c1", mm: 2.5 }],
        corners: {},
      },
    },
  ],
  features: [
    {
      id: "f1",
      name: "Extrude L",
      kind: "extrude",
      sketch: "s1",
      distance: 30,
      direction: "one",
      op: "new",
    },
    {
      id: "f2",
      name: "Screw hole",
      kind: "extrude",
      sketch: "s2",
      distance: 30,
      direction: "one",
      op: "cut",
    },
    {
      id: "f3",
      name: "Round the corner",
      kind: "fillet",
      edges: {
        rules: [
          { rule: "inDirection", axis: "x" },
          { rule: "containsPoint", point: [15, 0, 0] },
        ],
      },
      radius: 8,
    },
    {
      id: "f4",
      name: "Chamfer the front",
      kind: "chamfer",
      edges: { rules: [{ rule: "inPlane", plane: "YZ", at: 30 }] },
      distance: 1.5,
    },
  ],
});
