"use client";

import { useEffect, useState } from "react";
import { minRenderMs, useStudio } from "./studio-store";

/**
 * The thin orange line under the toolbar while something is being made:
 * quick for a swap between 2D and 3D; for a render, as far as the work
 * has got (the probes baked, the samples traced), with a steady floor
 * that climbs through the render's least time and waits at nine tenths
 * for the work, so the line moves at the pace of the thing itself and
 * never leaps to the end to stall there.
 */
/** where the time floor waits for the work */
const FLOOR_MAX = 0.9;

export function ProgressLine() {
  const loading = useStudio((s) => s.loading);
  const at = useStudio((s) => s.loadingAt);
  const work = useStudio((s) => s.work);
  const end = useStudio((s) => s.endLoading);
  const making = loading === "render" || loading === "photo";
  const [floor, setFloor] = useState(0);
  useEffect(() => {
    if (!making) return;
    const from = performance.now();
    const least = minRenderMs() || 1;
    let frame = 0;
    const tick = () => {
      const t = Math.min(FLOOR_MAX, (performance.now() - from) / least);
      setFloor(t);
      if (t < FLOOR_MAX) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [making, at]);
  if (!loading) return null;
  // the work's own share: the step's count, else the steps done
  const share = work
    ? work.of > 0
      ? (work.plan.indexOf(work.step) + work.done / work.of) / work.plan.length
      : work.plan.indexOf(work.step) / work.plan.length
    : 0;
  const width = making ? Math.max(share, floor) : null;
  return (
    <div
      key={at}
      className="main-progress"
      data-kind={loading}
      role="progressbar"
      aria-label={
        loading === "photo"
          ? "Tracing the light"
          : loading === "render"
            ? "Rendering the room"
            : "Switching view"
      }
      aria-valuenow={width === null ? undefined : Math.round(width * 100)}
      style={width === null ? undefined : { width: `${width * 100}%` }}
      onAnimationEnd={making ? undefined : end}
    />
  );
}
