"use client";

import { unpickable } from "./no-pick";
import { useThree } from "@react-three/fiber";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  type BufferGeometry,
  Euler,
  type Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import {
  type BakeBox,
  type BakeChart,
  type BakeJob,
  type BakeResult,
  bakeKey,
  faceAxes,
  FOOT_DENSITY,
  FOOT_OUT,
  layoutCharts,
  type V3,
} from "./lightmap-bake";
import { ATLAS_SIZE, FOOT_HEIGHT, WHITE_UV } from "./bake-defaults";
import {
  awaiting,
  bakeOf,
  giveBack,
  paint,
  type Rect,
  take,
  useBakes,
} from "./lightmap";
import { FOOTPRINT } from "./lightmap-nodes";
import type { Part } from "./part-geometry";

/**
 * A piece's bake, in the scene (round 8, 1a): `BakeScope` stands round
 * a piece's form, its parts tell it what they are as they are drawn
 * (`useBakeMembers`), and once they have stopped changing it takes them
 * as boxes in its own frame, bakes them (lightmap.ts, in a worker, kept
 * by key), and hands the light back: each board's faces their second UV
 * set into the atlas, every other part its vertices' `lm`, and a soft
 * footprint laid on the floor under it. Until then the piece is drawn as
 * it always was (the parts' defaults read the atlas's white corner).
 */

/** a merged batch of a built piece's parts (finish.tsx's Built): its
    parts, and the vertices each takes in its geometry */
type Boards = {
  kind: "boards";
  mesh: Mesh;
  parts: Part[];
  ranges: [number, number][];
};
/** a part drawn alone (a cushion, a leg, a shelf's books): its box in
    its own frame, and whether its geometry is shared (kept by size) and
    must be copied before its vertices take their light */
type Solid = {
  kind: "solid";
  mesh: Mesh;
  box: { c: V3; h: V3 };
  shared: boolean;
  /** its vertices take their light (none for a model drawn in its own
      materials, whose box stands only for its footprint) */
  points?: boolean;
};
export type Member = Boards | Solid;

class Registry {
  members = new Set<Member>();
  private changed: (() => void) | null = null;
  /** `f` told of each change from now, until the returned call */
  listen(f: () => void) {
    this.changed = f;
    return () => {
      if (this.changed === f) this.changed = null;
    };
  }
  add(m: Member) {
    this.members.add(m);
    this.changed?.();
  }
  remove(m: Member) {
    this.members.delete(m);
    this.changed?.();
  }
}

const BakeContext = createContext<Registry | null>(null);

/** a part tells its piece's bake what it is, while it is drawn (a
    built piece's batches, several at once); outside a piece's bake (a
    room's own rods) it tells no one */
export const useBakeMembers = (
  make: () => Member[],
  deps: readonly unknown[],
) => {
  const r = useContext(BakeContext);
  useLayoutEffect(() => {
    if (!r) return;
    const ms = make();
    for (const m of ms) r.add(m);
    return () => {
      for (const m of ms) r.remove(m);
    };
    // the members are made again only when what they are made of changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, ...deps]);
};

/** how long the parts must hold still before the bake, ms */
const SETTLE_MS = 150;
/** a piece no taller than this lies flat on the floor (a rug), m */
const FLAT = 0.05;

/** a matrix's turn as rows, or none for no turn */
const turnOf = (m: Matrix4) => {
  const q = new Quaternion();
  m.decompose(new Vector3(), q, new Vector3());
  if (Math.abs(q.w) > 0.999999) return undefined;
  const e = new Matrix4().makeRotationFromQuaternion(q).elements;
  // three's elements are column-major
  return [e[0]!, e[4]!, e[8]!, e[1]!, e[5]!, e[9]!, e[2]!, e[6]!, e[10]!];
};
const boxAt = (m: Matrix4, c: V3, h: V3): BakeBox => {
  const at = new Vector3(...c).applyMatrix4(m);
  return { c: [at.x, at.y, at.z], h, m: turnOf(m) };
};
const partMatrix = (p: Part) =>
  new Matrix4().compose(
    new Vector3(...p.at),
    new Quaternion().setFromEuler(new Euler(...(p.rotation ?? [0, 0, 0]))),
    new Vector3(1, 1, 1),
  );
/** a rod's box: a square a little inside its circle, to stand for it */
const ROD_SQUARE = 0.85;

type Assembled = {
  job: BakeJob;
  /** for each board: where its vertices are and which box it is */
  boards: { mesh: Mesh; range: [number, number]; box: number; inv: Matrix4 }[];
  /** for each point run: the mesh and its first point */
  runs: { member: Member; mesh: Mesh; range: [number, number]; from: number }[];
};

const assemble = (
  g: Group,
  members: Member[],
  wall: number | null,
): Assembled | null => {
  const inv = new Matrix4().copy(g.matrixWorld).invert();
  const boxes: BakeBox[] = [];
  const boardIds: number[] = [];
  const boards: Assembled["boards"] = [];
  const pts: number[] = [];
  const owners: number[] = [];
  const runs: Assembled["runs"] = [];
  const v = new Vector3();
  const n = new Vector3();
  const pointsOf = (
    member: Member,
    mesh: Mesh,
    m: Matrix4,
    range: [number, number],
    owner: number,
  ) => {
    const pos = mesh.geometry.getAttribute("position");
    const nor = mesh.geometry.getAttribute("normal");
    if (!pos || !nor) return;
    const turn = new Matrix4().extractRotation(m);
    runs.push({ member, mesh, range, from: owners.length });
    for (let i = range[0]; i < range[0] + range[1]; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      n.fromBufferAttribute(nor, i).applyMatrix4(turn).normalize();
      pts.push(v.x, v.y, v.z, n.x, n.y, n.z);
      owners.push(owner);
    }
  };
  for (const member of members) {
    const mesh = member.mesh;
    if (!mesh.parent) continue;
    const m = new Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
    if (member.kind === "boards") {
      member.parts.forEach((p, i) => {
        const pm = new Matrix4().multiplyMatrices(m, partMatrix(p));
        const range = member.ranges[i]!;
        if ("dims" in p) {
          const k = boxes.length;
          boxes.push(
            boxAt(pm, [0, 0, 0], [p.dims[0] / 2, p.dims[1] / 2, p.dims[2] / 2]),
          );
          boardIds.push(k);
          boards.push({
            mesh,
            range,
            box: k,
            inv: new Matrix4().copy(partMatrix(p)).invert(),
          });
        } else {
          const [r, h, top] = p.rod;
          const s = Math.max(r, top ?? r) * ROD_SQUARE;
          const k = boxes.length;
          boxes.push(boxAt(pm, [0, 0, 0], [s, h / 2, s]));
          pointsOf(member, mesh, m, range, k);
        }
      });
    } else {
      const k = boxes.length;
      boxes.push(boxAt(m, member.box.c, member.box.h));
      if (member.points === false) continue;
      const count = mesh.geometry.getAttribute("position")?.count ?? 0;
      pointsOf(member, mesh, m, [0, count], k);
    }
  }
  if (!boxes.length) return null;
  const floor = 0;
  const { charts, size } = layoutCharts(boxes, boardIds, floor);
  // the floor round it: the boxes' reach on the floor, and a margin
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const b of boxes) {
    const r = Math.hypot(...b.h);
    const reach = b.m ? r : 0;
    x0 = Math.min(x0, b.c[0] - (b.m ? reach : b.h[0]));
    x1 = Math.max(x1, b.c[0] + (b.m ? reach : b.h[0]));
    z0 = Math.min(z0, b.c[2] - (b.m ? reach : b.h[2]));
    z1 = Math.max(z1, b.c[2] + (b.m ? reach : b.h[2]));
  }
  x0 -= FOOT_OUT;
  x1 += FOOT_OUT;
  z1 += FOOT_OUT;
  z0 = wall !== null ? Math.max(wall, z0 - FOOT_OUT) : z0 - FOOT_OUT;
  const foot = {
    x0,
    z0,
    x1,
    z1,
    nx: Math.max(2, Math.ceil((x1 - x0) * FOOT_DENSITY)),
    nz: Math.max(2, Math.ceil((z1 - z0) * FOOT_DENSITY)),
  };
  return {
    job: {
      boxes,
      floor,
      wall,
      charts,
      size,
      points: new Float32Array(pts),
      owners: new Int32Array(owners),
      foot,
    },
    boards,
    runs,
  };
};

/** what a bake left behind, to take back when the piece is baked again
    or goes */
type Applied = {
  rects: Rect[];
  /** a shared geometry's copy given to a mesh: the mesh, its own, the copy */
  clones: [Mesh, BufferGeometry, BufferGeometry][];
  foot: Mesh | null;
};

const apply = (g: Group, a: Assembled, r: BakeResult): Applied => {
  const out: Applied = { rects: [], clones: [], foot: null };
  const [W, H] = a.job.size;
  const rect = a.job.charts.length ? take(W, H) : null;
  if (rect) {
    out.rects.push(rect);
    paint(rect, r.atlas, true);
  }
  // the charts by box and face
  const chartOf = new Map<number, BakeChart>();
  for (const c of a.job.charts) chartOf.set(c.box * 6 + c.face, c);
  const touched = new Set<BufferGeometry>();
  const v = new Vector3();
  const n = new Vector3();
  for (const b of a.boards) {
    const geo = b.mesh.geometry;
    const uv1 = geo.getAttribute("uv1");
    const pos = geo.getAttribute("position");
    const nor = geo.getAttribute("normal");
    if (!uv1 || !pos || !nor) continue;
    const box = a.job.boxes[b.box]!;
    const turn = new Matrix4().extractRotation(b.inv);
    for (let i = b.range[0]; i < b.range[0] + b.range[1]; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(b.inv);
      n.fromBufferAttribute(nor, i).applyMatrix4(turn);
      const ax = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
      const axis =
        ax[0]! >= ax[1]! && ax[0]! >= ax[2]! ? 0 : ax[1]! >= ax[2]! ? 1 : 2;
      const sign = [n.x, n.y, n.z][axis]! > 0 ? 1 : 0;
      const face = axis * 2 + sign;
      const c = rect ? chartOf.get(b.box * 6 + face) : undefined;
      if (!c || !rect) {
        uv1.setXY(i, WHITE_UV, WHITE_UV);
        continue;
      }
      const [u, w] = faceAxes(face);
      const l = [v.x, v.y, v.z];
      const s = Math.min(1, Math.max(0, (l[u]! / box.h[u]! + 1) / 2));
      const t = Math.min(1, Math.max(0, (l[w]! / box.h[w]! + 1) / 2));
      uv1.setXY(
        i,
        (rect.x + c.x + s * c.w) / ATLAS_SIZE,
        (rect.y + c.y + t * c.h) / ATLAS_SIZE,
      );
    }
    uv1.needsUpdate = true;
    touched.add(geo);
  }
  // the points: their own copy of a shared geometry first
  for (const run of a.runs) {
    const mesh = run.mesh;
    if (run.member.kind === "solid" && run.member.shared) {
      const own = mesh.geometry;
      if (!out.clones.some(([m]) => m === mesh)) {
        const copy = own.clone();
        mesh.geometry = copy;
        out.clones.push([mesh, own, copy]);
      }
    }
    const lm = mesh.geometry.getAttribute("lm");
    if (!lm) continue;
    for (let i = 0; i < run.range[1]; i++) {
      const k = run.from + i;
      lm.setXY(
        run.range[0] + i,
        1 - r.points[k * 2]! / 255,
        1 - r.points[k * 2 + 1]! / 255,
      );
    }
    lm.needsUpdate = true;
  }
  // the footprint, on the floor under the piece: none under a thing
  // lying flat on the floor (a rug, a mat), which only covers it
  const f = a.job.foot;
  const tall = a.job.boxes.some((b) => b.c[1] + Math.hypot(...b.h) > FLAT);
  const frect = tall ? take(f.nx, f.nz) : null;
  if (frect) {
    out.rects.push(frect);
    paint(frect, r.foot, false);
    const plane = new PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0);
    plane.rotateX(-Math.PI / 2);
    plane.translate(
      (f.x0 + f.x1) / 2,
      a.job.floor + FOOT_HEIGHT,
      (f.z0 + f.z1) / 2,
    );
    // the plane's uv into the footprint's texels: x across, z down
    const uv = plane.getAttribute("uv");
    const p = plane.getAttribute("position");
    for (let i = 0; i < uv.count; i++) {
      const s = (p.getX(i) - f.x0) / (f.x1 - f.x0);
      const t = (p.getZ(i) - f.z0) / (f.z1 - f.z0);
      uv.setXY(
        i,
        (frect.x + 0.5 + s * (f.nx - 1)) / ATLAS_SIZE,
        (frect.y + 0.5 + t * (f.nz - 1)) / ATLAS_SIZE,
      );
    }
    const foot = new Mesh(plane, FOOTPRINT);
    foot.raycast = unpickable;
    foot.renderOrder = 1;
    foot.userData = { name: "Footprint" };
    g.add(foot);
    out.foot = foot;
  }
  return out;
};

const undo = (a: Applied) => {
  a.rects.forEach(giveBack);
  for (const [mesh, own, copy] of a.clones) {
    // a mesh drawn since with another geometry keeps that one
    if (mesh.geometry === copy) mesh.geometry = own;
    copy.dispose();
  }
  if (a.foot) {
    a.foot.removeFromParent();
    a.foot.geometry.dispose();
  }
};

/** a piece's bake: round its form, named for the bake times, with the
    wall behind it (its plane, z in the piece's frame) when it stands
    against one */
export function BakeScope({
  name,
  wall,
  children,
}: {
  name: string;
  wall: number | null;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const registry = useMemo(() => new Registry(), []);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let timer = 0;
    let turn = 0;
    let done: Applied | null = null;
    const go = async () => {
      const g = group.current;
      if (!g || !registry.members.size) {
        awaiting(me, false);
        return;
      }
      const mine = ++turn;
      g.updateWorldMatrix(true, true);
      const a = assemble(g, [...registry.members], wall);
      if (!a) {
        awaiting(me, false);
        return;
      }
      const near = camera.position.distanceTo(
        g.getWorldPosition(new Vector3()),
      );
      const r = await bakeOf(bakeKey(a.job), a.job, name, near);
      // the piece changed while it baked: the next bake has it
      if (mine !== turn || !group.current) return;
      if (done) undo(done);
      done = apply(g, a, r);
      awaiting(me, false);
      invalidate();
    };
    const me = {};
    const changed = () => {
      window.clearTimeout(timer);
      awaiting(me, true);
      timer = window.setTimeout(() => void go(), SETTLE_MS);
    };
    const stop = registry.listen(changed);
    changed();
    // the atlas goes to the GPU a moment after a bake lands: the frame
    // that shows it is drawn then (the canvas draws on demand)
    const unsent = useBakes.subscribe((s, was) => {
      if (s.sent !== was.sent) invalidate();
    });
    return () => {
      window.clearTimeout(timer);
      turn++;
      stop();
      unsent();
      awaiting(me, false);
      if (done) undo(done);
    };
  }, [registry, wall, name, camera, invalidate]);
  return (
    <group ref={group}>
      <BakeContext.Provider value={registry}>{children}</BakeContext.Provider>
    </group>
  );
}
