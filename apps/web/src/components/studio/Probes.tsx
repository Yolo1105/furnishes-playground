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
import { type StillState, stillOf } from "./capture";
import { LightProbeGrid } from "three/examples/jsm/lighting/LightProbeGrid.js";
import { LightProbeGridNode } from "three/examples/jsm/tsl/lighting/LightProbeGridNode.js";
import type { WebGPURenderer } from "three/webgpu";

/**
 * Indirect light without a bake file: a grid of light probes over the
 * room, each a small picture of the shell (the floor, the walls, their
 * openings, the surroundings through the open top) turned into
 * spherical harmonics on the GPU, so every surface takes the room's own
 * bounce (the floor's tone on the undersides, the corners a little
 * darker). The pieces are kept out of the probes' pictures: the seam
 * where a piece stands is the occlusion's work, and a room that bakes
 * only when its shell or its light changes never stalls under a drag.
 * The bake is spread over frames, a few probes each, the shadow maps
 * serving from the last frame.
 */

/** probes about this far apart, m */
const SPACING = 1.5;
/** the sides of each probe's picture, px */
const CUBEMAP = 8;
/** probes baked in one call */
const PER_CALL = 2;
/** the time a frame gives the bake, ms; the rest waits for the next */
const BAKE_MS = 6;
/** passes after the first: each adds a bounce of the room's own light
    (the first already sees the shell lit by the sun and the surroundings) */
const BOUNCES = 0;
/** a change waits this long before the probes are baked again, ms */
const SETTLE_MS = 400;

/** the renderer told how the grid lights a material, once, before any
    material is built with the grid in the scene */
const register = (renderer: WebGPURenderer) => {
  if (renderer.library.getLightNodeClass(LightProbeGrid) === null) {
    renderer.library.addLight(LightProbeGridNode, LightProbeGrid);
  }
};

/** how many probes a span takes, two at least */
const probesAlong = (m: number) => Math.max(2, Math.round(m / SPACING) + 1);

export function Probes({
  w,
  h,
  d,
  stamp,
  pieces,
  onState,
}: {
  /** the room's box, m */
  w: number;
  h: number;
  d: number;
  /** what the probes see: a change here bakes them again */
  stamp: string;
  /** the pieces, left out of the probes' pictures */
  pieces: RefObject<Group | null>;
  /** whether a bake is under way or the probes are up to date */
  onState: (state: StillState) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const grid = useMemo(() => {
    const g = new LightProbeGrid(
      w,
      h,
      d,
      probesAlong(w),
      probesAlong(h),
      probesAlong(d),
    );
    g.position.set(0, h / 2, 0);
    return g;
  }, [w, h, d]);
  useEffect(() => () => grid.dispose(), [grid]);
  // the bake under way: the next probe and pass, or none; and when the
  // last change happened, so a run of them is baked once
  const job = useRef<{ at: number; pass: number } | null>(null);
  const due = useRef(0);
  const seen = useRef<Texture | null>(null);
  // a new grid is baked from its first frame on, before anything is
  // drawn with it in the room: a material built while the grid has no
  // texture would never sample it
  useLayoutEffect(() => {
    register(get().gl as unknown as WebGPURenderer);
    job.current = { at: 0, pass: 0 };
    due.current = 0;
    onState("pending");
    invalidate();
  }, [grid, get, invalidate, onState]);
  // a change to what the probes see waits a moment, so a run of changes
  // is baked once
  useEffect(() => {
    due.current = performance.now() + SETTLE_MS;
    onState("pending");
    invalidate();
  }, [grid, stamp, invalidate, onState]);
  useFrame((state) => {
    // the surroundings arrive on their own time: a new map starts over
    if (state.scene.environment !== seen.current) {
      seen.current = state.scene.environment;
      due.current = performance.now() + SETTLE_MS;
      job.current = null;
      onState("pending");
    }
    if (due.current) {
      if (performance.now() < due.current) {
        state.invalidate();
        return;
      }
      due.current = 0;
      job.current = { at: 0, pass: 0 };
    }
    const j = job.current;
    if (!j) return;
    const total = grid.resolution.x * grid.resolution.y * grid.resolution.z;
    const t0 = performance.now();
    do {
      const count = Math.min(PER_CALL, total - j.at);
      stillOf(state.scene, [pieces.current], () =>
        grid.bake(state.gl as unknown as WebGPURenderer, state.scene, {
          cubemapSize: CUBEMAP,
          start: j.at,
          count,
          pass: j.pass,
        }),
      );
      j.at += count;
    } while (j.at < total && performance.now() - t0 < BAKE_MS);
    if (j.at >= total) {
      if (j.pass >= BOUNCES) {
        job.current = null;
        onState("ready");
      } else job.current = { at: 0, pass: j.pass + 1 };
    }
    state.invalidate();
  });
  return <primitive object={grid} />;
}
