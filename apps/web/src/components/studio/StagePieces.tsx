"use client";

import { CATEGORY_NAMES } from "./assets-data";
import { ArrowLeftIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { layoutRoom } from "./room-layout";
import { useRoom } from "./room-store";
import { propsOf } from "./scene-store";

/**
 * The pieces standing in the room, drawn to plan on the stage (the 2D
 * view), each at its place and size in the room's millimetres. Each is a
 * button: Select picks it, Inspect raises its actions. A piece in focus
 * stands alone on a blank ground with a way back.
 */
export function StagePieces() {
  const a = usePieceActions();
  const W = useRoom((s) => s.width);
  const D = useRoom((s) => s.depth);
  const sizes = a.shown.map((n) => propsOf(n, a.overrides));
  const spots = layoutRoom(sizes, W, D);
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
        const p = sizes[i]!;
        const label = a.labelOf(n);
        const at = spots[i]!;
        const style = a.focus
          ? undefined
          : {
              left: `${(at.x / W) * 100}%`,
              top: `${(at.y / D) * 100}%`,
              width: `${(p.width / W) * 100}%`,
              height: `${(p.depth / D) * 100}%`,
            };
        return (
          <div
            key={n.id}
            className="stage-piece"
            data-kind={n.kind}
            data-category={n.category}
            data-selected={a.selectedId === n.id}
            data-labelled={label >= 0}
            style={style}
          >
            <button
              type="button"
              className="stage-piece-body"
              aria-label={n.name}
              aria-pressed={a.selectedId === n.id}
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
