"use client";

import type {
  Feature,
  FeatureStatus,
  Panel,
  Part,
  Sketch,
  SketchSolve,
} from "@furnishes/domain";
import { toMetres } from "@furnishes/scene";
import { useEffect, useState } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { create } from "zustand";
import type { CutMesh } from "./cut-solid";
import type { FaceInfo, PartMesh } from "./part-build";
import type { PartAnswer, PartAsk, Solid } from "./part.worker";

/**
 * The studio's side of the part worker (part.worker.ts): one worker,
 * made the first time a profile is asked for; each request answered
 * by its id. A profile's solid is kept once made, by its shape, so a
 * panel drawn again is not rebuilt. `usePartStore.pending` counts the
 * requests under way, which the stage says (`data-parts`), so a test
 * can wait for a solid.
 */
/** a part item as last built: its mesh (none when nothing stood), each
    feature's state, and the key it was built for */
export type PartBuilt = {
  key: string;
  mesh: PartMesh | null;
  statuses: FeatureStatus[];
  ms: number;
};
type PartState = {
  pending: number;
  failed: string | null;
  /** the part items built, by their node id */
  built: Record<string, PartBuilt>;
  /** how many builds have come back, which the stage says
      (`data-part-builds`) so a test can wait for the next */
  builds: number;
  /** the rollback marker on a part's history: how many features are
      built; unset is all of them */
  upTo: Record<string, number>;
  /** the feature (or sketch) open for editing in the Detail tab */
  editing: { id: string; feature?: string; sketch?: string } | null;
  /** a face is being picked on the stage for the feature in hand */
  picking: boolean;
  /** the face last picked, whose other readings the form offers */
  pickedFace: FaceInfo | null;
  setBuilt: (id: string, built: PartBuilt | null) => void;
  setUpTo: (id: string, upTo: number | undefined) => void;
  setEditing: (e: PartState["editing"]) => void;
  setPicking: (on: boolean) => void;
  setPickedFace: (face: FaceInfo | null) => void;
};
export const usePartStore = create<PartState>((set) => ({
  pending: 0,
  failed: null,
  built: {},
  builds: 0,
  upTo: {},
  editing: null,
  picking: false,
  pickedFace: null,
  setBuilt: (id, built) =>
    set((s) => {
      const next = { ...s.built };
      if (built) next[id] = built;
      else delete next[id];
      return { built: next, builds: s.builds + (built ? 1 : 0) };
    }),
  setUpTo: (id, upTo) =>
    set((s) => {
      const next = { ...s.upTo };
      if (upTo === undefined) delete next[id];
      else next[id] = upTo;
      return { upTo: next };
    }),
  setEditing: (editing) => set({ editing, picking: false, pickedFace: null }),
  setPicking: (picking) => set({ picking }),
  setPickedFace: (pickedFace) => set({ pickedFace, picking: false }),
}));

let worker: Worker | undefined;
let next = 1;
const waiting = new Map<number, { resolve: (a: PartAnswer) => void }>();

const ask = (req: PartAsk) =>
  new Promise<PartAnswer>((resolve) => {
    worker ??= (() => {
      const w = new Worker(new URL("./part.worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = (e: MessageEvent<PartAnswer>) => {
        waiting.get(e.data.id)?.resolve(e.data);
        waiting.delete(e.data.id);
      };
      return w;
    })();
    const id = next++;
    waiting.set(id, { resolve });
    usePartStore.setState((s) => ({ pending: s.pending + 1 }));
    worker.postMessage({ ...req, id });
  }).finally(() => usePartStore.setState((s) => ({ pending: s.pending - 1 })));

const failed = (error: string) => {
  usePartStore.setState({ failed: error });
  throw new Error(error);
};

/** the sketch solved, with its freedom and the constraints that
    fight or repeat (the sketcher reads these) */
export const solveSketchFull = async (sketch: Sketch): Promise<SketchSolve> => {
  const a = await ask({ kind: "solve", sketch });
  if (!a.ok || a.kind !== "solve")
    return { sketch, dof: 0, conflicting: [], redundant: [], ok: false };
  const { sketch: s, dof, conflicting, redundant, ok } = a;
  return { sketch: s, dof, conflicting, redundant, ok };
};

/** the sketch with its constraints solved */
export const solveSketch = async (sketch: Sketch) => {
  const a = await ask({ kind: "solve", sketch });
  if (!a.ok) return failed(a.error);
  return a.kind === "solve" ? a.sketch : sketch;
};

/** the profile as STEP, the kernel's own file, its machining cut */
export const stepOf = async (
  sketch: Sketch,
  thickness: number,
  features?: Feature[],
) => {
  const a = await ask({
    kind: "step",
    sketch,
    thickness,
    ...(features?.length ? { features } : {}),
  });
  if (!a.ok) return failed(a.error);
  return a.kind === "step" ? a.step : "";
};

/** a part built through its history, up to its rollback marker */
export const buildPartMesh = async (part: Part, upTo?: number) => {
  const a = await ask({
    kind: "build",
    part,
    ...(upTo !== undefined ? { upTo } : {}),
  });
  if (!a.ok) return failed(a.error);
  if (a.kind !== "build") throw new Error("not a build");
  return { mesh: a.mesh, statuses: a.statuses, ms: a.ms };
};

/** a part as STEP, the kernel's own file */
export const partStepOf = async (part: Part) => {
  const a = await ask({ kind: "partStep", part });
  if (!a.ok) return failed(a.error);
  return a.kind === "partStep" ? a.step : "";
};

/** a STEP file's text read by the kernel: the box round it, mm, or
    the kernel's words for why it could not be read */
export const checkStepText = async (step: string) => {
  const a = await ask({ kind: "checkStep", step });
  if (!a.ok) throw new Error(a.error);
  if (a.kind !== "checkStep") throw new Error("not a check");
  return a.bounds;
};

/** solids made, by their shape */
const made = new Map<string, Promise<Solid>>();
const KEEP = 64;
const solidOf = (sketch: Sketch, thickness: number) => {
  const key = JSON.stringify([sketch, thickness]);
  let p = made.get(key);
  if (!p) {
    p = ask({ kind: "solid", sketch, thickness }).then((a) => {
      if (!a.ok) return failed(a.error);
      if (a.kind !== "solid") throw new Error("not a solid");
      return a.solid;
    });
    made.set(key, p);
    if (made.size > KEEP) made.delete(made.keys().next().value!);
  }
  return p;
};

/** the cuts made, by the panel's shape and machining */
const cuts = new Map<string, Promise<CutMesh>>();
const cutOf = (p: Panel) => {
  const panel = {
    length: p.length,
    width: p.width,
    thickness: p.thickness,
    ...(p.features?.length ? { features: p.features } : {}),
    ...(p.profile ? { profile: p.profile } : {}),
  };
  const key = JSON.stringify(panel);
  let c = cuts.get(key);
  if (!c) {
    c = ask({ kind: "cut", panel }).then((a) => {
      if (!a.ok) return failed(a.error);
      if (a.kind !== "cut") throw new Error("not a cut");
      return a.solid;
    });
    cuts.set(key, c);
    if (cuts.size > KEEP) cuts.delete(cuts.keys().next().value!);
  }
  return c;
};

/** the solid's points brought into the piece's frame, metres: the
    profile's u, v and thickness laid along the panel's axes as its
    face is (features.ts says which), about the panel's centre; with
    the normals, texture coordinates and tones when the worker made
    them (a cut), else the normals from the triangles */
const geometryOf = (
  p: Panel,
  s: Solid & { uvs?: Float32Array; tones?: Float32Array },
) => {
  const L = p.length;
  const W = p.width;
  const T = p.thickness;
  const n = s.positions.length / 3;
  const positions = new Float32Array(n * 3);
  const normals = s.uvs ? new Float32Array(n * 3) : null;
  // u, v, w about the panel's centre, then onto the axes
  const put = (i: number, x: number, y: number, z: number) => {
    positions[i * 3] = toMetres(x + p.position[0]);
    positions[i * 3 + 1] = toMetres(y + p.position[1]);
    positions[i * 3 + 2] = toMetres(z + p.position[2]);
  };
  const turn = (x: number, y: number, z: number): [number, number, number] =>
    p.normal === "z" ? [x, y, z] : p.normal === "y" ? [x, z, y] : [z, y, x];
  // swapping two axes mirrors the solid: the triangles are turned back
  const mirrored = p.normal !== "z";
  for (let i = 0; i < n; i++) {
    const u = s.positions[i * 3]! - L / 2;
    const v = s.positions[i * 3 + 1]! - W / 2;
    const w = s.positions[i * 3 + 2]! - T / 2;
    put(i, ...turn(u, v, w));
    if (normals) {
      const [nx, ny, nz] = turn(
        s.normals[i * 3]!,
        s.normals[i * 3 + 1]!,
        s.normals[i * 3 + 2]!,
      );
      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
    }
  }
  const indices = new Uint32Array(s.indices);
  if (mirrored)
    for (let i = 0; i < indices.length; i += 3) {
      const t = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = t;
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setIndex(new BufferAttribute(indices, 1));
  if (normals && s.uvs && s.tones) {
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.setAttribute("uv", new BufferAttribute(s.uvs, 2));
    // the band's tone as the vertex colour the slab's material reads
    const colour = new Float32Array(n * 3);
    for (let i = 0; i < n; i++)
      colour[i * 3] = colour[i * 3 + 1] = colour[i * 3 + 2] = s.tones[i]!;
    g.setAttribute("color", new BufferAttribute(colour, 3));
  } else g.computeVertexNormals();
  return g;
};

/** a panel's solid as a geometry, once the worker has made it: its
    machining cut for real when `cut` is asked and it has any (or a
    shape), else its profile's solid; null meanwhile, and for a plain
    panel, which is drawn as a slab */
export const useProfileGeometry = (p: Panel, cut = false) => {
  // the geometry made, with the key it was made for: a panel whose
  // profile or place has changed shows the slab until its own comes
  const [made, setMade] = useState<{
    key: string;
    geometry: BufferGeometry;
  } | null>(null);
  const cutting = cut && ((p.features?.length ?? 0) > 0 || !!p.profile);
  const key = cutting
    ? JSON.stringify([
        "cut",
        p.length,
        p.width,
        p.thickness,
        p.features,
        p.profile,
        p.position,
        p.normal,
      ])
    : p.profile
      ? JSON.stringify([p.profile, p.thickness, p.position, p.normal])
      : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    let geometry: BufferGeometry | null = null;
    (cutting ? cutOf(p) : solidOf(p.profile!, p.thickness))
      .then((s) => {
        if (!live) return;
        geometry = geometryOf(p, s);
        setMade({ key, geometry });
      })
      .catch(() => undefined);
    return () => {
      live = false;
      geometry?.dispose();
    };
    // the key says everything the geometry depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return made && made.key === key ? made.geometry : null;
};
