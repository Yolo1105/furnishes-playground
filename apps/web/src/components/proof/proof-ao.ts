import { type BufferGeometry, Float32BufferAttribute } from "three";
import {
  bake,
  type BakeBox,
  type BakeChart,
  faceAxes,
  FOOT_DENSITY,
  FOOT_OUT,
  layoutCharts,
} from "../studio/lightmap-bake";
import type { Board } from "./bookcase";

/**
 * The piece's one source of ambient occlusion (round 10): the studio's
 * own bake (lightmap-bake.ts), its boards taken as boxes on the floor,
 * free-standing (no wall). Each board's faces are laid in the piece's
 * atlas and each vertex is given its place there in a second set of
 * coordinates (`uv1`), which the material's `aoMap` reads on channel 1.
 * The path tracer leaves the map out and finds the occlusion by its
 * own rays; the scan's own AO is never used. The bake's footprint is
 * the studio view's one contact shadow under the piece.
 */

export const bakePiece = (boards: readonly Board[]) => {
  const boxes: BakeBox[] = boards.map((b) => ({
    c: b.at,
    h: [b.dims[0] / 2, b.dims[1] / 2, b.dims[2] / 2],
  }));
  const { charts, size } = layoutCharts(
    boxes,
    boxes.map((_, i) => i),
    0,
  );
  const lo = [Infinity, Infinity];
  const hi = [-Infinity, -Infinity];
  for (const b of boxes) {
    lo[0] = Math.min(lo[0]!, b.c[0] - b.h[0]);
    lo[1] = Math.min(lo[1]!, b.c[2] - b.h[2]);
    hi[0] = Math.max(hi[0]!, b.c[0] + b.h[0]);
    hi[1] = Math.max(hi[1]!, b.c[2] + b.h[2]);
  }
  const foot = {
    x0: lo[0]! - FOOT_OUT,
    z0: lo[1]! - FOOT_OUT,
    x1: hi[0]! + FOOT_OUT,
    z1: hi[1]! + FOOT_OUT,
    nx: Math.ceil((hi[0]! - lo[0]! + 2 * FOOT_OUT) * FOOT_DENSITY),
    nz: Math.ceil((hi[1]! - lo[1]! + 2 * FOOT_OUT) * FOOT_DENSITY),
  };
  const began = performance.now();
  const result = bake({
    boxes,
    floor: 0,
    wall: null,
    charts,
    size,
    points: new Float32Array(0),
    owners: new Int32Array(0),
    foot,
  });
  return {
    boxes,
    charts,
    size,
    foot,
    atlas: result.atlas,
    footprint: result.foot,
    ms: performance.now() - began,
  };
};

/** the axis a normal mostly points along, and its side, as the bake
    numbers faces (axis × 2, plus 1 for +) */
const faceOf = (nx: number, ny: number, nz: number) => {
  const n = [nx, ny, nz];
  const a = n.map(Math.abs);
  const axis = a[0]! >= a[1]! && a[0]! >= a[2]! ? 0 : a[1]! >= a[2]! ? 1 : 2;
  return axis * 2 + (n[axis]! > 0 ? 1 : 0);
};

/** each vertex of board `k`'s geometry (centred on the board) its place
    in the atlas, as `uv1` */
export const giveAoUv = (
  g: BufferGeometry,
  k: number,
  box: BakeBox,
  charts: readonly BakeChart[],
  size: [number, number],
) => {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv1 = new Float32Array(pos.count * 2);
  const mine = new Map<number, BakeChart>();
  for (const c of charts) if (c.box === k) mine.set(c.face, c);
  for (let i = 0; i < pos.count; i++) {
    const face = faceOf(nor.getX(i), nor.getY(i), nor.getZ(i));
    const c = mine.get(face);
    if (!c) {
      // a face the bake did not lay out is never seen
      uv1[i * 2] = 0.5 / size[0];
      uv1[i * 2 + 1] = 0.5 / size[1];
      continue;
    }
    const [u, v] = faceAxes(face);
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const s = Math.min(1, Math.max(0, (p[u]! + box.h[u]!) / (2 * box.h[u]!)));
    const t = Math.min(1, Math.max(0, (p[v]! + box.h[v]!) / (2 * box.h[v]!)));
    uv1[i * 2] = (c.x + s * c.w) / size[0];
    uv1[i * 2 + 1] = (c.y + t * c.h) / size[1];
  }
  g.setAttribute("uv1", new Float32BufferAttribute(uv1, 2));
};
