/**
 * Panels: the flat boards a piece is built from, each an axis-aligned
 * box, and the pure geometry that moves, snaps and resizes them.
 *
 * The model and the snapping are Panelizer's (Sunny Pelletier, MIT;
 * see LICENSES.md), rewritten to the house's conventions: millimetres
 * throughout, the piece's frame x across the front, y up and z towards
 * the viewer, each panel's `position` its centre. Nothing here knows
 * about rendering, stores or units.
 */

import type { Feature } from "./features";

/** the axis a panel's thickness runs along; its face lies in the plane
    of the other two */
export type Axis = "x" | "y" | "z";
/** which face edge the grain runs along, for nesting on a sheet;
    `none` lets the part turn for a tighter fit */
export type Grain = "length" | "width" | "none";
/** what a panel is, for its price: a door carries its hinges and
    handle */
export type PanelKind = "panel" | "door";

export type Vec3 = [number, number, number];

/** one rectangular panel: a face `length` × `width`, a `thickness`
    along its `normal`, its centre at `position`, and the machining on
    it (features.ts) */
export type Panel = {
  id: string;
  name: string;
  normal: Axis;
  length: number;
  width: number;
  thickness: number;
  position: Vec3;
  grain: Grain;
  kind: PanelKind;
  features?: Feature[];
};

/** the thickness a new panel takes, mm */
export const PANEL_THICKNESS = 18;
/** how near a face must come to a neighbour's line before it goes to
    it, mm */
export const SNAP_MM = 15;
/** nearer than this two faces are the same joint, mm: a joint meant to
    touch lands on floats, and a 2 mm door reveal is deliberate */
export const JOINT_TOL = 1.5;
/** the least a face may be dragged down to, mm */
const MIN_SIZE_MM = 1;

/** the woodworker's default: the grain runs along the longer edge */
export const defaultGrain = (length: number, width: number): Grain =>
  width > length ? "width" : "length";

/** a panel's box in the piece's frame, mm, from its logical sizes: the
    thickness along the normal, length and width over the other two
    (an upright side: length along z, width up; a shelf: length across,
    width along z; a back or a door: length across, width up) */
export const panelBoxSize = ({
  length,
  width,
  thickness,
  normal,
}: Pick<Panel, "length" | "width" | "thickness" | "normal">): Vec3 => {
  switch (normal) {
    case "x":
      return [thickness, width, length];
    case "y":
      return [length, thickness, width];
    case "z":
      return [length, width, thickness];
  }
};

export type Dimension = "length" | "width" | "thickness";
const AXIS_FIELD: Record<Axis, [Dimension, Dimension, Dimension]> = {
  x: ["thickness", "width", "length"],
  y: ["length", "thickness", "width"],
  z: ["length", "width", "thickness"],
};
/** the inverse of `panelBoxSize`: which of a panel's sizes a world
    axis (0 x, 1 y, 2 z) reads */
export const axisField = (normal: Axis, axis: 0 | 1 | 2): Dimension =>
  AXIS_FIELD[normal][axis];

/** an axis-aligned box, mm */
export type Bounds = { min: Vec3; max: Vec3 };

export const boundsFromCentre = (centre: Vec3, size: Vec3): Bounds => ({
  min: [0, 1, 2].map((i) => centre[i]! - size[i]! / 2) as Vec3,
  max: [0, 1, 2].map((i) => centre[i]! + size[i]! / 2) as Vec3,
});

export const panelBounds = (p: Panel, position = p.position): Bounds =>
  boundsFromCentre(position, panelBoxSize(p));

/** the box round a set of panels, or none for no panels */
export const boundsOf = (panels: readonly Panel[]): Bounds | null => {
  if (!panels.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of panels) {
    const b = panelBounds(p);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, b.min[i]!);
      max[i] = Math.max(max[i]!, b.max[i]!);
    }
  }
  return { min, max };
};

/** a box's size, mm: across, up, out */
export const sizeOf = (b: Bounds) => ({
  width: Math.round(b.max[0] - b.min[0]),
  depth: Math.round(b.max[2] - b.min[2]),
  height: Math.round(b.max[1] - b.min[1]),
});

/** the first id of `prefix-n` no panel has yet */
export const freeId = (panels: readonly Panel[], prefix: string) => {
  let n = 1;
  while (panels.some((p) => p.id === `${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
};

/** whether two boxes overlap on both axes other than `axis`: the gate
    for "could these faces meet here", so a panel passing a distant one
    in another plane never snaps to it across empty space; a shared
    edge counts, `tol` adds slack */
export const overlapsPerpendicular = (
  a: Bounds,
  b: Bounds,
  axis: number,
  tol = 0,
): boolean => {
  for (let k = 0; k < 3; k++) {
    if (k === axis) continue;
    if (a.max[k]! < b.min[k]! - tol || a.min[k]! > b.max[k]! + tol)
      return false;
  }
  return true;
};

/** where two boxes overlap, axis by axis; on an axis where they only
    touch or do not reach the span is degenerate or inverted */
export const contactRect = (a: Bounds, b: Bounds): { lo: Vec3; hi: Vec3 } => ({
  lo: [0, 1, 2].map((i) => Math.max(a.min[i]!, b.min[i]!)) as Vec3,
  hi: [0, 1, 2].map((i) => Math.min(a.max[i]!, b.max[i]!)) as Vec3,
});

/** bounds tagged with the axis the thickness runs along: the one axis
    on which the centre line is a line worth snapping to */
type ThinBounds = Bounds & { thinAxis: 0 | 1 | 2 };
const withThinAxis = (b: Bounds): ThinBounds => {
  const ext = [0, 1, 2].map((i) => b.max[i]! - b.min[i]!);
  return { ...b, thinAxis: ext.indexOf(Math.min(...ext)) as 0 | 1 | 2 };
};

/** what a face snapped to: a neighbour's face (`butt`, whether the
    panels end up beside or over each other) or its centre line
    (`middle`, the dado's reference) */
export type SnapKind = "butt" | "middle";

/** one target lit up: the plane snapped to and the patch where the two
    boxes meet, so a guide marks only the contact, not the whole face */
export type SnapTarget = {
  plane: number;
  kind: SnapKind;
  lo: Vec3;
  hi: Vec3;
};

export type AxisSnap = { correction: number; hits: SnapTarget[] };

/** a move's snap: the correction to add to the raw delta on each axis,
    and what each axis snapped to, or null */
export type GroupSnap = {
  correction: Vec3;
  snaps: [AxisSnap | null, AxisSnap | null, AxisSnap | null];
};

/** a guide for the viewport: a flat rectangle on the snapped plane,
    spanning the contact patch on the other two axes */
export type SnapHint = {
  axis: 0 | 1 | 2;
  kind: SnapKind;
  at: Vec3;
  size: Vec3;
};

export const snapHintOf = (axis: 0 | 1 | 2, t: SnapTarget): SnapHint => {
  const at: Vec3 = [0, 0, 0];
  const size: Vec3 = [0, 0, 0];
  for (const k of [0, 1, 2] as const) {
    if (k === axis) at[k] = t.plane;
    else {
      at[k] = (t.lo[k] + t.hi[k]) / 2;
      size[k] = Math.max(0, t.hi[k] - t.lo[k]);
    }
  }
  return { axis, kind: t.kind, at, size };
};

/**
 * Snap a group of panels moved as one body. Each axis is taken on its
 * own: over every member the nearest relation to a panel outside the
 * group wins, and the correction that lands that member on its target
 * moves the whole group. A member already over a neighbour on an axis
 * is sliding across it, so its edges and centre line up with the
 * neighbour's (one correction for a flush fit, so every line lights at
 * once); a member outside butts a face onto a face. A neighbour whose
 * thickness runs along the axis offers its centre line too, to a face
 * or to the centre, for a dado or a rabbet roughed in. `members` carry
 * their proposed centres, the raw delta applied.
 */
export const snapGroupDelta = (
  members: readonly { panel: Panel; position: Vec3 }[],
  others: readonly Panel[],
  threshold = SNAP_MM,
): GroupSnap => {
  const neighbours = others.map((p) => withThinAxis(panelBounds(p)));
  const correction: Vec3 = [0, 0, 0];
  const snaps: GroupSnap["snaps"] = [null, null, null];
  for (let axis = 0; axis < 3; axis++) {
    const cands: (SnapTarget & { corr: number })[] = [];
    for (const m of members) {
      const mb = boundsFromCentre(m.position, panelBoxSize(m.panel));
      const centre = m.position[axis]!;
      const min = mb.min[axis]!;
      const max = mb.max[axis]!;
      for (const n of neighbours) {
        if (!overlapsPerpendicular(mb, n, axis)) continue;
        const nMin = n.min[axis]!;
        const nMax = n.max[axis]!;
        const nCentre = (nMin + nMax) / 2;
        const { lo, hi } = contactRect(mb, n);
        const at = (corr: number, plane: number, kind: SnapKind) =>
          cands.push({ corr, plane, kind, lo, hi });
        if (min < nMax && max > nMin) {
          at(nMin - min, nMin, "butt");
          at(nMax - max, nMax, "butt");
        } else {
          at(nMax - min, nMax, "butt");
          at(nMin - max, nMin, "butt");
        }
        if (axis === n.thinAxis) {
          at(nCentre - centre, nCentre, "middle");
          at(nCentre - min, nCentre, "middle");
          at(nCentre - max, nCentre, "middle");
        }
      }
    }
    const win = cands.reduce<(typeof cands)[number] | null>(
      (best, c) =>
        Math.abs(c.corr) < threshold &&
        (!best || Math.abs(c.corr) < Math.abs(best.corr))
          ? c
          : best,
      null,
    );
    if (!win) continue;
    // every target sharing the winning correction, or one the panel
    // already sits on, lights up; the same plane and patch only once
    const seen = new Set<string>();
    const hits: SnapTarget[] = [];
    for (const c of cands) {
      if (Math.abs(c.corr) >= threshold) continue;
      if (Math.abs(c.corr - win.corr) > 0.5 && Math.abs(c.corr) > JOINT_TOL)
        continue;
      const r = (v: number) => Math.round(v);
      const key = `${r(c.plane)}|${c.lo.map(r).join(",")}|${c.hi.map(r).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ plane: c.plane, kind: c.kind, lo: c.lo, hi: c.hi });
    }
    correction[axis] = win.corr;
    snaps[axis] = { correction: win.corr, hits };
  }
  return { correction, snaps };
};

/** a resize's snap: the face's delta, snapped or raw, and what it
    landed on, or null */
export type FaceSnap = { delta: number; snap: SnapTarget | null };

/** while a face is dragged along its axis, it goes to the nearest of a
    neighbour's faces, or the neighbour's centre line when its thickness
    runs along the axis, within `threshold`; else the raw delta stands */
export const snapResizeFace = (
  panel: Panel,
  axis: 0 | 1 | 2,
  faceSign: 1 | -1,
  rawDelta: number,
  others: readonly Panel[],
  threshold = SNAP_MM,
): FaceSnap => {
  const self = panelBounds(panel);
  const faceStart = faceSign === 1 ? self.max[axis] : self.min[axis];
  const faceNow = faceStart + rawDelta;
  let best = threshold;
  let winner: { delta: number; snap: SnapTarget } | null = null;
  for (const other of others) {
    const b = withThinAxis(panelBounds(other));
    if (!overlapsPerpendicular(self, b, axis)) continue;
    const { lo, hi } = contactRect(self, b);
    const targets: [number, SnapKind][] = [
      [b.min[axis], "butt"],
      [b.max[axis], "butt"],
    ];
    if (axis === b.thinAxis)
      targets.push([(b.min[axis] + b.max[axis]) / 2, "middle"]);
    for (const [plane, kind] of targets) {
      const distance = Math.abs(faceNow - plane);
      if (distance >= best) continue;
      best = distance;
      winner = { delta: plane - faceStart, snap: { plane, kind, lo, hi } };
    }
  }
  return winner ?? { delta: rawDelta, snap: null };
};

export type Resize = {
  field: "length" | "width";
  value: number;
  position: Vec3;
};

/** a panel resized by one face moved `delta` along `axis` with the
    other face held: the centre shifts by half, the size by the delta;
    `symmetric` moves both faces and holds the centre. Null on the
    thickness axis: the thickness is typed, never dragged */
export const resizeAlongAxis = (
  panel: Panel,
  axis: 0 | 1 | 2,
  faceSign: 1 | -1,
  delta: number,
  symmetric = false,
): Resize | null => {
  const field = axisField(panel.normal, axis);
  if (field === "thickness") return null;
  const size = panelBoxSize(panel)[axis];
  const value = Math.max(
    MIN_SIZE_MM,
    size + delta * faceSign * (symmetric ? 2 : 1),
  );
  const position: Vec3 = [...panel.position];
  if (!symmetric) position[axis] += delta / 2;
  return { field, value, position };
};

/** a box where two panels stand in the same space, mm: where a joint
    lives (a butt by default), shown, never an error; a sliver under
    JOINT_TOL is a joint that rounds past flush */
export type Overlap = { centre: Vec3; size: Vec3 };

export const overlapBoxes = (panels: readonly Panel[]): Overlap[] => {
  const bounds = panels.map((p) => panelBounds(p));
  const out: Overlap[] = [];
  for (let i = 0; i < panels.length; i++)
    for (let j = i + 1; j < panels.length; j++) {
      const { lo, hi } = contactRect(bounds[i]!, bounds[j]!);
      if ([0, 1, 2].some((a) => hi[a]! - lo[a]! < JOINT_TOL)) continue;
      out.push({
        centre: [0, 1, 2].map((a) => (lo[a]! + hi[a]!) / 2) as Vec3,
        size: [0, 1, 2].map((a) => hi[a]! - lo[a]!) as Vec3,
      });
    }
  return out;
};

/** one line of a parts list: the panels of one size and kind, counted */
export type PanelRow = {
  length: number;
  width: number;
  thickness: number;
  kind: PanelKind;
  quantity: number;
  names: string[];
  ids: string[];
};

/** the panels counted by size (the longer edge first, so a 600 × 400
    and a 400 × 600 are the same part), largest first */
export const panelRows = (panels: readonly Panel[]): PanelRow[] => {
  const rows = new Map<string, PanelRow>();
  for (const p of panels) {
    const [length, width] = [Math.round(p.length), Math.round(p.width)].sort(
      (a, b) => b - a,
    ) as [number, number];
    const thickness = Math.round(p.thickness);
    const key = `${length}x${width}x${thickness}@${p.kind}`;
    const row = rows.get(key);
    if (row) {
      row.quantity++;
      row.names.push(p.name);
      row.ids.push(p.id);
    } else
      rows.set(key, {
        length,
        width,
        thickness,
        kind: p.kind,
        quantity: 1,
        names: [p.name],
        ids: [p.id],
      });
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.length - a.length || b.width - a.width || b.thickness - a.thickness,
  );
};

/** the spec a part is priced from: "564 × 380 × 18 mm" */
export const panelSpec = (p: Pick<Panel, "length" | "width" | "thickness">) =>
  `${Math.round(p.length)} × ${Math.round(p.width)} × ${Math.round(p.thickness)} mm`;
