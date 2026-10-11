"use client";

import { useEffect, useState } from "react";
import {
  type BenchReport,
  benchLines,
  runWalkBench,
  watchLongTasks,
} from "./bench";
import { tierOf } from "./Post";
import { useStudio } from "./studio-store";

/** where the frames are drawn, read from the stage and the store */
export const whereOf = () => {
  const s = useStudio.getState();
  const canvas = document.querySelector<HTMLCanvasElement>(".stage-3d canvas");
  return {
    backend: s.backend,
    tier: s.backend ? tierOf(s.scene.quality, false, s.backend) : null,
    dpr: window.devicePixelRatio,
    canvas: { width: canvas?.width ?? 0, height: canvas?.height ?? 0 },
  };
};

/**
 * The bench panel (`/rounded?bench=walk`): starts the walk once the
 * room is up, records twenty seconds, then shows the report with each
 * budget line passed or failed and a button to copy the JSON.
 */
export function BenchPanel() {
  const backend = useStudio((s) => s.backend);
  const [report, setReport] = useState<BenchReport | null>(null);
  const [state, setState] = useState<"waiting" | "running" | "done">("waiting");
  const [copied, setCopied] = useState(false);
  // the long tasks from the page's start, taken before the walk
  useEffect(watchLongTasks, []);
  useEffect(() => {
    if (!backend || state !== "waiting") return;
    // the room's first frame and its probes get a few seconds first
    const id = window.setTimeout(() => {
      setState("running");
      void runWalkBench(whereOf).then((r) => {
        setReport(r);
        setState("done");
      });
    }, 4000);
    return () => window.clearTimeout(id);
  }, [backend, state]);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(JSON.stringify(report, null, 2))
      .then(() => setCopied(true));
  };
  return (
    <section className="glass dev-panel" role="status" aria-label="Frame bench">
      <p className="dev-panel-title">Frame bench</p>
      {state !== "done" && (
        <p className="dev-panel-text">
          {state === "waiting"
            ? "Waiting for the room…"
            : "Walking the room for twenty seconds…"}
        </p>
      )}
      {report && (
        <>
          <ul className="dev-panel-lines">
            {benchLines(report).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <ul className="dev-panel-lines" aria-label="Budgets">
            {report.budgets.map((b) => (
              <li key={b.name} data-pass={b.pass}>
                {b.pass ? "pass" : "fail"} · {b.name}: {b.got} (want {b.want})
              </li>
            ))}
          </ul>
          <button type="button" className="dev-panel-btn" onClick={copy}>
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </>
      )}
    </section>
  );
}
