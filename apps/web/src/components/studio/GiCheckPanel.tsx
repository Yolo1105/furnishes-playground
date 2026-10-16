"use client";

import { addAfterEffect, invalidate } from "@react-three/fiber";
import { useState } from "react";
import {
  compareRegions,
  GI_GRID,
  GI_TOLERANCE,
  type Picture,
  regionMeans,
} from "./gi-check";
import { mainStage } from "./stage";
import { useStudio } from "./studio-store";

/**
 * The bounce check (`/rounded?check=gi`, round 9, Part 4): the live
 * view, lit by its baked bounce (GiBake.tsx), against the path tracer's
 * photo of the same view (Photo.tsx), region by region (gi-check.ts):
 * every region within `GI_TOLERANCE` of the tracer's passes. The tracer
 * runs on WebGPU alone; elsewhere the page says so and reads the live
 * view only. Its state is on the stage (`data-gi-check`: idle, live,
 * tracing, pass, fail, no-tracer; `data-gi-worst`, the worst region's
 * difference) for a test to wait on.
 */

/** the pictures are read at this width */
const READ_W = 480;

/** the frame on the stage's canvas now, read at READ_W wide (after its
    next draw: a WebGL canvas keeps nothing after one) */
const readFrame = (): Promise<Picture | null> =>
  new Promise((resolve) => {
    const canvas = mainStage()?.querySelector("canvas");
    if (!canvas) return resolve(null);
    const w = READ_W;
    const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
    const read = document.createElement("canvas");
    read.width = w;
    read.height = h;
    const ctx = read.getContext("2d", { willReadFrequently: true })!;
    const stop = addAfterEffect(() => {
      stop();
      ctx.drawImage(canvas, 0, 0, w, h);
      resolve({ w, h, data: ctx.getImageData(0, 0, w, h).data });
    });
    invalidate();
  });

/** the traced photo shown over the stage, read at READ_W wide */
const readImage = (url: string): Promise<Picture | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = READ_W;
      const h = Math.max(1, Math.round((img.height / img.width) * w));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ w, h, data: ctx.getImageData(0, 0, w, h).data });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type State = "idle" | "live" | "tracing" | "pass" | "fail" | "no-tracer";

const mark = (state: State, worst?: number) => {
  const stage = mainStage();
  if (!stage) return;
  stage.dataset.giCheck = state;
  if (worst !== undefined) stage.dataset.giWorst = worst.toFixed(3);
};

const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

export function GiCheckPanel() {
  const [state, setState] = useState<State>("idle");
  const [diffs, setDiffs] = useState<number[] | null>(null);
  const [worst, setWorst] = useState<number | null>(null);
  const go = (s: State, w?: number) => {
    setState(s);
    mark(s, w);
  };
  const run = async () => {
    // the room settled and its bounce baked first
    for (let i = 0; i < 1200; i++) {
      const st = mainStage()?.dataset;
      if (st?.settled === "true" && st.gi !== "baking") break;
      await wait(500);
    }
    go("live");
    const live = await readFrame();
    if (!live) return go("idle");
    if (useStudio.getState().backend !== "webgpu") {
      setDiffs(null);
      return go("no-tracer");
    }
    go("tracing");
    useStudio.getState().setMode("preview");
    let url: string | null = null;
    for (let i = 0; i < 3600; i++) {
      const photo = useStudio.getState().photo;
      if (photo?.state === "failed") break;
      if (photo?.state === "done") {
        url =
          mainStage()?.querySelector("canvas")?.toDataURL("image/png") ?? null;
        break;
      }
      await wait(500);
    }
    useStudio.getState().setMode("edit");
    const traced = url ? await readImage(url) : null;
    if (!traced) return go("no-tracer");
    const c = compareRegions(regionMeans(live), regionMeans(traced));
    setDiffs(c.diffs);
    setWorst(c.worst);
    go(c.pass ? "pass" : "fail", c.worst);
  };
  return (
    <section className="glass dev-panel" aria-label="Bounce check">
      <p className="dev-panel-title">Bounce</p>
      <p className="dev-panel-text">
        The live view against the traced photo of it, in {GI_GRID.cols}×
        {GI_GRID.rows} regions, each as a share of its picture&apos;s mean:
        every region within {Math.round(GI_TOLERANCE * 100)}% passes. The tracer
        needs WebGPU.
      </p>
      <div className="dev-panel-row">
        <button
          type="button"
          className="dev-panel-btn"
          disabled={state === "live" || state === "tracing"}
          onClick={() => void run()}
        >
          {state === "live"
            ? "Reading the view…"
            : state === "tracing"
              ? "Tracing…"
              : "Run"}
        </button>
      </div>
      <ul className="dev-panel-lines" aria-label="Result">
        <li>State: {state}</li>
        {worst !== null && <li>Worst region: {pct(worst)}</li>}
        {diffs && (
          <li>
            Regions:{" "}
            {diffs
              .map((d, i) =>
                (i + 1) % GI_GRID.cols === 0 && i + 1 < diffs.length
                  ? `${pct(d)} /`
                  : pct(d),
              )
              .join(" ")}
          </li>
        )}
      </ul>
    </section>
  );
}
