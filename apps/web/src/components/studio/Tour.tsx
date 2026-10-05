"use client";

import { useEffect, useState } from "react";
import {
  GUIDES,
  linesFor,
  TOUR_STEPS,
  useGuide,
  type TourSide,
} from "./guide-store";
import { useSession } from "@/lib/auth-client";

/**
 * The tour. Its first step is the welcome, a large card in the middle of
 * the screen. Each step after it draws a focus border on one panel and
 * stands a card beside it to say what the panel does. Next walks on,
 * Back returns, Skip ends it from any step; the last step ends with
 * Done. Ending it marks the tour as seen.
 */
type Box = { top: number; left: number; width: number; height: number };

const CARD_W = 340;
const GAP = 16;

const place = (box: Box, side: TourSide) => {
  switch (side) {
    case "right":
      return { top: box.top + GAP, left: box.left + box.width + GAP };
    case "left":
      return { top: box.top + GAP, left: box.left - CARD_W - GAP };
    case "below":
      return {
        top: box.top + box.height + GAP,
        left: box.left + box.width / 2 - CARD_W / 2,
      };
    case "above":
      return {
        bottom: window.innerHeight - box.top + GAP,
        left: box.left + box.width / 2 - CARD_W / 2,
      };
    default:
      return {
        top: box.top + box.height / 2 - 90,
        left: box.left + box.width / 2 - CARD_W / 2,
      };
  }
};

/** the box of a step's target on screen, or none for the welcome */
const measure = (step: number): Box | null => {
  const target = TOUR_STEPS[step]?.target;
  const el = target ? document.querySelector(target) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

export function Tour() {
  const step = useGuide((s) => s.tour);
  const { tourTo, endTour } = useGuide.getState();
  const [box, setBox] = useState<Box | null>(null);
  const current = step === null ? null : TOUR_STEPS[step]!;
  const { data: session } = useSession();

  // a step is measured as it is chosen (the panels are always there),
  // and again whenever the window is resized
  const go = (n: number) => {
    tourTo(n);
    setBox(measure(n));
  };
  useEffect(() => {
    if (step === null) return;
    const onResize = () => setBox(measure(step));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step]);
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") endTour();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, endTour]);

  if (step === null || !current) return null;
  const last = step === TOUR_STEPS.length - 1;
  const welcome = step === 0;
  const style = welcome
    ? undefined
    : box
      ? { width: CARD_W, ...place(box, current.side) }
      : { width: CARD_W, top: 80, left: 80 };
  return (
    <div className="tour" data-step={current.id}>
      {welcome && <div className="tour-scrim" />}
      {box && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{
            top: box.top - 4,
            left: box.left - 4,
            width: box.width + 8,
            height: box.height + 8,
          }}
        />
      )}
      <section
        className="glass tour-card"
        role="dialog"
        aria-modal={welcome}
        aria-labelledby="tour-title"
        data-welcome={welcome}
        style={style}
      >
        {!welcome && (
          <span className="tour-step f-num">
            {step} of {TOUR_STEPS.length - 1}
          </span>
        )}
        <h2 className="tour-title" id="tour-title">
          {current.title}
        </h2>
        <p className="tour-body">
          {welcome
            ? linesFor(GUIDES.intro, session !== null).join(" ")
            : current.body}
        </p>
        <div className="tour-acts">
          <button type="button" className="tour-skip" onClick={endTour}>
            {last ? "Close" : "Skip"}
          </button>
          <span className="tour-acts-main">
            {!welcome && (
              <button
                type="button"
                className="main-btn"
                onClick={() => go(step - 1)}
              >
                <span>Back</span>
              </button>
            )}
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={() => (last ? endTour() : go(step + 1))}
            >
              <span>{welcome ? "Start the tour" : last ? "Done" : "Next"}</span>
            </button>
          </span>
        </div>
      </section>
    </div>
  );
}
