import type { Mesh } from "three";
import { liveScene } from "./scene-handle";
import { useStudio, type Backend } from "./studio-store";
import type { Tier } from "./Post";

/**
 * The frame bench (`/rounded?bench=walk`): a fixed walk through the
 * room for twenty seconds (the tour's own round, which keeps clear of
 * the pieces and looks at them), every frame's time taken by the wall
 * clock as it is drawn, the post-processing's share timed round its
 * render, and on WebGPU the GPU's own time per frame where the device
 * can say. The report gives the percentiles, the frame rate and the
 * post's share against the plan's budgets, pass or fail a line, on
 * `window.__bench` and the panel (BenchPanel.tsx). Before the walk it
 * takes what opening the room cost: how long the page's main thread
 * was held (the shaders built, the room made), the shader programs the
 * room keeps, and what the scene draws, so a phone or a laptop's GPU
 * reports the numbers the sandbox's software renderer can only guess.
 */
/** how long the walk runs, s */
export const BENCH_S = 20;
/** a frame as recorded: its whole time and the post's share, ms, and
    the GPU's time where read */
export type Frame = { ms: number; post: number; gpu?: number };
export type Budget = { name: string; want: string; got: string; pass: boolean };
/** what opening the room cost, taken as the walk begins: the long
    tasks are null where the browser does not report them (Safari,
    Firefox) */
export type Opening = {
  /** the main thread's tasks over 50 ms since the page began */
  longTasks: number | null;
  /** their time together, ms */
  blockedMs: number | null;
  /** the longest, ms: the longest the page stood still */
  longestMs: number | null;
  /** the shader programs the renderer keeps */
  programs: number | null;
  /** what the scene draws: meshes shown, those casting a shadow, and
      their triangles */
  meshes: number;
  casters: number;
  triangles: number;
};
export type BenchReport = {
  at: string;
  backend: Backend;
  tier: Tier | null;
  dpr: number;
  canvas: { width: number; height: number };
  frames: number;
  seconds: number;
  p50: number;
  p95: number;
  p99: number;
  fps: number;
  post: { p50: number; p95: number };
  gpu: { p50: number; p95: number } | null;
  budgets: Budget[];
  opening?: Opening;
};

/** the recorder the frame hook and the post write to while a bench runs */
export const recorder = {
  running: false,
  frames: [] as Frame[],
  /** the last post render's time, ms, taken into the next frame */
  post: 0,
  /** the renderer's count of its shader programs, set by the canvas */
  programs: null as (() => number) | null,
};

/** the main thread's long tasks since the page began: the browser keeps
    the ones before the watch began and hands them over with the rest */
const longTasks: number[] = [];
let watching = false;
export const watchLongTasks = () => {
  if (watching || typeof PerformanceObserver === "undefined") return;
  if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) return;
  watching = true;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push(e.duration);
  }).observe({ type: "longtask", buffered: true });
};

/** what the scene draws now: the meshes shown (under shown parents),
    the shadow casters among them, and their triangles */
export const sceneCost = () => {
  const cost = { meshes: 0, casters: 0, triangles: 0 };
  liveScene()?.scene.traverseVisible((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    cost.meshes += 1;
    if (mesh.castShadow) cost.casters += 1;
    const g = mesh.geometry;
    const count = g.index?.count ?? g.getAttribute("position")?.count ?? 0;
    cost.triangles += Math.round(count / 3);
  });
  return cost;
};

/** the opening's cost as it stands */
export const openingNow = (): Opening => ({
  longTasks: watching ? longTasks.length : null,
  blockedMs: watching ? Math.round(longTasks.reduce((a, b) => a + b, 0)) : null,
  longestMs: watching ? Math.round(Math.max(0, ...longTasks)) : null,
  programs: recorder.programs?.() ?? null,
  ...sceneCost(),
});
export const recordPost = (ms: number) => {
  if (recorder.running) recorder.post = ms;
};
export const recordFrame = (ms: number, gpu?: number) => {
  if (!recorder.running) return;
  recorder.frames.push({
    ms,
    post: recorder.post,
    ...(gpu !== undefined ? { gpu } : {}),
  });
  recorder.post = 0;
};

/** the p-th percentile of some numbers, by the nearest rank */
export const percentile = (xs: readonly number[], p: number) => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[rank]!;
};
const round = (v: number) => Math.round(v * 100) / 100;

/** the plan's budgets, judged for the tier and the picture's height */
export const budgetsFor = (
  tier: Tier | null,
  height: number,
  stats: { p95: number; fps: number; postP95: number },
): Budget[] => {
  const out: Budget[] = [];
  if (tier === "desktop") {
    out.push({
      name: `desktop P95 frame at ${height}p`,
      want: "≤ 16.7 ms",
      got: `${round(stats.p95)} ms`,
      pass: stats.p95 <= 16.7,
    });
    out.push({
      name: `desktop post-processing P95 at ${height}p`,
      want: "≤ 6 ms",
      got: `${round(stats.postP95)} ms`,
      pass: stats.postP95 <= 6,
    });
  } else if (tier === "laptop") {
    out.push({
      name: `laptop frame rate at ${height}p`,
      want: "≥ 45 fps",
      got: `${round(stats.fps)} fps`,
      pass: stats.fps >= 45,
    });
  } else {
    out.push({
      name: `phone frame rate at ${height}p`,
      want: "≥ 30 fps",
      got: `${round(stats.fps)} fps`,
      pass: stats.fps >= 30,
    });
  }
  return out;
};

/** the report from the frames recorded and where they were drawn */
export const benchStats = (
  frames: readonly Frame[],
  where: {
    backend: Backend;
    tier: Tier | null;
    dpr: number;
    canvas: { width: number; height: number };
  },
): BenchReport => {
  const ms = frames.map((f) => f.ms);
  const total = ms.reduce((a, b) => a + b, 0) / 1000;
  const posts = frames.map((f) => f.post).filter((p) => p > 0);
  const gpus = frames
    .map((f) => f.gpu)
    .filter((g): g is number => g !== undefined && g > 0);
  const p95 = percentile(ms, 95);
  const fps = total > 0 ? frames.length / total : 0;
  const postP95 = percentile(posts, 95);
  return {
    at: new Date().toISOString(),
    ...where,
    frames: frames.length,
    seconds: round(total),
    p50: round(percentile(ms, 50)),
    p95: round(p95),
    p99: round(percentile(ms, 99)),
    fps: round(fps),
    post: { p50: round(percentile(posts, 50)), p95: round(postP95) },
    gpu: gpus.length
      ? { p50: round(percentile(gpus, 50)), p95: round(percentile(gpus, 95)) }
      : null,
    budgets: budgetsFor(where.tier, where.canvas.height, { p95, fps, postP95 }),
  };
};

/** the report as lines for the panel and the clipboard */
export const benchLines = (r: BenchReport) => [
  `${r.backend} · ${r.tier ?? "no tier"} · ${r.canvas.width}×${r.canvas.height} at ${r.dpr}×`,
  `${r.frames} frames in ${r.seconds} s · ${r.fps} fps`,
  `frame P50 ${r.p50} ms · P95 ${r.p95} ms · P99 ${r.p99} ms`,
  `post-processing P50 ${r.post.p50} ms · P95 ${r.post.p95} ms`,
  r.gpu
    ? `GPU P50 ${r.gpu.p50} ms · P95 ${r.gpu.p95} ms`
    : "GPU time: not read (no timestamp query)",
  ...(r.opening
    ? [
        r.opening.longTasks === null
          ? "opening: long tasks not reported by this browser"
          : `opening: main thread held ${r.opening.blockedMs} ms in ${r.opening.longTasks} long tasks · longest ${r.opening.longestMs} ms`,
        `opening: ${r.opening.programs ?? "?"} shader programs · ${r.opening.meshes} meshes (${r.opening.casters} cast shadows) · ${r.opening.triangles} triangles`,
      ]
    : []),
];

/** the bench run: the walk's round played for BENCH_S seconds while
    the frames are recorded, then the report, left on the window too */
export const runWalkBench = (where: () => Parameters<typeof benchStats>[1]) =>
  new Promise<BenchReport>((resolve) => {
    const st = useStudio.getState();
    const opening = openingNow();
    recorder.frames = [];
    recorder.post = 0;
    recorder.running = true;
    st.setWalk(true);
    st.startTour();
    window.setTimeout(() => {
      recorder.running = false;
      const s = useStudio.getState();
      s.stopTour();
      s.setWalk(false);
      const report = { ...benchStats(recorder.frames, where()), opening };
      (window as unknown as { __bench?: BenchReport }).__bench = report;
      console.info("bench", report);
      resolve(report);
    }, BENCH_S * 1000);
  });
