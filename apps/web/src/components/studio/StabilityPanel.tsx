"use client";

import { addAfterEffect, invalidate } from "@react-three/fiber";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import { DEV_FLAGS, type DevFlag, devFlag } from "./dev-flags";
import { liveScene } from "./scene-handle";
import { mainStage } from "./stage";
import {
  type Frame,
  heatImage,
  hotRegions,
  shimmerOf,
  stillTest,
} from "./stability";
import { useStudio } from "./studio-store";

/**
 * The stability page (`/rounded?check=stability`): whether the picture
 * holds still and moves without shimmer, and, where it does not, which
 * of its layers is to blame.
 *
 * - The still test draws the room 30 times with the camera at rest and
 *   reads each frame back: no pixel may move by more than 1/255. Its
 *   heat map shows where the ones that do gather.
 * - The motion test turns the camera slowly round the room for ten
 *   seconds, then walks the tour, reading a frame each draw; what jumps
 *   one frame and back the next (crawling edges, sparkle, flicker) is
 *   left once the smooth motion is taken out (stability.ts).
 * - Classify runs both again with each of the dev flags in turn (a
 *   reload each, the results kept for the session), so a hot region that
 *   cools with `?noao` is the occlusion's, with `?noshadows` the sun's.
 *
 * The page writes its state onto the stage (`data-stability`,
 * `data-still-moved`, `data-still-worst`, `data-shimmer`) for a test
 * to wait on, and a markdown report to copy.
 */

/** the frames each test reads, and how long the motion's two parts run */
const STILL_FRAMES = 30;
const ORBIT_S = 10;
const WALK_S = 6;
/** the frames are read at this width (the heat maps' size) */
const READ_W = 480;
/** where the classifying runs keep their results across the reloads */
const KEPT = "furnishes.stability";

type Run = {
  flag: DevFlag | "none";
  moved: number;
  worst: number;
  shimmer: number;
  stillHot: ReturnType<typeof hotRegions>;
  motionHot: ReturnType<typeof hotRegions>;
};

/** the frames drawn while `drive` runs, read back at READ_W wide: each
    taken straight after its draw (a WebGL canvas keeps nothing after) */
const readFrames = (
  count: number,
  drive?: (k: number) => void,
): Promise<Frame[]> =>
  new Promise((resolve) => {
    const canvas = mainStage()?.querySelector("canvas");
    if (!canvas) return resolve([]);
    const w = READ_W;
    const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
    const read = document.createElement("canvas");
    read.width = w;
    read.height = h;
    const ctx = read.getContext("2d", { willReadFrequently: true })!;
    const frames: Frame[] = [];
    const stop = addAfterEffect(() => {
      ctx.drawImage(canvas, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      frames.push({ w, h, data });
      if (frames.length >= count) {
        stop();
        resolve(frames);
        return;
      }
      drive?.(frames.length);
      // the next draw asked for at once: a still room draws nothing
      // otherwise (frameloop demand)
      requestAnimationFrame(() => invalidate());
    });
    drive?.(0);
    invalidate();
  });

/** the camera turned slowly round its target, a full sweep of 40° over
    ORBIT_S at 60 frames a second, then put back */
const orbit = async () => {
  const live = liveScene();
  if (!live) return [];
  const cam = live.camera;
  const start = cam.position.clone();
  const target = new Vector3(0, 1.1, 0);
  const n = ORBIT_S * 60;
  const offset = start.clone().sub(target);
  const frames = await readFrames(n, (k) => {
    const a = ((k / n) * 40 - 20) * (Math.PI / 180);
    const o = offset.clone().applyAxisAngle(new Vector3(0, 1, 0), a);
    cam.position.copy(target).add(o);
    cam.lookAt(target);
  });
  cam.position.copy(start);
  cam.lookAt(target);
  invalidate();
  return frames;
};

/** the tour walked for WALK_S seconds, its frames read as drawn */
const walk = async () => {
  const st = useStudio.getState();
  st.setWalk(true);
  st.startTour();
  const frames = await readFrames(WALK_S * 60);
  const s = useStudio.getState();
  s.stopTour();
  s.setWalk(false);
  return frames;
};

const pct = (x: number) => `${(x * 100).toFixed(3)} %`;
const regions = (r: ReturnType<typeof hotRegions>) =>
  r
    .map(
      (g) =>
        `(${Math.round(g.x * 100)} %, ${Math.round(g.y * 100)} %) ${g.heat.toFixed(3)}`,
    )
    .join("; ");

/** the report as markdown, a row a run */
export const stabilityReport = (runs: readonly Run[]) =>
  [
    "# Stability",
    "",
    `- When: ${new Date().toISOString()}`,
    `- Browser: ${typeof navigator === "undefined" ? "" : navigator.userAgent}`,
    "",
    "| Flag | Still: moved | Still: worst | Motion: shimmer | Still hot | Motion hot |",
    "| --- | --- | --- | --- | --- | --- |",
    ...runs.map(
      (r) =>
        `| ${r.flag} | ${pct(r.moved)} | ${r.worst}/255 | ${r.shimmer.toFixed(5)} | ${regions(r.stillHot)} | ${regions(r.motionHot)} |`,
    ),
  ].join("\n");

const kept = (): Run[] => {
  try {
    return JSON.parse(sessionStorage.getItem(KEPT) ?? "[]") as Run[];
  } catch {
    return [];
  }
};
const keep = (runs: Run[]) => {
  try {
    sessionStorage.setItem(KEPT, JSON.stringify(runs));
  } catch {
    // a private window: the run is shown, not kept
  }
};
/** the flag this page was loaded with, if any */
const flagNow = (): DevFlag | "none" =>
  DEV_FLAGS.find((f) => devFlag(f)) ?? "none";
/** the page again with one flag (or none), the check kept */
const urlWith = (flag: DevFlag | "none", classify: boolean) => {
  const u = new URL(window.location.href);
  for (const f of DEV_FLAGS) u.searchParams.delete(f);
  if (flag !== "none") u.searchParams.set(flag, "");
  if (classify) u.searchParams.set("classify", "");
  else u.searchParams.delete("classify");
  return u.toString().replace(/=(&|$)/g, "$1");
};

export function StabilityPanel() {
  const [state, setState] = useState<"idle" | "still" | "motion" | "done">(
    "idle",
  );
  const [run, setRun] = useState<Run | null>(null);
  // the runs kept this session (a classifying run reloads per flag)
  const [runs, setRuns] = useState<Run[]>(kept);
  const [report, setReport] = useState<string | null>(null);
  const stillRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef<HTMLCanvasElement>(null);
  // the page's state on the stage, for a test to wait on
  useEffect(() => {
    const el = mainStage();
    if (!el) return;
    el.dataset.stability = state;
    if (run) {
      el.dataset.stillMoved = run.moved.toFixed(5);
      el.dataset.stillWorst = String(run.worst);
      el.dataset.shimmer = run.shimmer.toFixed(5);
    }
  }, [state, run]);
  const paint = (ref: RefObject<HTMLCanvasElement | null>, img: Frame) => {
    const c = ref.current;
    if (!c) return;
    c.width = img.w;
    c.height = img.h;
    c.getContext("2d")!.putImageData(
      new ImageData(new Uint8ClampedArray(img.data), img.w, img.h),
      0,
      0,
    );
  };
  const start = async () => {
    // the room settled first: the probes, the reflection, the shaders
    for (let i = 0; i < 240; i++) {
      if (mainStage()?.dataset.settled === "true") break;
      await new Promise((r) => setTimeout(r, 500));
    }
    setState("still");
    const still = await readFrames(STILL_FRAMES);
    const s = stillTest(still);
    const w = still[0]?.w ?? 0;
    const h = still[0]?.h ?? 0;
    paint(stillRef, heatImage(s.heat, w, h));
    setState("motion");
    const moving = [...(await orbit()), ...(await walk())];
    const m = shimmerOf(moving);
    paint(motionRef, heatImage(m.heat, w, h));
    const done: Run = {
      flag: flagNow(),
      moved: s.moved,
      worst: s.worst,
      shimmer: m.mean,
      stillHot: hotRegions(s.heat, w, h),
      motionHot: hotRegions(m.heat, w, h),
    };
    setRun(done);
    const all = [...kept().filter((r) => r.flag !== done.flag), done];
    keep(all);
    setRuns(all);
    setState("done");
    // classifying: on to the next flag, or back to none when all ran
    if (new URLSearchParams(window.location.search).has("classify")) {
      const order: (DevFlag | "none")[] = ["none", ...STABILITY_FLAGS];
      const next = order[order.indexOf(done.flag) + 1];
      if (next) window.location.href = urlWith(next, true);
    }
  };
  // a classifying run starts itself once the page is up, on a timer
  // (its state is set as it runs, not in the effect)
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("classify")) return;
    const id = window.setTimeout(() => void start(), 0);
    return () => window.clearTimeout(id);
    // once, on the page's load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="glass dev-panel" aria-label="Stability check">
      <p className="dev-panel-title">Stability</p>
      <p className="dev-panel-text">
        Still: {STILL_FRAMES} frames at rest, no pixel past 1/255. Motion:{" "}
        {ORBIT_S} s of a slow orbit and {WALK_S} s of the walk, the shimmer left
        once the motion is taken out. Flag: {flagNow()}.
      </p>
      <div className="dev-panel-row">
        <button
          type="button"
          className="dev-panel-btn"
          disabled={state === "still" || state === "motion"}
          onClick={() => void start()}
        >
          {state === "still"
            ? "Reading the still…"
            : state === "motion"
              ? "Reading the motion…"
              : "Run"}
        </button>
        <button
          type="button"
          className="dev-panel-btn"
          onClick={() => {
            keep([]);
            window.location.href = urlWith("none", true);
          }}
        >
          Classify with each flag
        </button>
      </div>
      {run && (
        <ul className="dev-panel-lines" aria-label="Result">
          <li>
            Still: {pct(run.moved)} moved, worst {run.worst}/255 (
            {run.moved === 0 ? "pass" : "fail"})
          </li>
          <li>Motion: shimmer {run.shimmer.toFixed(5)}</li>
          <li>Still hot: {regions(run.stillHot) || "none"}</li>
          <li>Motion hot: {regions(run.motionHot) || "none"}</li>
        </ul>
      )}
      <div className="dev-panel-row">
        <canvas
          ref={stillRef}
          className="dev-panel-heat"
          aria-label="Still heat map"
        />
        <canvas
          ref={motionRef}
          className="dev-panel-heat"
          aria-label="Motion heat map"
        />
      </div>
      {runs.length > 0 && (
        <button
          type="button"
          className="dev-panel-btn"
          onClick={() => {
            const text = stabilityReport(runs);
            setReport(text);
            void navigator.clipboard?.writeText(text).catch(() => undefined);
          }}
        >
          Copy report ({runs.length} {runs.length === 1 ? "run" : "runs"})
        </button>
      )}
      {report && (
        <textarea className="dev-panel-report" readOnly value={report} />
      )}
    </section>
  );
}

/** the flags a classifying run turns off one at a time: each a layer
    of the picture that can move on its own */
export const STABILITY_FLAGS = [
  "noao",
  "noprobes",
  "nossr",
  "nossgi",
  "nobloom",
  "notraa",
  "noshadows",
  "flatnormals",
] as const satisfies readonly DevFlag[];
