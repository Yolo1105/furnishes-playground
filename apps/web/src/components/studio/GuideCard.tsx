"use client";

import { useEffect } from "react";
import { CloseIcon, InfoIcon, PencilIcon } from "./icons";
import { GUIDES, useGuide } from "./guide-store";

/**
 * The guide card over the main surface: an info mark and a title, a few
 * lines, a drawing of the thing, and "Don't show next time". The intro
 * opens itself on a first visit; the Guide button in the toolbar and
 * "Show me how" in the Room tab open the others.
 */
export function GuideCard() {
  const open = useGuide((s) => s.open);
  const dismissed = useGuide((s) => s.dismissed);
  const hydrated = useGuide((s) => s.hydrated);
  const { hydrate, show, close, setDismissed } = useGuide.getState();

  // the browser's record is read after mount so the server and client
  // render the same thing; the intro follows once it is known
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useEffect(() => {
    if (hydrated) show("intro");
  }, [hydrated, show]);

  if (!open) return null;
  const g = GUIDES[open];
  return (
    <section
      className="glass guide"
      role="dialog"
      aria-labelledby="guide-title"
      data-guide={g.id}
    >
      <div className="guide-head">
        <InfoIcon size={18} />
        <h2 className="guide-title" id="guide-title">
          {g.title}
        </h2>
        <button
          type="button"
          className="shell-iconbtn guide-close"
          aria-label="Close guide"
          onClick={close}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="guide-body">
        {g.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="guide-art" aria-hidden="true">
        {g.id === "walls" ? <WallsArt /> : <IntroArt />}
      </div>
      <label className="guide-foot">
        <input
          type="checkbox"
          checked={dismissed[g.id] ?? false}
          onChange={(e) => setDismissed(g.id, e.target.checked)}
        />
        Don&apos;t show next time
      </label>
    </section>
  );
}

/** a room being traced: the wall line draws itself round and round */
function WallsArt() {
  return (
    <svg viewBox="0 0 240 150" className="guide-svg">
      <rect
        x="40"
        y="22"
        width="160"
        height="106"
        className="guide-floor"
        rx="2"
      />
      <path
        d="M40 22 H200 V128 H40 Z"
        pathLength={100}
        className="guide-wall-base"
      />
      <path
        d="M40 22 H200 V128 H40 Z"
        pathLength={100}
        className="guide-wall-draw"
      />
      <g className="guide-dim">
        <path d="M52 14 H188" />
        <path d="M28 34 V116" />
        <path d="M212 34 V116" />
        <path d="M52 136 H188" />
      </g>
      <text x="120" y="80" className="guide-label">
        Room
      </text>
      <g className="guide-pencil">
        <PencilIcon size={18} />
      </g>
    </svg>
  );
}

/** the three panes, with the orange where the work happens */
function IntroArt() {
  return (
    <svg viewBox="0 0 240 150" className="guide-svg">
      <rect
        x="14"
        y="16"
        width="52"
        height="118"
        rx="6"
        className="guide-pane"
      />
      <rect
        x="74"
        y="16"
        width="100"
        height="118"
        rx="6"
        className="guide-pane"
      />
      <rect
        x="182"
        y="16"
        width="44"
        height="52"
        rx="6"
        className="guide-pane"
      />
      <rect
        x="182"
        y="76"
        width="44"
        height="58"
        rx="6"
        className="guide-pane"
      />
      <rect
        x="80"
        y="22"
        width="88"
        height="10"
        rx="3"
        className="guide-pane-bar"
      />
      <rect
        x="80"
        y="104"
        width="88"
        height="24"
        rx="3"
        className="guide-pane-bar"
      />
      <rect
        x="20"
        y="24"
        width="40"
        height="6"
        rx="2"
        className="guide-pane-accent"
      />
      <rect
        x="188"
        y="110"
        width="32"
        height="6"
        rx="2"
        className="guide-pane-accent"
      />
      <rect
        x="104"
        y="48"
        width="40"
        height="40"
        rx="3"
        className="guide-pane-room"
      />
    </svg>
  );
}
