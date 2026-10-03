"use client";

import { useState } from "react";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { ArrowLeftIcon, ExpandIcon, TagIcon } from "./icons";
import { LABEL_MAX } from "./piece-detail";
import { propsOf, useScene, useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * The pieces standing in the room, drawn to plan on the stage until the
 * scene renders them. With Select, a click picks one (and the outliner
 * and shelf follow). With Inspect, a click also raises two actions over
 * it: Details, which shows the piece on its own and opens the Detail
 * tab, and Label, which marks it for Eva (up to five at a time). A piece
 * in focus stands alone on a blank ground with a way back.
 */
const ROOM_W = 6500;
const ROOM_D = 4000;

export function StagePieces() {
  const items = useTopLevel();
  const overrides = useScene((s) => s.overrides);
  const labels = useScene((s) => s.labels);
  const selectedId = useScene((s) => s.selectedId);
  const { select, toggleLabel } = useScene.getState();
  const tool = useStudio((s) => s.tool);
  const focusId = useStudio((s) => s.focusId);
  const { setFocus, setPanelTab } = useStudio.getState();
  const [actionsFor, setActionsFor] = useState<string | null>(null);

  const pieces = items.filter((n) => n.kind === "piece");
  const focus = pieces.find((n) => n.id === focusId) ?? null;
  const shown = focus ? [focus] : pieces;

  const onPick = (n: AssetNode) => {
    if (tool === "inspect") {
      select(n.id, false);
      setActionsFor((cur) => (cur === n.id ? null : n.id));
    } else {
      select(n.id);
      setActionsFor(null);
    }
  };
  const details = (n: AssetNode) => {
    setFocus(n.id);
    setPanelTab("detail");
    setActionsFor(null);
  };

  return (
    <div className="stage-pieces" data-focus={focus !== null}>
      {focus && (
        <button
          type="button"
          className="glass stage-back"
          onClick={() => setFocus(null)}
        >
          <ArrowLeftIcon size={14} />
          Back to the room
        </button>
      )}
      {shown.map((n, i) => {
        const p = propsOf(n, overrides);
        const label = labels.indexOf(n.id);
        const full = !labels.includes(n.id) && labels.length >= LABEL_MAX;
        // laid out three to a row until the scene places them for real
        const style = focus
          ? undefined
          : {
              left: `${7 + (i % 3) * 31}%`,
              top: `${14 + (Math.floor(i / 3) % 2) * 44}%`,
              width: `${(p.width / ROOM_W) * 100}%`,
              height: `${(p.depth / ROOM_D) * 100}%`,
            };
        return (
          <div
            key={n.id}
            className="stage-piece"
            data-selected={selectedId === n.id}
            data-labelled={label >= 0}
            style={style}
          >
            <button
              type="button"
              className="stage-piece-body"
              aria-label={n.name}
              aria-pressed={selectedId === n.id}
              data-colour={p.colour}
              onClick={() => onPick(n)}
            >
              <span className="stage-piece-name">{n.name}</span>
            </button>
            {label >= 0 && (
              <span
                className="stage-piece-tag f-num"
                aria-label={`Label ${label + 1}`}
              >
                {label + 1}
              </span>
            )}
            {actionsFor === n.id && tool === "inspect" && (
              <div
                className="glass stage-actions"
                role="group"
                aria-label={`${n.name} actions`}
              >
                <button
                  type="button"
                  className="stage-action"
                  onClick={() => details(n)}
                >
                  <ExpandIcon size={13} />
                  Details
                </button>
                <button
                  type="button"
                  className="stage-action"
                  aria-pressed={label >= 0}
                  disabled={full}
                  title={
                    full ? `Up to ${LABEL_MAX} labels at a time` : undefined
                  }
                  onClick={() => toggleLabel(n.id)}
                >
                  <TagIcon size={13} />
                  {label >= 0 ? "Unlabel" : "Label"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {focus && (
        <p className="stage-focus-caption">
          {focus.name} · {CATEGORY_NAMES[focus.category]}
        </p>
      )}
    </div>
  );
}
