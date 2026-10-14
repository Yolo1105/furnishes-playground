"use client";

import {
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { create } from "zustand";
import { ATLAS_SIZE, WHITE } from "./bake-defaults";
import {
  BAKE_VERSION,
  bake,
  type BakeJob,
  type BakeResult,
} from "./lightmap-bake";

/**
 * Where the pieces' baked light lives (lightmap-bake.ts bakes it): one
 * atlas for the whole flat, each piece's charts and its footprint a
 * rectangle in it, so every piece keeps sharing its finish's material
 * (a texture of its own would make a material, and a shader to build,
 * a piece). Its corner texel is white: a part not yet baked, or with no
 * second UV set at all, reads it and is drawn as before. The bakes run
 * one at a time in a worker, the pieces drawn without theirs meanwhile;
 * each kept by its key in memory and in IndexedDB, so a piece built the
 * same way again, this visit or the next, is never baked twice.
 * `useBakes.pending` counts the pieces still waiting on theirs (the
 * stage's `data-bakes`).
 */

const data = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
for (let y = 0; y < WHITE; y++)
  data.fill(255, y * ATLAS_SIZE * 4, (y * ATLAS_SIZE + WHITE) * 4);
export const LIGHTMAP = new DataTexture(
  data,
  ATLAS_SIZE,
  ATLAS_SIZE,
  RGBAFormat,
  UnsignedByteType,
);
LIGHTMAP.colorSpace = NoColorSpace;
LIGHTMAP.magFilter = LinearFilter;
LIGHTMAP.minFilter = LinearFilter;
LIGHTMAP.generateMipmaps = false;
LIGHTMAP.flipY = false;
LIGHTMAP.needsUpdate = true;

/** the atlas sent again at most this often, ms: each piece's bake
    landing would otherwise send all of it, once a piece */
const SEND_EVERY = 250;
let sending = 0;
const send = () => {
  if (sending) return;
  sending = window.setTimeout(() => {
    sending = 0;
    LIGHTMAP.needsUpdate = true;
    useBakes.setState((s) => ({ sent: s.sent + 1 }));
  }, SEND_EVERY);
};

/* ---------- the atlas's room: free rectangles, split as taken ---------- */

export type Rect = { x: number; y: number; w: number; h: number };
let free: Rect[] = [
  { x: WHITE, y: 0, w: ATLAS_SIZE - WHITE, h: WHITE },
  { x: 0, y: WHITE, w: ATLAS_SIZE, h: ATLAS_SIZE - WHITE },
];
/** a rectangle of the atlas, or null when it is full: the smallest free
    one it fits, the rest split off along its longer leftover */
export const take = (w: number, h: number): Rect | null => {
  let best = -1;
  for (let i = 0; i < free.length; i++) {
    const f = free[i]!;
    if (f.w < w || f.h < h) continue;
    if (best < 0 || f.w * f.h < free[best]!.w * free[best]!.h) best = i;
  }
  if (best < 0) return null;
  const f = free[best]!;
  free.splice(best, 1);
  const right = { x: f.x + w, y: f.y, w: f.w - w, h };
  const below = { x: f.x, y: f.y + h, w: f.w, h: f.h - h };
  if (f.w - w > f.h - h) {
    right.h = f.h;
    below.w = w;
  }
  if (right.w > 0 && right.h > 0) free.push(right);
  if (below.w > 0 && below.h > 0) free.push(below);
  return { x: f.x, y: f.y, w, h };
};
/** a rectangle given back (its neighbours merged where they line up) */
export const giveBack = (r: Rect) => {
  free.push(r);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < free.length; i++)
      for (let j = 0; j < free.length; j++) {
        if (i === j) continue;
        const a = free[i]!;
        const b = free[j]!;
        const side = a.y === b.y && a.h === b.h && a.x + a.w === b.x;
        const over = a.x === b.x && a.w === b.w && a.y + a.h === b.y;
        if (side || over) {
          free[i] = side
            ? { x: a.x, y: a.y, w: a.w + b.w, h: a.h }
            : { x: a.x, y: a.y, w: a.w, h: a.h + b.h };
          free.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }
};
/** the atlas as new: for the tests */
export const resetAtlas = () => {
  free = [
    { x: WHITE, y: 0, w: ATLAS_SIZE - WHITE, h: WHITE },
    { x: 0, y: WHITE, w: ATLAS_SIZE, h: ATLAS_SIZE - WHITE },
  ];
};

/** a bake's pixels written into its rectangle; `fill` gives each texel
    from a source of `w` across: RGBA rows, or one channel (the
    footprint) spread into R with the rest white */
export const paint = (r: Rect, src: Uint8Array, rgba: boolean) => {
  for (let y = 0; y < r.h; y++) {
    const o = ((r.y + y) * ATLAS_SIZE + r.x) * 4;
    if (rgba) data.set(src.subarray(y * r.w * 4, (y + 1) * r.w * 4), o);
    else
      for (let x = 0; x < r.w; x++) {
        const k = o + x * 4;
        data[k] = src[y * r.w + x]!;
        data[k + 1] = 255;
        data[k + 2] = 255;
        data[k + 3] = 255;
      }
  }
  send();
};

/* ---------- the bakes ---------- */

export const useBakes = create<{
  /** the pieces whose light is still to land: changed and not yet
      baked and applied */
  pending: number;
  /** times the atlas has been sent (a test can wait on it) */
  sent: number;
  /** each bake's time, ms, by the piece's name, the last of each */
  times: Record<string, number>;
}>(() => ({ pending: 0, sent: 0, times: {} }));

// in development the bakes' times are at hand to a script (the glance
// test reports them)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  Object.assign(window, { __bakes: useBakes });

/** the pieces waiting on their light, by a key of their own */
const waiting_ = new Set<object>();
/** a piece's bake asked for, or landed (or the piece gone) */
export const awaiting = (who: object, yes: boolean) => {
  const had = waiting_.has(who);
  if (yes === had) return;
  if (yes) waiting_.add(who);
  else waiting_.delete(who);
  useBakes.setState({ pending: waiting_.size });
};

const kept = new Map<string, BakeResult>();
const KEPT = 160;

/** IndexedDB: one store, a result by its key */
const DB = "furnishes-bakes";
const STORE = `v${BAKE_VERSION}`;
let opened: Promise<IDBDatabase | null> | null = null;
const db = () =>
  (opened ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB, BAKE_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const name of [...d.objectStoreNames])
          if (name !== STORE) d.deleteObjectStore(name);
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));
const fromDisk = async (key: string) => {
  const d = await db();
  if (!d) return null;
  return new Promise<BakeResult | null>((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as BakeResult) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};
const toDisk = async (key: string, r: BakeResult) => {
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, "readwrite").objectStore(STORE).put(r, key);
  } catch {
    // a full or closed store: the bake is only not kept
  }
};

let worker: Worker | null | undefined;
let next = 1;
const waiting = new Map<number, (r: BakeResult) => void>();
/** the bakes queued, nearest first when asked with a distance */
const queue: { job: BakeJob; near: number; go: () => void }[] = [];
let running = false;
const run = () => {
  if (running) return;
  queue.sort((a, b) => a.near - b.near);
  const q = queue.shift();
  if (!q) return;
  running = true;
  q.go();
};

const inWorker = (job: BakeJob) =>
  new Promise<BakeResult>((resolve) => {
    if (worker === undefined)
      try {
        const w = new Worker(new URL("./lightmap.worker.ts", import.meta.url), {
          type: "module",
        });
        w.onmessage = (e: MessageEvent<{ id: number; result: BakeResult }>) => {
          waiting.get(e.data.id)?.(e.data.result);
          waiting.delete(e.data.id);
        };
        worker = w;
      } catch {
        worker = null;
      }
    if (!worker) {
      // no workers (a test page): baked here
      resolve(bake(job));
      return;
    }
    const id = next++;
    waiting.set(id, resolve);
    worker.postMessage({ id, job });
  });

/**
 * A piece's bake: from memory, else from IndexedDB, else baked in the
 * worker (one at a time, `near` first: the camera's distance to the
 * piece, so the pieces in view come first). `name` labels its time.
 */
export const bakeOf = (
  key: string,
  job: BakeJob,
  name: string,
  near: number,
): Promise<BakeResult> => {
  const had = kept.get(key);
  if (had) return Promise.resolve(had);
  return new Promise<BakeResult>((resolve) => {
    queue.push({
      job,
      near,
      go: () => {
        const t0 = performance.now();
        void (async () => {
          let r = await fromDisk(key);
          const disk = !!r;
          r ??= await inWorker(job);
          if (!disk) void toDisk(key, r);
          if (kept.size >= KEPT) kept.delete(kept.keys().next().value!);
          kept.set(key, r);
          const ms = Math.round(performance.now() - t0);
          if (!disk)
            useBakes.setState((s) => ({ times: { ...s.times, [name]: ms } }));
          running = false;
          run();
          resolve(r);
        })();
      },
    });
    run();
  });
};
