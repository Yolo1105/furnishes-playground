"use client";

import { useEffect } from "react";
import { CloseIcon, InfoIcon, PencilIcon } from "./icons";
import { GUIDES, linesFor, useGuide } from "./guide-store";
import { useSession } from "@/lib/auth-client";

/**
 * The small guide card over the main surface: an info mark and a title,
 * a few lines, a drawing of the thing, and "Don't show next time". The
 * Room tab's Draw walls and "Show me how" open it. Reading the browser's
 * record here is what starts the tour on a first visit.
 */
export function GuideCard() {
  const open = useGuide((s) => s.open);
  const dismissed = useGuide((s) => s.dismissed);
  const { hydrate, close, setDismissed } = useGuide.getState();
  const { data: session } = useSession();

  // the browser's record is read after mount so the server and client
  // render the same thing
  useEffect(() => {
    hydrate();
  }, [hydrate]);

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
        {linesFor(g, session !== null).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <div className="guide-art" aria-hidden="true">
        <WallsArt />
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
