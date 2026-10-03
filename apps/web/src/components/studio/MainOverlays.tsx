"use client";

import { useState, type ReactNode } from "react";
import { pieceTotals, sgd } from "./assets-data";
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  CursorIcon,
  ExportIcon,
  HelpIcon,
  MoveIcon,
  NoteIcon,
  PlusIcon,
  RedoIcon,
  RotateIcon,
  RulerIcon,
  ShareIcon,
  UndoIcon,
  WallIcon,
} from "./icons";
import { useGuide } from "./guide-store";
import { useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * What floats over the main surface: a thin toolbar across the top and a
 * shelf of cards along the bottom. Both are glass.
 */

/**
 * The toolbar over the main surface, read left to right the way a studio's
 * is: the mode (Edit or Preview), the tools in the middle (select, move,
 * rotate, measure, add, wall, note), then zoom and the two outward actions
 * (Share, Export) with Export as the one primary button. `leading` and
 * `trailing` are the slots the collapsed rails' restore icons dock into.
 * Preview starts the render run on the main surface and rests the tools;
 * the Guide mark brings the intro back. Share and Export are inert yet.
 */
const TOOLS = [
  ["select", "Select", CursorIcon],
  ["move", "Move", MoveIcon],
  ["rotate", "Rotate", RotateIcon],
  ["measure", "Measure", RulerIcon],
  ["add", "Add piece", PlusIcon],
  ["wall", "Draw wall", WallIcon],
  ["note", "Note", NoteIcon],
] as const;

export function MainTopBar({
  leading,
  trailing,
}: {
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const mode = useStudio((s) => s.mode);
  const tool = useStudio((s) => s.tool);
  const { setMode, setTool } = useStudio.getState();
  const showGuide = useGuide((s) => s.show);
  return (
    <div className="glass main-top" role="toolbar" aria-label="Studio tools">
      <div className="main-top-side main-top-left">
        {leading}
        <div className="main-seg" role="group" aria-label="Mode">
          {(
            [
              ["edit", "Edit"],
              ["preview", "Preview"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="main-seg-btn"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="main-top-group"
        role="group"
        aria-label="Tools"
        data-resting={mode === "preview"}
      >
        {TOOLS.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className="main-icon shell-tip"
            data-tooltip={label}
            aria-label={label}
            aria-pressed={tool === id}
            disabled={mode === "preview"}
            onClick={() => setTool(id)}
          >
            <Icon />
          </button>
        ))}
      </div>

      <div className="main-top-side main-top-right">
        <div className="main-top-group" role="group" aria-label="History">
          <button
            type="button"
            className="main-icon shell-tip"
            data-tooltip="Undo"
            aria-label="Undo"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="main-icon shell-tip"
            data-tooltip="Redo"
            aria-label="Redo"
          >
            <RedoIcon />
          </button>
        </div>
        <button
          type="button"
          className="main-zoom f-num"
          aria-haspopup="menu"
          aria-label="Zoom, 100%"
        >
          100% <ChevronDownIcon size={11} />
        </button>
        <button
          type="button"
          className="main-icon shell-tip"
          data-tooltip="Guide"
          aria-label="Guide"
          onClick={() => showGuide("intro", true)}
        >
          <HelpIcon />
        </button>
        <button type="button" className="main-btn" aria-label="Share">
          <ShareIcon size={14} />
          <span>Share</span>
        </button>
        <button
          type="button"
          className="main-btn main-btn-primary"
          aria-label="Export"
        >
          <ExportIcon size={14} />
          <span>Export</span>
        </button>
        {trailing}
      </div>
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
