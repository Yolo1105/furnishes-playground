"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Color,
  type Mesh,
  type Object3D,
  Vector3,
  type Vector3Tuple,
} from "three";
import { create } from "zustand";
import { toMetres } from "@furnishes/scene";
import { cameraMoving } from "./camera-motion";
import {
  bakeGi,
  copyLayer,
  fadeOn,
  giKey,
  halves,
  type GiChart,
  type GiJob,
  type GiLamp,
  type GiWindow,
  type V3,
  writeLayer,
} from "./gi-bake";
import {
  applyGiUv,
  collectFlat,
  type GiFloor,
  type GiPlace,
  roomSignature,
  type GiRoomIn,
} from "./gi-collect";
import {
  GI_FADE,
  GI_OUTSIDE,
  GI_ROOMS,
  GI_SIDE,
  SPARE,
  giTexture,
  guardShape,
  patchGi,
} from "./gi-material";
import type { Tier } from "./Post";
import { useBakes } from "./lightmap";
import { isWindow, OPENINGS } from "./room-data";
import { openingCentre } from "./room-health";
import { inward, type LitRoom, WINDOW_LIGHT } from "./window-light";

/**
 * The room's bounced light, baked whenever the room stops changing
 * (round 9, Part 1): the sky through each window, the sun's first
 * bounce, a second bounce, and in the evening the lamps, gathered over
 * the shell of every room of the flat (gi-bake.ts, in workers) and laid
 * on its floors, walls and ceilings as a light map (gi-material.ts),
 * where it takes the place of the sky's fill, the windows' area lights
 * and the probes. The sun and every highlight stay live.
 *
 * - Each room's group is read for a signature (its meshes' places and
 *   colours, its lamps) every `POLL_MS`; `QUIET_MS` after its last
 *   change the flat is read (gi-collect.ts) and the room baked, the
 *   active room first and the rest by distance.
 * - A room's first bake comes coarse (`COARSE`: a few rays, one bounce)
 *   and then whole; a bake laid out as the last one was (the shell
 *   unchanged, a piece moved) fades in over `FADE_MS` on the spare
 *   layer, and only while the camera is still.
 * - A bake is kept by its key (`giKey`): a room put back as it was finds
 *   its light again at once.
 * - A phone or a software renderer bakes at half the density, with one
 *   bounce, on a smaller texture (`TIERS.plain`).
 *
 * `useGi` says how it stands (`data-gi` on the stage: baking, ready,
 * off) and counts the bakes laid, for the probes' stamp: the probes are
 * taken again with the shell lit by its bake, so the pieces take the
 * bounce too.
 */

export type GiState = "baking" | "ready" | "off";
export const useGi = create<{
  state: GiState;
  /** the bakes laid whole, all rooms, since the page opened */
  version: number;
  /** the room bakes worked out (not laid again from what was kept),
      since the bake was turned on: a piece's bake arriving or the
      probes being taken must never add one (round 10) */
  runs: number;
  /** ms from the first read of the flat to its first light, and to
      every room's whole bake */
  first: number | null;
  full: number | null;
  /** the light's texture, bytes */
  bytes: number;
  /** the workers' own time, ms: the first bake's, the longest one's,
      and all of them together */
  work: { first: number | null; most: number; all: number };
}>(() => ({
  state: "off",
  version: 0,
  runs: 0,
  first: null,
  full: null,
  bytes: 0,
  work: { first: null, most: 0, all: 0 },
}));
/** a bake's time counted */
const worked = (ms: number) => {
  const w = useGi.getState().work;
  useGi.setState({
    work: {
      first: w.first ?? Math.round(ms),
      most: Math.max(w.most, Math.round(ms)),
      all: w.all + Math.round(ms),
    },
  });
};

/** how often the rooms are read for a change, and how long after the
    last change a room is baked */
const POLL_MS = 300;
const QUIET_MS = 600;
/** the fade from one bake to the next */
const FADE_MS = 400;
/** the bakes kept by their key */
const KEEP = 32;

/** the bake by tier: texels a metre, rays a texel a gather, gathers,
    and the texture's side */
export const TIERS = {
  fine: { density: 8, rays: 32, bounces: 2, side: GI_SIDE.fine },
  plain: { density: 4, rays: 24, bounces: 1, side: GI_SIDE.plain },
} as const;
/** a room's first, quick look */
const COARSE = { rays: 12, bounces: 1 } as const;
/** what a doorway gives back, of the windows' radiance */
const AWAY = 0.2;
/** the ground outside, of the sky's radiance */
const GROUND = 0.35;

/** a room's windows in its group's frame (the room's middle at the
    origin, m): each opening in its wall's line, sill to head */
export const windowsOf = (r: LitRoom): GiWindow[] =>
  r.openings.filter(isWindow).map((o) => {
    const { centre, at } = openingCentre(r, o);
    const across = o.wall === "north" || o.wall === "south";
    const x = toMetres(across ? centre : at) - toMetres(r.W) / 2;
    const z = toMetres(across ? at : centre) - toMetres(r.D) / 2;
    const sill = toMetres(o.sill ?? OPENINGS.window.sill);
    const head = toMetres(o.head ?? OPENINGS.window.head);
    const w = toMetres(o.width);
    const [nx, nz] = inward(o.wall);
    // along the wall: square to its inward normal
    const u: V3 = [-nz * w, 0, nx * w];
    return {
      o: [x - u[0] / 2, sill, z - u[2] / 2],
      u,
      v: [0, head - sill, 0],
    };
  });

type Room = {
  /** the signature last read, and when it changed */
  sig: number;
  at: number;
  /** the signature baked whole, and the one on its way */
  baked: number | null;
  going: number | null;
  /** the layout the room's layer holds, as a key */
  layout: string | null;
  /** the bake whole on the room's layer, by its key (giKey) */
  laid: string | null;
  slot: number;
};

/** a bake done: the room's atlas, half floats */
type Done = {
  id: string;
  sig: number;
  /** the job's key (giKey) */
  key: string;
  whole: boolean;
  half: Uint16Array;
  size: [number, number];
  charts: GiChart[];
  layout: string;
};

/** the workers, a few, each with a job at a time; none where a worker
    cannot be made (baked here, between frames). A worker that fails
    (its script did not load: a development server still compiling it
    on a first visit) leaves the pool and its job goes back to the queue,
    so a bake is never waited on for ever */
type Task = { job: GiJob; done: (r: { half: Uint16Array; ms: number }) => void };
const pool = (() => {
  let workers: { w: Worker; busy: Task | null }[] | null = null;
  let id = 0;
  const replies = new Map<
    number,
    (r: { half: Uint16Array; ms: number }) => void
  >();
  const queue: Task[] = [];
  const start = () => {
    if (workers) return;
    workers = [];
    const n = Math.max(
      1,
      Math.min(3, (navigator.hardwareConcurrency || 2) - 1),
    );
    for (let i = 0; i < n; i++)
      try {
        const w = new Worker(new URL("./gi.worker.ts", import.meta.url), {
          type: "module",
        });
        const slot: { w: Worker; busy: Task | null } = { w, busy: null };
        w.onmessage = (
          e: MessageEvent<{ id: number; half: Uint16Array; ms: number }>,
        ) => {
          slot.busy = null;
          replies.get(e.data.id)?.(e.data);
          replies.delete(e.data.id);
          next();
        };
        w.onerror = (e) => {
          e.preventDefault();
          console.warn(`bounce bake: a worker failed (${e.message || "it did not load"}); its work goes on without it`);
          w.terminate();
          workers = workers!.filter((x) => x !== slot);
          if (slot.busy) queue.unshift(slot.busy);
          slot.busy = null;
          next();
        };
        workers.push(slot);
      } catch {
        break;
      }
  };
  const next = () => {
    if (!queue.length) return;
    if (!workers!.length) {
      const t = queue.shift()!;
      window.setTimeout(() => {
        const t0 = performance.now();
        const half = halves(bakeGi(t.job).irradiance);
        t.done({ half, ms: performance.now() - t0 });
        next();
      }, 0);
      return;
    }
    const free = workers!.find((w) => !w.busy);
    if (!free) return;
    const t = queue.shift()!;
    free.busy = t;
    const k = ++id;
    replies.set(k, t.done);
    free.w.postMessage({ id: k, job: t.job });
  };
  return {
    run: (job: GiJob) =>
      new Promise<{ half: Uint16Array; ms: number }>((done) => {
        start();
        queue.push({ job, done });
        next();
      }),
    /** whether a job is waiting or running */
    busy: () => queue.length > 0 || (workers ?? []).some((w) => w.busy),
    /** the queue dropped (a change of look makes it stale) */
    clear: () => {
      queue.length = 0;
    },
  };
})();

/** the bakes by key */
const kept = new Map<string, Uint16Array>();
const keep = (key: string, half: Uint16Array) => {
  kept.delete(key);
  kept.set(key, half);
  while (kept.size > KEEP) kept.delete(kept.keys().next().value!);
};

const linear = (hex: string, k: number): V3 => {
  const c = new Color(hex);
  return [c.r * k, c.g * k, c.b * k];
};

export function GiBake({
  rooms,
  active,
  tier,
  evening,
  sun,
  fill,
  downlight,
  on,
}: {
  rooms: readonly LitRoom[];
  active: string;
  tier: Tier | null;
  evening: boolean;
  /** the way to the sun (unit), its colour and strength */
  sun: { dir: Vector3Tuple; colour: string; intensity: number };
  /** the sky's fill the shell had before (the hemisphere's colour and
      strength): a face that looks into no room keeps it */
  fill: { colour: string; intensity: number };
  /** the active room's ceiling light, world: lit in the evening */
  downlight: {
    at: Vector3Tuple;
    colour: string;
    intensity: number;
    angle: number;
  } | null;
  on: boolean;
}) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const plain = tier === "phone";
  const set = plain ? TIERS.plain : TIERS.fine;
  // the bake's light, as numbers: a change of it bakes every room again
  const light = useRef<Pick<GiJob, "sky" | "sun" | "away"> | null>(null);
  const sky = WINDOW_LIGHT[evening ? "evening" : "day"];
  const radiance = linear(sky.colour, sky.intensity);
  const sunLin = linear(sun.colour, sun.intensity);
  const l = Math.hypot(...sun.dir) || 1;
  const look = {
    sky: {
      up: radiance,
      horizon: radiance,
      ground: radiance.map((x) => x * GROUND) as V3,
    },
    sun:
      sun.dir[1] > 0
        ? {
            to: sun.dir.map((x) => x / l) as V3,
            irradiance: sunLin,
          }
        : null,
    away: radiance.map((x) => x * AWAY) as V3,
  };
  const lookKey = JSON.stringify([look, set]);
  const state = useRef({
    rooms: new Map<string, Room>(),
    places: new Map<string, GiPlace>(),
    floors: [] as GiFloor[],
    shells: [] as Mesh[],
    /** the geometries given their light's coordinates, by the version
        of the places they were given them for */
    given: new WeakMap<object, number>(),
    placed: 0,
    fade: null as null | { slot: number; t: number; done: Done },
    waiting: [] as Done[],
    began: 0,
    lookKey: "",
    windows: new Map<string, GiWindow[]>(),
    /** the rooms on the sheet, and from the scene's frame to the
        flat's */
    sheet: [] as readonly LitRoom[],
    from: [0, 0, 0] as V3,
    /** the geometries given their light's coordinates, to take them
        back when the bake is turned off */
    giving: new Set<Mesh["geometry"]>(),
    give: null as null | (() => void),
    lay: null as null | ((d: Done) => void),
    /** a bake laid since the bake was last ready: the probes are taken
        again only then */
    laidSince: false,
  });
  // what the poll reads as it is now, without starting it again
  const now = useRef({ active, downlight, set });
  useLayoutEffect(() => {
    light.current = look;
    now.current = { active, downlight, set };
  });

  useLayoutEffect(() => {
    patchGi();
  }, []);
  // the texture at the tier's side, and its bytes for the report
  useEffect(() => {
    if (!on) return;
    const t = giTexture(set.side);
    useGi.setState({ bytes: t.image.data!.byteLength });
  }, [on, set.side]);
  // the sky's fill on the faces that look into no room
  useEffect(() => {
    const c = new Color(fill.colour).multiplyScalar(fill.intensity);
    (GI_OUTSIDE.value as Color).copy(c);
    invalidate();
  }, [fill.colour, fill.intensity, invalidate]);
  useEffect(() => {
    const s = state.current;
    s.windows = new Map(rooms.map((r) => [r.id, windowsOf(r)]));
    s.sheet = rooms;
    // a room's windows moved: its bake again
    for (const r of s.rooms.values()) r.baked = null;
  }, [rooms]);

  // a change of look bakes every room again (the old bakes stay shown
  // until the new ones come)
  useEffect(() => {
    const s = state.current;
    s.lookKey = lookKey;
    pool.clear();
    for (const r of s.rooms.values()) {
      r.baked = null;
      r.going = null;
    }
  }, [lookKey]);

  const side = set.side;
  useEffect(() => {
    if (!on) {
      useGi.setState({ state: "off" });
      return;
    }
    const s = state.current;
    const set = now.current.set;
    // the times are taken from the first bake asked for (none is asked
    // while the camera glides in)
    s.began = 0;
    useGi.setState({
      state: "baking",
      runs: 0,
      first: null,
      full: null,
      work: { first: null, most: 0, all: 0 },
    });
    const groups = () => {
      const found = new Map<string, Object3D>();
      const walk = (o: Object3D) => {
        const id = (o.userData as { giRoom?: string }).giRoom;
        if (id) {
          found.set(id, o);
          return;
        }
        for (const c of o.children) walk(c);
      };
      walk(scene);
      return found;
    };
    const lay = (d: Done) => {
      const r = s.rooms.get(d.id);
      if (!r) return;
      const tex = giTexture(set.side);
      const side = tex.image.width;
      const data = tex.image.data as Uint16Array;
      const write = (k: number) => {
        writeLayer(data, side, k, d.half, d.size);
        tex.addLayerUpdate(k);
        tex.needsUpdate = true;
      };
      if (r.layout !== d.layout) {
        // laid out anew (the first bake, or the shell changed): in its
        // own layer at once, and every shell face given its place again
        write(r.slot);
        r.layout = d.layout;
        s.places.set(d.id, { slot: r.slot, charts: d.charts, size: d.size });
        s.placed++;
        give();
      } else {
        // the same layout: the new bake on the spare layer, faded in
        write(SPARE);
        s.fade = { slot: r.slot, t: 0, done: d };
      }
      if (d.whole) {
        r.baked = d.sig;
        r.laid = d.key;
      }
      s.laidSince = true;
      if (!useGi.getState().first)
        useGi.setState({ first: Math.round(performance.now() - s.began) });
      invalidate();
    };
    const give = () => {
      if (!s.places.size) return;
      for (const m of s.shells) {
        guardShape(m);
        const g = m.geometry;
        if (s.given.get(g) === s.placed) continue;
        s.given.set(g, s.placed);
        if (
          applyGiUv(
            m,
            g,
            s.floors,
            s.places,
            giTexture(set.side).image.width,
            s.from,
          )
        )
          s.giving.add(g);
      }
    };
    s.give = give;
    s.lay = (d: Done) => {
      if (s.fade) {
        // one fade at a time: the newest bake of a room waits
        s.waiting = s.waiting.filter((w) => w.id !== d.id);
        s.waiting.push(d);
        return;
      }
      lay(d);
    };
    const poll = () => {
      const { active, downlight } = now.current;
      const at = performance.now();
      const found = groups();
      // the flat's frame: a room's middle on the sheet, against where its
      // group stands in the scene
      for (const r of s.sheet) {
        const g = found.get(r.id);
        if (!g) continue;
        const w = g.getWorldPosition(new Vector3());
        s.from = [
          toMetres(r.pos[0]) + toMetres(r.W) / 2 - w.x,
          -w.y,
          toMetres(r.pos[1]) + toMetres(r.D) / 2 - w.z,
        ];
        break;
      }
      const from = s.from;
      // the ceiling light, lit, is its room's
      const lit =
        downlight && downlight.intensity > 0
          ? [
              downlight.at[0] + from[0],
              downlight.at[1] + from[1],
              downlight.at[2] + from[2],
            ]
          : null;
      let due = false;
      for (const [id, g] of found) {
        const sig = roomSignature(
          g,
          from,
          id === active && lit ? lit[0]! * 7 + lit[2]! * 13 + 1 : 0,
        );
        let r = s.rooms.get(id);
        if (!r) {
          const used = new Set([...s.rooms.values()].map((x) => x.slot));
          let slot = 0;
          while (used.has(slot)) slot++;
          if (slot >= GI_ROOMS) continue;
          r = {
            sig,
            at: at - QUIET_MS,
            baked: null,
            going: null,
            layout: null,
            laid: null,
            slot,
          };
          s.rooms.set(id, r);
        }
        if (sig !== r.sig) {
          r.sig = sig;
          r.at = at;
        }
        if (r.baked !== r.sig && r.going !== r.sig && at - r.at >= QUIET_MS)
          due = true;
      }
      const left = [...s.rooms.entries()].some(([, r]) => r.baked !== r.sig);
      const busy =
        left || s.fade !== null || s.waiting.length > 0 || !s.rooms.size;
      const st = useGi.getState();
      if (busy && st.state !== "baking") useGi.setState({ state: "baking" });
      if (!busy && st.state !== "ready") {
        // the version moves (and the probes are taken again) only when
        // a bake was laid: a room's signature changes with what does
        // not change its light (a piece's own light bake arriving), and
        // each such change took the probes again, every piece in turn
        useGi.setState({
          state: "ready",
          version: s.laidSince ? st.version + 1 : st.version,
          full: st.full ?? Math.round(at - s.began),
        });
        s.laidSince = false;
      }
      if (!due || cameraMoving()) return;
      // the flat as it stands, and each room due baked: the active room
      // first, then the nearest
      const ins: GiRoomIn[] = [...found].map(([id, group]) => ({
        id,
        group,
        windows: s.windows.get(id) ?? [],
      }));
      const flat = collectFlat(ins, set.density, set.side, from);
      s.floors = flat.floors;
      s.shells = flat.shells;
      const centre = flat.rooms.get(active)?.box;
      const mid = (b: { lo: V3; hi: V3 }) => [
        (b.lo[0] + b.hi[0]) / 2,
        (b.lo[2] + b.hi[2]) / 2,
      ];
      const order = [...flat.rooms.entries()].sort(([a, pa], [b, pb]) => {
        if (a === active) return -1;
        if (b === active) return 1;
        if (!centre) return 0;
        const c = mid(centre);
        const da = mid(pa.box);
        const db = mid(pb.box);
        return (
          Math.hypot(da[0]! - c[0]!, da[1]! - c[1]!) -
          Math.hypot(db[0]! - c[0]!, db[1]! - c[1]!)
        );
      });
      const lk = s.lookKey;
      // the bakes in their order (round 10): the pieces' own light first,
      // then the rooms' bounce, then the probes (which wait on it): a
      // bounce worked out beside the pieces' bakes slowed both, and the
      // pieces in view are what a first picture needs
      if (useBakes.getState().pending > 0) return;
      if (!s.began) s.began = at;
      for (const [id, p] of order) {
        const r = s.rooms.get(id);
        if (!r || r.baked === r.sig || r.going === r.sig) continue;
        if (at - r.at < QUIET_MS) continue;
        const lamps: GiLamp[] = [...p.lamps];
        if (id === active && downlight && lit)
          lamps.push({
            at: lit as V3,
            intensity: linear(downlight.colour, downlight.intensity),
            reach: 0,
            cone: Math.cos(downlight.angle),
          });
        const lt = light.current!;
        const job: GiJob = {
          ...p.job,
          ...lt,
          lamps: lamps.map((x) => (x.reach ? x : { ...x, reach: 12 })),
          rays: set.rays,
          bounces: set.bounces,
        };
        const layout = JSON.stringify([
          p.job.size,
          p.charts.map((c) => [
            c.x,
            c.y,
            c.w,
            c.h,
            ...c.o.map((x) => Math.round(x * 1000)),
          ]),
        ]);
        const sig = r.sig;
        r.going = sig;
        const key = giKey(job);
        const doneOf = (half: Uint16Array, whole: boolean): Done => ({
          id,
          sig,
          key,
          whole,
          half,
          size: p.job.size,
          charts: p.charts,
          layout,
        });
        const had = kept.get(key);
        // the same job as the one the room's layer holds: nothing to lay
        if (had && r.laid === key && r.layout === layout) {
          r.baked = sig;
          r.going = null;
          continue;
        }
        if (had) {
          s.lay!(doneOf(had, true));
          continue;
        }
        useGi.setState((g) => ({ runs: g.runs + 1 }));
        const first = r.layout === null;
        if (first)
          void pool.run({ ...job, ...COARSE }).then(({ half, ms }) => {
            worked(ms);
            if (s.lookKey !== lk || r.layout !== null) return;
            s.lay!(doneOf(half, false));
          });
        void pool.run(job).then(({ half, ms }) => {
          worked(ms);
          keep(key, half);
          if (s.lookKey !== lk || r.going !== sig) return;
          s.lay!(doneOf(half, true));
        });
      }
    };
    const t = window.setInterval(poll, POLL_MS);
    poll();
    return () => {
      window.clearInterval(t);
      // off: every shell back to its live light, and read afresh when
      // the bake is on again
      for (const g of s.giving) g.deleteAttribute("giuv");
      s.giving.clear();
      s.given = new WeakMap();
      s.places.clear();
      s.rooms.clear();
      s.fade = null;
      s.waiting = [];
      s.give = null;
      s.lay = null;
      (GI_FADE.array as number[]).fill(0);
      invalidate();
    };
  }, [on, scene, side, invalidate]);

  // the fade, a frame at a time while the camera is still; and a wall's
  // other shape (an end squared as the camera goes round) given its
  // place as it comes
  useFrame((_, delta) => {
    const s = state.current;
    if (!on) return;
    s.give?.();
    const f = s.fade;
    if (!f) return;
    f.t = fadeOn(f.t, delta * 1000, FADE_MS, cameraMoving());
    const arr = GI_FADE.array as number[];
    if (f.t < 1) {
      arr[f.slot] = f.t;
      invalidate();
      return;
    }
    // the new bake is the room's own: copied to its layer, the share
    // back to it
    const tex = giTexture(set.side);
    const side = tex.image.width;
    const data = tex.image.data as Uint16Array;
    copyLayer(data, side, SPARE, f.slot);
    tex.addLayerUpdate(f.slot);
    tex.needsUpdate = true;
    arr[f.slot] = 0;
    s.fade = null;
    invalidate();
    const w = s.waiting.shift();
    if (w) s.lay?.(w);
  });
  return null;
}
