"use client";

import { useEffect, useState } from "react";
import {
  type BenchReport,
  benchLines,
  runWalkBench,
  watchLongTasks,
} from "./bench";
import { tierOf } from "./Post";
import { mainStage } from "./stage";
import { useStudio } from "./studio-store";

/** how often the stage is looked at while the room is being built */
const SETTLE_POLL_MS = 250;
/** the probes' time once the room has settled, before the walk */
const PROBES_MS = 4000;

/** where the frames are drawn, read from the stage and the store */
export const whereOf = () => {
  const s = useStudio.getState();
  const canvas = mainStage()?.querySelector("canvas");
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
    // the room drawn and settled (most of a minute on a software
    // renderer), then a few seconds for its probes: a walk timed while
    // the room is still being built would measure the build
    let id = 0;
    const wait = () => {
      if (mainStage()?.dataset.settled !== "true") {
        id = window.setTimeout(wait, SETTLE_POLL_MS);
        return;
      }
      id = window.setTimeout(() => {
        setState("running");
        void runWalkBench(whereOf).then((r) => {
          setReport(r);
          setState("done");
        });
      }, PROBES_MS);
    };
    wait();
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
