"use client";

import { useStudio } from "./studio-store";

/**
 * The thin orange line under the toolbar while something is being made:
 * quick for a swap between 2D and 3D, slow for a graded render, and as
 * long as the samples take for a photo, which drives it by their count.
 */
export function ProgressLine() {
  const loading = useStudio((s) => s.loading);
  const at = useStudio((s) => s.loadingAt);
  const photo = useStudio((s) => s.photo);
  const end = useStudio((s) => s.endLoading);
  if (!loading) return null;
  const taking = loading === "photo";
  const done = taking && photo ? photo.samples / Math.max(photo.of, 1) : null;
  return (
    <div
      key={at}
      className="main-progress"
      data-kind={loading}
      role="progressbar"
      aria-label={
        taking
          ? "Tracing the light"
          : loading === "render"
            ? "Rendering the room"
            : "Switching view"
      }
      aria-valuenow={done === null ? undefined : Math.round(done * 100)}
      style={done === null ? undefined : { width: `${done * 100}%` }}
      onAnimationEnd={taking ? undefined : end}
    />
  );
}
