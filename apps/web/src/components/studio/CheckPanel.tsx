"use client";

import { useEffect, useState } from "react";
import {
  type BenchReport,
  benchLines,
  runWalkBench,
  watchLongTasks,
} from "./bench";
import { whereOf } from "./BenchPanel";
import { CHECKS } from "./webgpu-checks";

type Result = { pass: boolean | null; note: string };

/** the stage's attributes named, as they stand */
const readStage = (reads: readonly string[]) => {
  const el = document.querySelector<HTMLElement>(".shell-stage .stage-3d");
  return Object.fromEntries(
    reads.map((k) => [
      k,
      el?.dataset[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] ??
        "",
    ]),
  );
};

/** the report as markdown: the browser, the adapter, each check with
    its result, note and the stage's attributes, and the benches */
export const checkReport = (
  results: Record<string, Result>,
  attrs: Record<string, Record<string, string>>,
  adapter: unknown,
  bench: BenchReport | null,
  photoBench: unknown,
) => {
  const lines = [
    "# WebGPU check",
    "",
    `- When: ${new Date().toISOString()}`,
    `- Browser: ${typeof navigator === "undefined" ? "" : navigator.userAgent}`,
    `- Adapter: ${adapter ? JSON.stringify(adapter) : "not read"}`,
    "",
    "| # | Check | Result | Note | Stage |",
    "| --- | --- | --- | --- | --- |",
  ];
  CHECKS.forEach((c, i) => {
    const r = results[c.id];
    const a = attrs[c.id];
    lines.push(
      `| ${i + 1} | ${c.title} | ${r?.pass === true ? "pass" : r?.pass === false ? "fail" : "not checked"} | ${r?.note ?? ""} | ${
        a
          ? Object.entries(a)
              .map(([k, v]) => `${k}=${v}`)
              .join(" ")
          : ""
      } |`,
    );
  });
  lines.push(
    "",
    "## Frame bench",
    "",
    bench ? "```json\n" + JSON.stringify(bench, null, 2) + "\n```" : "not run",
  );
  lines.push(
    "",
    "## Photo bench",
    "",
    photoBench
      ? "```json\n" + JSON.stringify(photoBench, null, 2) + "\n```"
      : "not run",
  );
  return lines.join("\n");
};

/**
 * The guided checklist (`/rounded?check=webgpu`): walks through the
 * plan's by-hand checks one at a time, sets the view each needs, says
 * what to look at, reads the stage's attributes as they stand, takes
 * Pass or Fail with a note, runs the frame bench, and copies a
 * markdown report out (or shows it, where the clipboard is shut).
 */
export function CheckPanel() {
  const [at, setAt] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [attrs, setAttrs] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [live, setLive] = useState<Record<string, string>>({});
  const [bench, setBench] = useState<BenchReport | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [adapter, setAdapter] = useState<unknown>(null);
  const check = CHECKS[at]!;
  // the long tasks from the page's start, for the bench's opening lines
  useEffect(watchLongTasks, []);
  // the stage read once a second while a check is looked at
  useEffect(() => {
    const tick = () => setLive(readStage(check.reads));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [check]);
  useEffect(() => {
    const gpu = (
      navigator as unknown as {
        gpu?: { requestAdapter: () => Promise<{ info?: unknown } | null> };
      }
    ).gpu;
    void gpu
      ?.requestAdapter()
      .then((a) => setAdapter(a?.info ?? null))
      .catch(() => undefined);
  }, []);
  const mark = (pass: boolean) => {
    setResults((r) => ({
      ...r,
      [check.id]: { pass, note: r[check.id]?.note ?? "" },
    }));
    setAttrs((a) => ({ ...a, [check.id]: readStage(check.reads) }));
  };
  const note = (text: string) =>
    setResults((r) => ({
      ...r,
      [check.id]: { pass: r[check.id]?.pass ?? null, note: text },
    }));
  const go = (i: number) => {
    const next = Math.max(0, Math.min(CHECKS.length - 1, i));
    setAt(next);
    CHECKS[next]!.set?.();
  };
  const runBench = () => {
    setRunning(true);
    void runWalkBench(whereOf).then((r) => {
      setBench(r);
      setRunning(false);
    });
  };
  const makeReport = () => {
    const text = checkReport(
      results,
      attrs,
      adapter,
      bench ?? (window as unknown as { __bench?: BenchReport }).__bench ?? null,
      (window as unknown as { __photoBench?: unknown }).__photoBench ?? null,
    );
    setReport(text);
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  const r = results[check.id];
  return (
    <section className="glass dev-panel" aria-label="WebGPU checklist">
      <p className="dev-panel-title">
        WebGPU check {at + 1} of {CHECKS.length}
      </p>
      <p className="dev-panel-head">{check.title}</p>
      <p className="dev-panel-text">{check.look}</p>
      <ul className="dev-panel-lines" aria-label="Stage">
        {check.reads.map((k) => (
          <li key={k}>
            {k}: {live[k] || "—"}
          </li>
        ))}
      </ul>
      <div className="dev-panel-row">
        <button
          type="button"
          className="dev-panel-btn"
          data-on={r?.pass === true}
          onClick={() => mark(true)}
        >
          Pass
        </button>
        <button
          type="button"
          className="dev-panel-btn"
          data-on={r?.pass === false}
          onClick={() => mark(false)}
        >
          Fail
        </button>
        <input
          className="dev-panel-input"
          aria-label="Note"
          placeholder="A note"
          value={r?.note ?? ""}
          onChange={(e) => note(e.target.value)}
        />
      </div>
      <div className="dev-panel-row">
        <button
          type="button"
          className="dev-panel-btn"
          onClick={() => go(at - 1)}
          disabled={at === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="dev-panel-btn"
          onClick={() => go(at + 1)}
          disabled={at === CHECKS.length - 1}
        >
          Next
        </button>
        {check.id === "bench" && (
          <button
            type="button"
            className="dev-panel-btn"
            onClick={runBench}
            disabled={running}
          >
            {running ? "Walking…" : "Run the bench"}
          </button>
        )}
      </div>
      {bench && (
        <ul className="dev-panel-lines" aria-label="Bench">
          {benchLines(bench).map((l) => (
            <li key={l}>{l}</li>
          ))}
          {bench.budgets.map((b) => (
            <li key={b.name} data-pass={b.pass}>
              {b.pass ? "pass" : "fail"} · {b.name}: {b.got} (want {b.want})
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="dev-panel-btn" onClick={makeReport}>
        Copy report
      </button>
      {report && (
        <textarea
          className="dev-panel-report"
          aria-label="Report"
          readOnly
          value={report}
        />
      )}
    </section>
  );
}
