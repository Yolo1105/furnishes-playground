"use client";

import { type RootState, useFrame, useThree } from "@react-three/fiber";
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
import { useEvent } from "./use-event";
import { withWallsStanding } from "./walls-standing";
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
/** the sides of each probe's picture, px: on the desktop tier twice
    the side, so the window's sunlit patch on the floor (what lights the
    ceiling and the room's far side, the walls' fills being a whisper)
    covers enough of a picture not to flicker in and out of it */
const CUBEMAP = { fast: 4, fine: 16, plain: 8 } as const;
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
/** the pause between two slices of a bake, ms: the page answers a hand
    in it */
const SLICE_GAP_MS = 4;
/** how long a fresh bake takes to fade in over the one it replaces, ms:
    a bake landing all at once changed the room's light in a frame */
export const PROBE_FADE_MS = 400;

/** the renderer told how the grid lights a material, once, before any
    material is built with the grid in the scene */
const register = (renderer: WebGPURenderer) => {
  if (renderer.library.getLightNodeClass(LightProbeGrid) === null) {
    renderer.library.addLight(LightProbeGridNode, LightProbeGrid);
  }
};

/** each room's grids, kept when the room is left: coming back to a room
    whose shell, light and surroundings are as they were when its probes
    were baked takes them as they stand, with no bake (a minute on a
    software renderer). The grids are small (a few dozen probes each);
    past a handful the room left longest ago goes. Two to a room: the one
    lighting it, and the one a bake goes into while it does, faded in
    over it once the bake is done */
const KEPT = 8;
type Kept = {
  grids: [LightProbeGrid, LightProbeGrid];
  /** which of the two lights the room */
  live: 0 | 1;
  /** what the live grid was last baked under in full, or null mid-bake */
  baked: string | null;
  /** whether any bake has finished: the first goes into the live grid
      (there is nothing to fade from) */
  ever: boolean;
  /** a finished bake fading in over the live grid: when it began, and
      the grid it went into */
  fade: { from: number; into: 0 | 1 } | null;
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
  const make = (intensity: number) => {
    const grid = new LightProbeGrid(
      w,
      h,
      d,
      probesAlong(w),
      probesAlong(h),
      probesAlong(d),
    );
    grid.position.set(0, h / 2, 0);
    grid.intensity = intensity;
    // out of the lights until it has its first picture (the probes'
    // first frame takes one): a shader built while the grid has none
    // never samples it (LightProbeGridNode.setup), and the lights' key
    // does not change when one comes, so the room drew without its bounce
    grid.visible = false;
    return grid;
  };
  const made: Kept = {
    grids: [make(1), make(0)],
    live: 0,
    baked: null,
    ever: false,
    fade: null,
  };
  kept.set(key, made);
  for (const [k, old] of kept) {
    if (kept.size <= KEPT) break;
    kept.delete(k);
    for (const g of old.grids) g.dispose();
  }
  return made;
};
/** a bake from the start: into the grid not lighting the room once the
    room has been baked, into the live one the first time */
const freshBake = (k: Kept) => ({
  at: 0,
  pass: 0,
  into: (k.ever ? 1 - k.live : k.live) as 0 | 1,
});
/** a fade under way finished at once (a new bake comes first), or at
    its end: the grid it brought in lights the room alone */
const endFade = (k: Kept) => {
  const f = k.fade;
  if (!f) return;
  k.fade = null;
  k.live = f.into;
  k.grids[f.into].intensity = 1;
  k.grids[1 - f.into]!.intensity = 0;
};
/** a finished bake: noted, and faded in over the live grid when it went
    into the other (`true`: the fade begins), or standing at once when
    it was the room's first (`false`) */
const bakeDone = (k: Kept, into: 0 | 1) => {
  k.ever = true;
  if (into === k.live) return false;
  k.fade = { from: performance.now(), into };
  return true;
};
/** a fade's step: the two grids' shares at the time; whether it is over */
const fadeStep = (k: Kept) => {
  const f = k.fade;
  if (!f) return true;
  const t = Math.min(1, (performance.now() - f.from) / PROBE_FADE_MS);
  k.grids[f.into].intensity = t;
  k.grids[1 - f.into]!.intensity = 1 - t;
  if (t < 1) return false;
  endFade(k);
  return true;
};
/** a slice of a bake into one of a room's grids, with both out of the
    pictures as one grid was of its own (so the pictures are one shader
    build, and the room's last bake never lights its next) */
const bakeInto = (k: Kept, into: 0 | 1, bake: (g: LightProbeGrid) => void) => {
  const shown = k.grids.map((g) => g.visible);
  for (const g of k.grids) g.visible = false;
  try {
    bake(k.grids[into]);
  } finally {
    k.grids.forEach((g, i) => (g.visible = shown[i]!));
  }
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

/** a grid's first picture taken (`bake`), and the grid let into the
    lights with it */
const firstPicture = (grid: LightProbeGrid, bake: () => void) => {
  bake();
  grid.visible = true;
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
  fine = false,
  hold = false,
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
  /** the larger pictures (the desktop tier) */
  fine?: boolean;
  /** a bake waits while this holds (the floor's picture being taken,
      which the probes' pictures show) */
  hold?: boolean;
  /** whether a bake is under way or the probes are up to date */
  onState: (state: StillState) => void;
  /** how many probes of how many are baked, as the bake goes */
  onProgress?: (baked: number, of: number) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const get = useThree((s) => s.get);
  const key = keyOf(room, w, h, d);
  // the room's two grids (Kept)
  const pair = useMemo(() => keptGrid(key, w, h, d), [key, w, h, d]);
  const grids = pair.grids;
  // the stamp as the frames see it, to note what a finished bake was of
  const stampNow = useRef(stamp);
  useLayoutEffect(() => {
    stampNow.current = stamp;
  }, [stamp]);
  // the bake under way: the next probe and pass, or none; and when the
  // last change happened, so a run of them is baked once
  const job = useRef<{ at: number; pass: number; into: 0 | 1 } | null>(null);

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
  const held = useRef(hold);
  useEffect(() => {
    held.current = hold;
    if (!hold) invalidate();
  }, [hold, invalidate]);
  // a new grid is baked from its first frame on
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
    endFade(pair);
    job.current = freshBake(pair);
    onState("pending");
    invalidate();
  }, [pair, key, get, invalidate, onState]);
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
  }, [pair, key, stamp, get, invalidate, onState]);
  /** probes `start` to `start + count` of a pass baked into a grid,
      with every wall standing and, on the first pass, without the
      pieces */
  const bakeSlice = (
    state: RootState,
    into: 0 | 1,
    start: number,
    count: number,
    pass: number,
  ) =>
    bakeInto(pair, into, (grid) =>
      stillOf(state.scene, pass === 0 ? [pieces.current] : [], () =>
        withWallsStanding(() =>
          grid.bake(state.gl as unknown as WebGPURenderer, state.scene, {
            cubemapSize: FAST
              ? CUBEMAP.fast
              : fine
                ? CUBEMAP.fine
                : CUBEMAP.plain,
            start,
            count,
            pass,
          }),
        ),
      ),
    );
  // the bake runs between the frames, a slice at a time and a moment
  // apart, not in them: each slice in a frame of its own drew the whole
  // view again with every pass (a picture that had not moved) on top of
  // the slice's own pictures, and the page took no hand for the seconds
  // a bake lasts. The room is drawn again once, when it is done
  const pumping = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(pumping.current);
      pumping.current = 0;
    },
    [],
  );
  // a slice a moment from now (the pump reads itself through a ref)
  const pumpRef = useRef<() => void>(() => undefined);
  const later = (ms: number) => {
    pumping.current = window.setTimeout(() => pumpRef.current(), ms);
  };
  const pump = useEvent(() => {
    pumping.current = 0;
    const j = job.current;
    if (!j) return;
    const state = get();
    // the room's shaders being built hold the renderer's outputs, a
    // moving camera is drawn first, and the floor's picture is taken
    // before the bake starts: each looks again shortly
    if (
      warming() ||
      cameraMoving() ||
      (held.current && j.at === 0 && j.pass === 0)
    ) {
      later(RETRY_MS);
      return;
    }
    const r = grids[j.into].resolution;
    const total = r.x * r.y * r.z;
    const t0 = performance.now();
    do {
      const count = Math.min(PER_CALL, total - j.at);
      bakeSlice(state, j.into, j.at, count, j.pass);
      j.at += count;
    } while (j.at < total && performance.now() - t0 < BAKE_MS);
    const passes = bounce && !FAST ? BOUNCES + 1 : 1;
    onProgress?.(j.pass * total + j.at, total * passes);
    if (j.at >= total) {
      if (j.pass >= passes - 1) {
        job.current = null;
        noteBake(key, bakeOf(stampNow.current, state.scene.environment));
        // into the live grid (the first bake): ready now; into the other:
        // ready once it has faded in (the frames below)
        if (!bakeDone(pair, j.into)) onState("ready");
        state.invalidate();
        return;
      }
      job.current = { at: 0, pass: j.pass + 1, into: j.into };
    }
    later(SLICE_GAP_MS);
  });
  useLayoutEffect(() => {
    pumpRef.current = pump;
  }, [pump]);
  // the probes' frame comes before the chain's (Post draws after)
  useFrame((state) => {
    // a grid without its picture takes one at once, of its first probe
    // alone (a moment's work), and joins the lights: the shaders the
    // chain builds next are built with it, once. Built before it had one
    // they would never sample it, and built again after it would cost
    // the whole room's shaders a second time
    grids.forEach((g, i) => {
      if (!g.texture)
        firstPicture(g, () => bakeSlice(state, i as 0 | 1, 0, 1, 0));
    });
    // a finished bake fading in: the two grids' shares follow the time
    if (pair.fade) {
      if (fadeStep(pair)) onState("ready");
      else state.invalidate();
    }
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
      endFade(pair);
      job.current = freshBake(pair);
    }
    // a bake due: its slices go on between the frames (above)
    if (job.current && !pumping.current) later(0);
  });
  return (
    <>
      <primitive object={grids[0]} />
      <primitive object={grids[1]} />
    </>
  );
}
