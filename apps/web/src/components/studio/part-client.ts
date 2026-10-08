"use client";

import type { Panel, Sketch } from "@furnishes/domain";
import { toMetres } from "@furnishes/scene";
import { useEffect, useState } from "react";
import { BufferAttribute, BufferGeometry } from "three";
import { create } from "zustand";
import type { PartAnswer, PartAsk, Solid } from "./part.worker";

/**
 * The studio's side of the part worker (part.worker.ts): one worker,
 * made the first time a profile is asked for; each request answered
 * by its id. A profile's solid is kept once made, by its shape, so a
 * panel drawn again is not rebuilt. `usePartStore.pending` counts the
 * requests under way, which the stage says (`data-parts`), so a test
 * can wait for a solid.
 */
type PartState = { pending: number; failed: string | null };
export const usePartStore = create<PartState>(() => ({
  pending: 0,
  failed: null,
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

/** the sketch with its constraints solved */
export const solveSketch = async (sketch: Sketch) => {
  const a = await ask({ kind: "solve", sketch });
  if (!a.ok) return failed(a.error);
  return a.kind === "solve" ? a.sketch : sketch;
};

/** the profile as STEP, the kernel's own file */
export const stepOf = async (sketch: Sketch, thickness: number) => {
  const a = await ask({ kind: "step", sketch, thickness });
  if (!a.ok) return failed(a.error);
  return a.kind === "step" ? a.step : "";
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

/** the solid's points brought into the piece's frame, metres: the
    profile's u, v and thickness laid along the panel's axes as its
    face is (features.ts says which), about the panel's centre */
const geometryOf = (p: Panel, s: Solid) => {
  const L = p.length;
  const W = p.width;
  const T = p.thickness;
  const n = s.positions.length / 3;
  const positions = new Float32Array(n * 3);
  // u, v, w about the panel's centre, then onto the axes
  const put = (i: number, x: number, y: number, z: number) => {
    positions[i * 3] = toMetres(x + p.position[0]);
    positions[i * 3 + 1] = toMetres(y + p.position[1]);
    positions[i * 3 + 2] = toMetres(z + p.position[2]);
  };
  // swapping two axes mirrors the solid: the triangles are turned back
  const mirrored = p.normal !== "z";
  for (let i = 0; i < n; i++) {
    const u = s.positions[i * 3]! - L / 2;
    const v = s.positions[i * 3 + 1]! - W / 2;
    const w = s.positions[i * 3 + 2]! - T / 2;
    if (p.normal === "z") put(i, u, v, w);
    else if (p.normal === "y") put(i, u, w, v);
    else put(i, w, v, u);
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
  g.computeVertexNormals();
  return g;
};

/** a panel's profile as a geometry, once the worker has made it;
    null meanwhile, and for a panel with no profile */
export const useProfileGeometry = (p: Panel) => {
  // the geometry made, with the key it was made for: a panel whose
  // profile or place has changed shows the slab until its own comes
  const [made, setMade] = useState<{
    key: string;
    geometry: BufferGeometry;
  } | null>(null);
  const key = p.profile
    ? JSON.stringify([p.profile, p.thickness, p.position, p.normal])
    : null;
  useEffect(() => {
    if (!key || !p.profile) return;
    let live = true;
    let geometry: BufferGeometry | null = null;
    solidOf(p.profile, p.thickness)
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
