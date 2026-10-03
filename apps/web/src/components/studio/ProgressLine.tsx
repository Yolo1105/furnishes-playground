"use client";

import { useStudio } from "./studio-store";

/**
 * The thin orange line under the toolbar while something is being made:
 * quick for a swap between 2D and 3D, slow for a render. Its length is a
 * token per kind, so a real renderer can drive it later.
 */
export function ProgressLine() {
  const loading = useStudio((s) => s.loading);
  const at = useStudio((s) => s.loadingAt);
  const end = useStudio((s) => s.endLoading);
  if (!loading) return null;
  return (
    <div
      key={at}
      className="main-progress"
      data-kind={loading}
      role="progressbar"
      aria-label={loading === "render" ? "Rendering preview" : "Switching view"}
      onAnimationEnd={end}
    />
  );
}
