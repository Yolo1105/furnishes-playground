import { type Feature, featureRect } from "./features";
import type { Panel } from "./panels";
import { holesOf, outlineWithCorners, roundsOf, type Sketch } from "./sketch";

/**
 * A panel's face as DXF R12, the plainest drawing a shop's software
 * reads: the outline as a closed polyline on OUTLINE (the profile's,
 * its rounded corners as short runs, when the face is not a
 * rectangle, with the profile's own holes and round holes through it
 * on CUTOUTS), each hole a
 * circle on HOLES (its depth in the layer's name, HOLES_13), each
 * groove a closed polyline on GROOVES_<depth>, each cut-out one on
 * CUTOUTS. Millimetres, the face's corner at the origin, u along x
 * and v along y; a feature on the back face is mirrored across the
 * length, so the drawing is always the face looked at.
 */
const pair = (code: number, value: string | number) => `${code}\n${value}`;

const polyline = (layer: string, points: readonly [number, number][]) =>
  [
    pair(0, "POLYLINE"),
    pair(8, layer),
    pair(66, 1),
    pair(70, 1),
    ...points.flatMap(([x, y]) => [
      pair(0, "VERTEX"),
      pair(8, layer),
      pair(10, x.toFixed(2)),
      pair(20, y.toFixed(2)),
    ]),
    pair(0, "SEQEND"),
  ].join("\n");

const circle = (layer: string, x: number, y: number, r: number) =>
  [
    pair(0, "CIRCLE"),
    pair(8, layer),
    pair(10, x.toFixed(2)),
    pair(20, y.toFixed(2)),
    pair(40, r.toFixed(2)),
  ].join("\n");

const rect = (layer: string, u: number, v: number, w: number, h: number) =>
  polyline(layer, [
    [u, v],
    [u + w, v],
    [u + w, v + h],
    [u, v + h],
  ]);

/** a feature's u as seen from the front: one on the back is mirrored */
const seen = (p: Pick<Panel, "length">, f: Feature) =>
  f.kind !== "cutout" && f.face === "back"
    ? (u: number) => p.length - u
    : (u: number) => u;

const entity = (p: Pick<Panel, "length">, f: Feature) => {
  const m = seen(p, f);
  switch (f.kind) {
    case "hole":
      return circle(`HOLES_${Math.round(f.depth)}`, m(f.u), f.v, f.d / 2);
    case "groove": {
      const r = featureRect(f);
      const u = f.face === "back" ? p.length - r.u - r.w : r.u;
      return rect(`GROOVES_${Math.round(f.depth)}`, u, r.v, r.w, r.h);
    }
    case "cutout":
      return rect("CUTOUTS", f.u, f.v, f.w, f.h);
  }
};

/** the drawing of one panel's face, with its machining */
export const dxfOf = (
  p: Pick<Panel, "length" | "width"> & {
    features?: readonly Feature[];
    profile?: Sketch;
  },
) =>
  [
    pair(0, "SECTION"),
    pair(2, "HEADER"),
    pair(9, "$INSUNITS"),
    pair(70, 4),
    pair(0, "ENDSEC"),
    pair(0, "SECTION"),
    pair(2, "ENTITIES"),
    p.profile
      ? polyline("OUTLINE", outlineWithCorners(p.profile))
      : rect("OUTLINE", 0, 0, p.length, p.width),
    ...(p.profile ? holesOf(p.profile) : []).map((h) => polyline("CUTOUTS", h)),
    ...(p.profile ? roundsOf(p.profile) : []).map((r) =>
      circle("CUTOUTS", r.x, r.y, r.r),
    ),
    ...(p.features ?? []).map((f) => entity(p, f)),
    pair(0, "ENDSEC"),
    pair(0, "EOF"),
  ].join("\n") + "\n";
