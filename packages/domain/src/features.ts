import type { Panel } from "./panels";

/**
 * Machining on a panel: holes, grooves and cut-outs, each in the
 * panel's own frame (u along its length, v along its width, from the
 * corner of the face, mm; a depth into the thickness, or through).
 * The studio draws them on the panel as marks; the DXF of the panel
 * carries them to the shop; the cut list counts the panel the same
 * with or without them. The presets are the shop's: the 32 mm system
 * for shelf pins (5 mm holes, 13 mm deep, 37 mm in from the front
 * edge), a hinge's 35 mm cup, and a 6 mm groove for a back.
 */
export type Face = "front" | "back";

export type Hole = {
  id: string;
  kind: "hole";
  face: Face;
  u: number;
  v: number;
  /** diameter, mm */
  d: number;
  /** depth, mm; the thickness or more is through */
  depth: number;
};
export type Groove = {
  id: string;
  kind: "groove";
  face: Face;
  /** from one point to another, along the face */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  depth: number;
};
export type Cutout = {
  id: string;
  kind: "cutout";
  /** a rectangle through the panel */
  u: number;
  v: number;
  w: number;
  h: number;
};
export type Feature = Hole | Groove | Cutout;

/** the 32 mm system: pins every 32 mm, 5 mm holes 13 mm deep, the
    row 37 mm in from the edge */
export const SYSTEM = { pitch: 32, d: 5, depth: 13, inset: 37 } as const;
/** a concealed hinge's cup: 35 mm across, 13 mm deep, its centre
    22.5 mm in from the door's edge */
export const HINGE = { d: 35, depth: 13, inset: 22.5 } as const;
/** a back panel's groove: 6 mm wide, 10 mm deep, 10 mm in from the
    back edge */
export const BACK_GROOVE = { width: 6, depth: 10, inset: 10 } as const;

/** the first id of `prefix-n` no feature has yet */
const freeId = (features: readonly Feature[], prefix: string) => {
  let n = 1;
  while (features.some((f) => f.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};

/** a feature's box on the face, mm: u, v, w, h */
export const featureRect = (f: Feature) => {
  switch (f.kind) {
    case "hole":
      return { u: f.u - f.d / 2, v: f.v - f.d / 2, w: f.d, h: f.d };
    case "groove": {
      const along = Math.hypot(f.u1 - f.u0, f.v1 - f.v0);
      const horizontal = Math.abs(f.u1 - f.u0) >= Math.abs(f.v1 - f.v0);
      return horizontal
        ? {
            u: Math.min(f.u0, f.u1),
            v: (f.v0 + f.v1) / 2 - f.width / 2,
            w: along,
            h: f.width,
          }
        : {
            u: (f.u0 + f.u1) / 2 - f.width / 2,
            v: Math.min(f.v0, f.v1),
            w: f.width,
            h: along,
          };
    }
    case "cutout":
      return { u: f.u, v: f.v, w: f.w, h: f.h };
  }
};

/** whether a feature lies on the panel's face, wholly */
export const onFace = (p: Pick<Panel, "length" | "width">, f: Feature) => {
  const r = featureRect(f);
  return r.u >= 0 && r.v >= 0 && r.u + r.w <= p.length && r.v + r.h <= p.width;
};

/** two rows of system holes up a panel's width (a side's height), one
    near each long edge, from `from` to `to` along v; on the front face */
export const systemHoles = (
  p: Pick<Panel, "length" | "width">,
  features: readonly Feature[] = [],
  from = SYSTEM.pitch,
  to = p.width - SYSTEM.pitch,
): Hole[] => {
  const out: Hole[] = [];
  const all = [...features];
  for (const u of [SYSTEM.inset, p.length - SYSTEM.inset])
    for (let v = from; v <= to; v += SYSTEM.pitch) {
      const hole: Hole = {
        id: freeId(all, "pin"),
        kind: "hole",
        face: "front",
        u,
        v,
        d: SYSTEM.d,
        depth: SYSTEM.depth,
      };
      all.push(hole);
      out.push(hole);
    }
  return out;
};

/** a door's hinge cups on its back: two near the ends of one long
    edge (a third in the middle past 900 mm) */
export const hingeCups = (
  p: Pick<Panel, "length" | "width">,
  features: readonly Feature[] = [],
): Hole[] => {
  const tall = p.width;
  const vs = tall > 900 ? [100, tall / 2, tall - 100] : [100, tall - 100];
  const all = [...features];
  return vs.map((v) => {
    const cup: Hole = {
      id: freeId(all, "cup"),
      kind: "hole",
      face: "back",
      u: HINGE.inset,
      v,
      d: HINGE.d,
      depth: HINGE.depth,
    };
    all.push(cup);
    return cup;
  });
};

/** a groove for a back, along the panel's length near its back
    edge, on the inner face */
export const backGroove = (
  p: Pick<Panel, "length" | "width">,
  features: readonly Feature[] = [],
): Groove => ({
  id: freeId(features, "groove"),
  kind: "groove",
  face: "front",
  u0: 0,
  v0: BACK_GROOVE.inset + BACK_GROOVE.width / 2,
  u1: p.length,
  v1: BACK_GROOVE.inset + BACK_GROOVE.width / 2,
  width: BACK_GROOVE.width,
  depth: BACK_GROOVE.depth,
});

/** a cut-out in the middle of the face, a quarter of it each way */
export const middleCutout = (
  p: Pick<Panel, "length" | "width">,
  features: readonly Feature[] = [],
): Cutout => ({
  id: freeId(features, "cutout"),
  kind: "cutout",
  u: p.length * 0.375,
  v: p.width * 0.375,
  w: p.length * 0.25,
  h: p.width * 0.25,
});

/** what a feature reads as in a list: "5 mm hole, 13 deep at 37, 64" */
export const featureLabel = (f: Feature) => {
  switch (f.kind) {
    case "hole":
      return `${f.d} mm hole, ${f.depth} deep at ${Math.round(f.u)}, ${Math.round(f.v)}`;
    case "groove":
      return `${f.width} mm groove, ${f.depth} deep from ${Math.round(f.u0)}, ${Math.round(f.v0)} to ${Math.round(f.u1)}, ${Math.round(f.v1)}`;
    case "cutout":
      return `${Math.round(f.w)} × ${Math.round(f.h)} cut-out at ${Math.round(f.u)}, ${Math.round(f.v)}`;
  }
};

/** which face of a panel looks into the piece: the one on the side of
    the normal axis toward the piece's middle (a side's inner face, a
    door's inside, the top's underside); the front for a panel at the
    middle itself */
export const innerFace = (p: Pick<Panel, "normal" | "position">): Face => {
  const axis = p.normal === "x" ? 0 : p.normal === "y" ? 1 : 2;
  return p.position[axis] > 0 ? "back" : "front";
};

/** a feature's mark on the panel, in the piece's frame, mm: its
    centre on the face (a hair out of it, so it draws over the wood)
    and its box, u and v laid along the face's axes; `round` for a
    hole. The front face is the one on the +axis side of the panel,
    u running along the length from the face's left as looked at, v
    up the width; the back face is looked at from behind, so u runs
    the other way */
export const featureMark = (
  p: Pick<Panel, "normal" | "length" | "width" | "thickness" | "position">,
  f: Feature,
): {
  centre: [number, number, number];
  size: [number, number, number];
  round: boolean;
} => {
  const r = featureRect(f);
  const face: Face = f.kind === "cutout" ? "front" : f.face;
  const sign = face === "front" ? 1 : -1;
  // the mark's middle on the face, and its spread, along u and v
  const cu = r.u + r.w / 2;
  const cv = r.v + r.h / 2;
  const u = (face === "front" ? cu : p.length - cu) - p.length / 2;
  const v = cv - p.width / 2;
  const out = (p.thickness / 2 + MARK_OUT) * sign;
  const [x, y, z] = p.position;
  const thin = MARK;
  switch (p.normal) {
    case "z":
      return {
        centre: [x + u, y + v, z + out],
        size: [r.w, r.h, thin],
        round: f.kind === "hole",
      };
    case "y":
      return {
        centre: [x + u, y + out, z + v],
        size: [r.w, thin, r.h],
        round: f.kind === "hole",
      };
    case "x":
      return {
        centre: [x + out, y + v, z + u],
        size: [thin, r.h, r.w],
        round: f.kind === "hole",
      };
  }
};
/** a mark's thickness, mm, and how far it stands off the face */
const MARK = 1;
const MARK_OUT = 0.3;
