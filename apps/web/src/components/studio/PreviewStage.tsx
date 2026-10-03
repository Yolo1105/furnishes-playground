"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { CompareIcon } from "./icons";
import { useStudio } from "./studio-store";

/**
 * Preview on the full stage, behind the panels. Once the line on the
 * toolbar has run, a divider sweeps from the right edge to the left and
 * the render fills in behind it, so the sketch is left of the line and
 * the render right; both draw only the room, so the studio's gradient
 * stays behind them. With the panels hidden, the compare button in the
 * peek bar brings the divider back to the middle to be dragged. Nothing
 * renders yet, so the sketch and the render stand in.
 */
export function PreviewStage() {
  const status = useStudio((s) => s.preview);
  const split = useStudio((s) => s.split);
  const { revealed, setSplit } = useStudio.getState();
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // mounted while generating too, with the divider at the right edge, so
  // the sweep has a start to transition from
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
          <div className="preview-room preview-room-sketch" />
          <span className="preview-tag">Before</span>
        </div>
        <div
          className="preview-after"
          aria-label="Rendered"
          style={{ clipPath: `inset(0 0 0 ${split}%)` }}
          onTransitionEnd={(e) => {
            if (e.propertyName === "clip-path") revealed();
          }}
        >
          <div className="preview-room preview-room-render" />
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
      </div>
    </div>
  );
}
