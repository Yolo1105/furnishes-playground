"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { CheckIcon, CompareIcon } from "./icons";
import { useStudio, type WorkStep } from "./studio-store";

/** what each step of a render is called, and what it counts */
const STEP_NAMES: Record<WorkStep, { name: string; counts?: string }> = {
  scene: { name: "Preparing the scene" },
  trace: { name: "Tracing the light", counts: "samples" },
  denoise: { name: "Cleaning the picture" },
  light: { name: "Baking the light into the room", counts: "probes" },
  floor: { name: "Taking the floor's picture" },
  edges: { name: "Resolving the edges" },
  grade: { name: "Grading the view" },
};
/** one line on what the render is, by its kind of work */
const NOTE: Record<"photo" | "render", string> = {
  photo:
    "The light is traced through the room on this device, one sample a frame, then cleaned.",
  render:
    "The room's own light is baked in, its floor pictured and its edges resolved on this device.",
};

/** the steps a render is taking, with the one under way and how far
    it is, while the render generates */
function RenderSteps() {
  const work = useStudio((s) => s.work);
  const loading = useStudio((s) => s.loading);
  const photo = useStudio((s) => s.photo);
  if (!work || (loading !== "render" && loading !== "photo")) return null;
  const size =
    loading === "photo" && photo && photo.width > 0
      ? ` At ${photo.width} × ${photo.height}.`
      : "";
  const now = work.plan.indexOf(work.step);
  return (
    <section
      className="glass render-steps"
      role="status"
      aria-label="Rendering"
    >
      <p className="render-steps-title">Rendering</p>
      <ol className="render-steps-list">
        {work.plan.map((step, i) => {
          const state = i < now ? "done" : i === now ? "now" : "next";
          const { name, counts } = STEP_NAMES[step];
          return (
            <li key={step} className="render-step" data-state={state}>
              <span className="render-step-mark" aria-hidden="true">
                {state === "done" && <CheckIcon size={9} />}
              </span>
              <span>{name}</span>
              {state === "now" && counts && work.of > 0 && (
                <span className="render-step-count f-num">
                  {work.done} of {work.of} {counts}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="render-steps-note">
        {NOTE[loading]}
        {size}
      </p>
    </section>
  );
}

/**
 * Render on the stage, between the rails and behind the panels, over
 * whichever view is up: the 3D room or the plan. Once the line on the
 * toolbar has run, a divider sweeps from the left rail to the right one
 * and the rendered view fills in behind it. With the panels hidden, the
 * compare button in the peek bar brings the divider in from the left to
 * the middle, the view as edited left of it and rendered right, to be
 * dragged. Where the renderer can trace a photo (WebGPU) the picture is
 * the photo on the canvas and the before side a picture of the view as
 * it stood; elsewhere the render is the live view graded (the 3D room
 * with its shadows on and its handles away; the plan as drawn).
 */
export function PreviewStage() {
  const status = useStudio((s) => s.preview);
  const split = useStudio((s) => s.split);
  const photo = useStudio((s) => s.photo);
  const { revealed, setSplit } = useStudio.getState();
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // mounted while generating too, with the divider at the left rail, so
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
    <div className="preview" data-status={status} data-photo={photo !== null}>
      {status === "generating" && <RenderSteps />}
      <div
        ref={stage}
        className="preview-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="preview-before" aria-label="Before">
          {photo && (
            // the canvas holds the photo now: the view as it stood is a
            // picture taken just before, a data URL that no image loader
            // could serve better
            // eslint-disable-next-line @next/next/no-img-element
            <img className="preview-was" src={photo.before} alt="" />
          )}
          <span className="preview-tag">Before</span>
        </div>
        <div
          className="preview-after"
          aria-label="Rendered"
          style={{
            // while revealing the render is left of the line; while
            // comparing it is right of it
            clipPath:
              status === "compare"
                ? `inset(0 0 0 ${split}%)`
                : `inset(0 ${100 - split}% 0 0)`,
          }}
          onTransitionEnd={(e) => {
            if (e.propertyName === "clip-path") revealed();
          }}
        >
          <div className="preview-grade" />
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
