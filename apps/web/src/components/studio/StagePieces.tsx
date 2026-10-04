"use client";

import { CATEGORY_NAMES } from "./assets-data";
import { ArrowLeftIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { propsOf } from "./scene-store";

/**
 * The pieces standing in the room, drawn to plan on the stage (the 2D
 * view). Each is a button: Select picks it, Inspect raises its actions.
 * A piece in focus stands alone on a blank ground with a way back.
 */
const ROOM_W = 6500;
const ROOM_D = 4000;

/** three to a row until the plan places them for real: left and top as
    fractions of the room */
export const placeInRoom = (i: number) => ({
  left: (7 + (i % 3) * 31) / 100,
  top: (14 + (Math.floor(i / 3) % 2) * 44) / 100,
});

export function StagePieces() {
  const a = usePieceActions();
  return (
    <div className="stage-pieces" data-focus={a.focus !== null}>
      {a.focus && (
        <button
          type="button"
          className="glass stage-back"
          onClick={a.leaveFocus}
        >
          <ArrowLeftIcon size={14} />
          Back to the room
        </button>
      )}
      {a.shown.map((n, i) => {
        const p = propsOf(n, a.overrides);
        const label = a.labelOf(n);
        const at = placeInRoom(i);
        const style = a.focus
          ? undefined
          : {
              left: `${at.left * 100}%`,
              top: `${at.top * 100}%`,
              width: `${(p.width / ROOM_W) * 100}%`,
              height: `${(p.depth / ROOM_D) * 100}%`,
            };
        return (
          <div
            key={n.id}
            className="stage-piece"
            data-selected={a.selectedId === n.id}
            data-labelled={label >= 0}
            style={style}
          >
            <button
              type="button"
              className="stage-piece-body"
              aria-label={n.name}
              aria-pressed={a.selectedId === n.id}
              data-colour={p.colour}
              onClick={() => a.onPick(n)}
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
            {a.actionsFor === n.id && a.tool === "inspect" && (
              <PieceActions
                node={n}
                label={label}
                full={a.labelsFull(n)}
                onDetails={() => a.details(n)}
                onLabel={() => a.toggleLabel(n.id)}
              />
            )}
          </div>
        );
      })}
      {a.focus && (
        <p className="stage-focus-caption">
          {a.focus.name} · {CATEGORY_NAMES[a.focus.category]}
        </p>
      )}
    </div>
  );
}
