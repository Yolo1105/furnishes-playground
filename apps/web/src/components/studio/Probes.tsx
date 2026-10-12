"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { Group, Texture } from "three";
import { cameraMoving } from "./camera-motion";
import { type StillState, stillOf, wakeAt } from "./capture";
import { devParam } from "./dev-flags";
import { warming } from "./shader-warm";
import { LightProbeGrid } from "three/examples/jsm/lighting/LightProbeGrid.js";
import { LightProbeGridNode } from "three/examples/jsm/tsl/lighting/LightProbeGridNode.js";
import type { WebGPURenderer } from "three/webgpu";

/**
 * Indirect light without a bake file: a grid of light probes over the
 * room, each a small picture of the shell (the floor, the walls, their
 * openings, the surroundings through the open top) turned into
 * spherical harmonics on the GPU, so every surface takes the room's own
 * bounce (the floor's tone on the undersides, the corners a little
 * darker). The pieces are kept out of the first pass's pictures: the
 * seam where a piece stands is the occlusion's work, and a room that
 * bakes only when its shell or its light changes never stalls under a
 * drag; the second pass, a bounce, sees them, so a piece's colour bleeds
 * faintly onto the wall behind it once a change has settled. The bake
 * is spread over frames, a few probes each, the shadow maps serving
 * from the last frame.
 */

/** the tests' quick bake (`?probes=fast`, development only): probes
    twice as far apart (an eighth as many), the smallest pictures and no
    bounce pass, so a software renderer bakes a room in seconds; the
    visual baselines are taken with it */
const FAST = devParam("probes") === "fast";
/** probes about this far apart, m */
const SPACING = FAST ? 3 : 1.5;
/** the sides of each probe's picture, px */
const CUBEMAP = FAST ? 4 : 8;
/** probes baked in one call */
const PER_CALL = 2;
/** the time a frame gives the bake, ms; the rest waits for the next */
const BAKE_MS = 6;
/** passes after the first: each adds a bounce of the room's own light
    (the first sees the shell alone, lit by the sun and the surroundings;
    the pieces are in the picture from the second, so their colour
    bleeds faintly onto what stands near them) */
const BOUNCES = 1;
/** a change waits this long before the probes are baked again, ms */
const SETTLE_MS = 400;
/** a bake held back (shaders building, the camera moving) looks again
    after this, ms */
const RETRY_MS = 250;

/** the renderer told how the grid lights a material, once, before any
    material is built with the grid in the scene */
const register = (renderer: WebGPURenderer) => {
  if (renderer.library.getLightNodeClass(LightProbeGrid) === null) {
    renderer.library.addLight(LightProbeGridNode, LightProbeGrid);
  }
};

/** each room's grid, kept when the room is left: coming back to a room
    whose shell, light and surroundings are as they were when its probes
    were baked takes them as they stand, with no bake (a minute on a
    software renderer). The grids are small (a few dozen probes each);
    past a handful the one left longest ago goes */
const KEPT = 8;
type Kept = {
  grid: LightProbeGrid;
  /** what the grid was last baked under in full, or null mid-bake */
  baked: string | null;
};
const kept = new Map<string, Kept>();
const keyOf = (room: string, w: number, h: number, d: number) =>
  `${room}:${w}:${h}:${d}`;
const keptGrid = (key: string, w: number, h: number, d: number): Kept => {
  const found = kept.get(key);
  if (found) {
    // the room just come back to is the one kept longest from here on
    kept.delete(key);
    kept.set(key, found);
    return found;
  }
  const grid = new LightProbeGrid(
    w,
    h,
    d,
    probesAlong(w),
    probesAlong(h),
    probesAlong(d),
  );
  grid.position.set(0, h / 2, 0);
  const made = { grid, baked: null };
  kept.set(key, made);
  for (const [k, old] of kept) {
    if (kept.size <= KEPT) break;
    kept.delete(k);
    old.grid.dispose();
  }
  return made;
};
/** what a bake is of: the stamp and the surroundings it saw */
const bakeOf = (stamp: string, environment: { uuid: string } | null) =>
  `${stamp}|${environment?.uuid ?? ""}`;
/** whether a kept grid stands baked for this, and noting what it was
    baked for (null while a bake is under way) */
const bakedFor = (key: string, bake: string) => kept.get(key)?.baked === bake;
const noteBake = (key: string, bake: string | null) => {
  const k = kept.get(key);
  if (k) k.baked = bake;
};

/** how many probes a span takes, two at least */
const probesAlong = (m: number) => Math.max(2, Math.round(m / SPACING) + 1);

export function Probes({
  room,
  w,
  h,
  d,
  stamp,
  pieces,
  bounce,
  onState,
  onProgress,
}: {
  /** the room the probes are of, whose grid is kept when it is left */
  room: string;
  /** the room's box, m */
  w: number;
  h: number;
  d: number;
  /** what the probes see: a change here bakes them again */
  stamp: string;
  /** the pieces, left out of the probes' first pictures */
  pieces: RefObject<Group | null>;
  /** whether the bounce pass runs (not on a software renderer, where
      a second pass over the pieces would take minutes) */
  bounce: boolean;
  /** whether a bake is under way or the probes are up to date */
  onState: (state: StillState) => void;
  /** how many probes of how many are baked, as the bake goes */
  onProgress?: (baked: number, of: number) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const key = keyOf(room, w, h, d);
  const grid = useMemo(() => keptGrid(key, w, h, d).grid, [key, w, h, d]);
  // the stamp as the frames see it, to note what a finished bake was of
  const stampNow = useRef(stamp);
  useLayoutEffect(() => {
    stampNow.current = stamp;
  }, [stamp]);
  // the bake under way: the next probe and pass, or none; and when the
  // last change happened, so a run of them is baked once
  const job = useRef<{ at: number; pass: number } | null>(null);
  const due = useRef(0);
  const wake = useRef(0);
  // the wake let go with the component: a stale one would keep wakeAt
  // from setting the next (a fast refresh keeps the refs)
  useEffect(
    () => () => {
      window.clearTimeout(wake.current);
      wake.current = 0;
    },
    [],
  );
  const seen = useRef<Texture | null>(null);
  // a new grid is baked from its first frame on, before anything is
  // drawn with it in the room: a material built while the grid has no
  // texture would never sample it
  useLayoutEffect(() => {
    register(get().gl as unknown as WebGPURenderer);
    due.current = 0;
    if (bakedFor(key, bakeOf(stampNow.current, get().scene.environment))) {
      // a room come back to as it was baked: its probes stand
      seen.current = get().scene.environment;
      job.current = null;
      onState("ready");
      return;
    }
    noteBake(key, null);
    job.current = { at: 0, pass: 0 };
    onState("pending");
    invalidate();
  }, [grid, key, get, invalidate, onState]);
  // a change to what the probes see waits a moment, so a run of changes
  // is baked once
  useEffect(() => {
    if (
      job.current === null &&
      bakedFor(key, bakeOf(stampNow.current, get().scene.environment))
    )
      return;
    if (process.env.NODE_ENV !== "production")
      console.debug("probes: the stamp changed, baking again", stamp);
    noteBake(key, null);
    due.current = performance.now() + SETTLE_MS;
    onState("pending");
    invalidate();
  }, [grid, key, stamp, get, invalidate, onState]);
  useFrame((state) => {
    // the room's shaders being built hold the renderer's outputs: the
    // bake goes on once they are; it looks again shortly, so it never
    // waits on a frame nothing asks for
    if (warming()) {
      wakeAt(wake, performance.now() + RETRY_MS, state.invalidate);
      return;
    }
    // the surroundings arrive on their own time: a new map starts over
    if (state.scene.environment !== seen.current) {
      seen.current = state.scene.environment;
      noteBake(key, null);
      due.current = performance.now() + SETTLE_MS;
      job.current = null;
      onState("pending");
    }
    if (due.current) {
      if (wakeAt(wake, due.current, state.invalidate)) return;
      due.current = 0;
      job.current = { at: 0, pass: 0 };
    }
    const j = job.current;
    // a moving camera is drawn first: the bake goes on once it stands
    if (!j) return;
    if (cameraMoving()) {
      wakeAt(wake, performance.now() + RETRY_MS, state.invalidate);
      return;
    }
    const total = grid.resolution.x * grid.resolution.y * grid.resolution.z;
    const t0 = performance.now();
    do {
      const count = Math.min(PER_CALL, total - j.at);
      stillOf(state.scene, j.pass === 0 ? [pieces.current] : [], () =>
        grid.bake(state.gl as unknown as WebGPURenderer, state.scene, {
          cubemapSize: CUBEMAP,
          start: j.at,
          count,
          pass: j.pass,
        }),
      );
      j.at += count;
    } while (j.at < total && performance.now() - t0 < BAKE_MS);
    const passes = bounce && !FAST ? BOUNCES + 1 : 1;
    onProgress?.(j.pass * total + j.at, total * passes);
    if (j.at >= total) {
      if (j.pass >= passes - 1) {
        job.current = null;
        noteBake(key, bakeOf(stampNow.current, state.scene.environment));
        onState("ready");
      } else job.current = { at: 0, pass: j.pass + 1 };
    }
    state.invalidate();
  });
  return <primitive object={grid} />;
}
