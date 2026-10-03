"use client";

import { useState, type ReactNode } from "react";
import { pieceTotals, sgd } from "./assets-data";
import { ChevronUpDownIcon } from "./icons";
import { useTopLevel } from "./scene-store";

/**
 * What floats over the main surface: a thin toolbar across the top and a
 * shelf of cards along the bottom. Both are glass.
 */

/** Ghost icon buttons in groups, the way a toolbar reads. `leading` and
    `trailing` are the slots the collapsed rails' restore icons dock into. */
export function MainTopBar({
  groups = [4, 3, 2],
  leading,
  trailing,
}: {
  groups?: number[];
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="glass main-top" role="toolbar" aria-label="Tools">
      {leading && <div className="main-top-slot main-top-lead">{leading}</div>}
      {groups.map((n, g) => (
        <div key={g} className="main-top-group">
          {Array.from({ length: n }, (_, i) => (
            <button
              key={i}
              type="button"
              className="main-icon"
              aria-label={`Tool ${g + 1}.${i + 1}`}
            >
              <span className="main-icon-glyph" aria-hidden="true" />
            </button>
          ))}
        </div>
      ))}
      {trailing && (
        <div className="main-top-slot main-top-trail">{trailing}</div>
      )}
    </div>
  );
}

/**
 * The shelf: everything in the room as cards that scroll sideways. A
 * Furnishes piece carries the orange mark and its price; a room item
 * reads muted and says so. The tab at the top-left counts the pieces and
 * sums them; the chevron beside it folds the cards away, leaving only
 * that row along the bottom.
 */
export function MainShelf() {
  const items = useTopLevel();
  const [collapsed, setCollapsed] = useState(false);
  const t = pieceTotals(items);
  return (
    <div
      className="glass main-shelf"
      aria-label="Pieces"
      data-collapsed={collapsed}
    >
      <div className="main-shelf-head">
        <div className="main-shelf-tab">
          <span className="assets-dot" aria-hidden="true" />
          <b className="f-num">{t.pieces} pieces</b>
          <span className="main-shelf-sep" aria-hidden="true">
            ·
          </span>
          <b className="f-num">{sgd(t.total)}</b>
          <span className="main-shelf-more f-num">+ {t.others} room items</span>
        </div>
        <button
          type="button"
          className="shell-iconbtn shell-tip main-shelf-toggle"
          data-tooltip={collapsed ? "Show pieces" : "Hide pieces"}
          aria-label={collapsed ? "Show pieces" : "Hide pieces"}
          aria-expanded={!collapsed}
          // a mouse press must not leave the button focused (and ringed);
          // keyboard users still reach it with Tab
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setCollapsed((v) => !v)}
        >
          <ChevronUpDownIcon up={collapsed} />
        </button>
      </div>
      <div className="main-shelf-body">
        <div className="main-shelf-scroll no-scrollbar">
          {items.map((c) => (
            <article key={c.id} className="shelf-card" data-kind={c.kind}>
              <div className="shelf-card-pic" aria-hidden="true" />
              <div className="shelf-card-row">
                <span className="shelf-card-name">
                  {c.kind === "piece" && (
                    <span className="assets-dot" aria-hidden="true" />
                  )}
                  {c.name}
                </span>
                <span className="shelf-card-price f-num">
                  {c.kind === "piece" && c.price !== undefined
                    ? sgd(c.price)
                    : "Room"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
