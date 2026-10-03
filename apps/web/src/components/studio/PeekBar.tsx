"use client";

import { useEffect } from "react";
import { CompareIcon, EyeOffIcon } from "./icons";
import { useStudio } from "./studio-store";

/**
 * What remains when the panels are hidden to look at the room: a small
 * glass bar at the top middle with the way back, and, once a render has
 * come in, the compare button. Escape also brings the panels back.
 */
export function PeekBar() {
  const hidden = useStudio((s) => s.uiHidden);
  const preview = useStudio((s) => s.preview);
  const { setUiHidden, compare } = useStudio.getState();
  useEffect(() => {
    if (!hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUiHidden(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, setUiHidden]);
  if (!hidden) return null;
  const rendered = preview === "done" || preview === "compare";
  return (
    <div className="glass shell-peek" role="toolbar" aria-label="Looking">
      <button
        type="button"
        className="main-icon shell-tip"
        data-tooltip="Show panels"
        aria-label="Show panels"
        onClick={() => setUiHidden(false)}
      >
        <EyeOffIcon />
      </button>
      {rendered && (
        <>
          <span className="main-sep" aria-hidden="true" />
          <button
            type="button"
            className="main-icon shell-tip"
            data-tooltip="Compare before and after"
            aria-label="Compare before and after"
            aria-pressed={preview === "compare"}
            onClick={compare}
          >
            <CompareIcon />
          </button>
        </>
      )}
    </div>
  );
}
