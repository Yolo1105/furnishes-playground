"use client";

import {
  useEffect,
  useRef,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { CompareIcon } from "./icons";
import { useStudio } from "./studio-store";

/**
 * Preview over the main surface. A line runs along the top while the
 * render is being made; then a divider sweeps left to right, trading the
 * sketch for the render; then a button at the top-right brings the
 * divider back to the middle so the two can be dragged against each
 * other. Nothing renders yet, so the line's run is a fixed length.
 */
export function PreviewStage() {
  const status = useStudio((s) => s.preview);
  const split = useStudio((s) => s.split);
  const { advance, compare, setSplit } = useStudio.getState();
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // the sweep starts from 0 one frame after "revealing" sets it to 100,
  // so the clip-path has a start to transition from
  const from = useRef(0);
  useEffect(() => {
    if (status === "revealing") from.current = 0;
  }, [status]);

  if (status === "idle") return null;

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = stage.current!.getBoundingClientRect();
    setSplit(((e.clientX - r.left) / r.width) * 100);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (status !== "compare") return;
    dragging.current = true;
    stage.current!.setPointerCapture(e.pointerId);
    stage.current!.dataset.dragging = "true";
    at(e);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) at(e);
  };
  const onPointerUp = () => {
    dragging.current = false;
    delete stage.current?.dataset.dragging;
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setSplit(split - step);
    else if (e.key === "ArrowRight") setSplit(split + step);
    else if (e.key === "Home") setSplit(0);
    else if (e.key === "End") setSplit(100);
    else return;
    e.preventDefault();
  };

  return (
    <>
      {status === "generating" && (
        <div
          className="preview-progress"
          role="progressbar"
          aria-label="Rendering preview"
          onAnimationEnd={advance}
        />
      )}
      <div className="preview" data-status={status}>
        <div
          ref={stage}
          className="preview-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="preview-before" aria-label="Before">
            <span className="preview-tag">Before</span>
          </div>
          <div
            className="preview-after"
            aria-label="Rendered"
            style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
            onTransitionEnd={(e) => {
              if (status === "revealing" && e.propertyName === "clip-path")
                advance();
            }}
          >
            <span className="preview-tag preview-tag-after">Rendered</span>
          </div>
          <div className="preview-divider" style={{ left: `${split}%` }}>
            <button
              type="button"
              className="preview-handle"
              role="slider"
              aria-label="Before and after"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              tabIndex={status === "compare" ? 0 : -1}
              onKeyDown={onKey}
            >
              <CompareIcon size={16} />
            </button>
          </div>
          {(status === "done" || status === "compare") && (
            <button
              type="button"
              className="glass shell-iconbtn shell-tip preview-compare"
              data-tooltip="Compare before and after"
              aria-label="Compare before and after"
              aria-pressed={status === "compare"}
              onClick={compare}
            >
              <CompareIcon />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
