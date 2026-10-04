"use client";

import { useRef, type PointerEvent } from "react";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { ArrowLeftIcon, LockIcon, RotateIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { footprint, PLACE_SNAP } from "./piece-detail";
import { clampSnap } from "./room-layout";
import { useScene } from "./scene-store";

/**
 * The pieces standing in the room, drawn to plan on the stage (the 2D
 * view), each at its place and size in the room's millimetres. Each is a
 * button: Select picks it, and drags it about the room (snapped, kept
 * inside the walls; one undo step for the whole drag); the handle on a
 * picked piece turns it a quarter; Inspect raises its actions. A locked
 * piece shows its lock and stays put. A piece in focus stands alone on
 * a blank ground with a way back.
 */
/** a press that travels less than this is a click, not a drag */
const DRAG_FROM = 3;

export function StagePieces() {
  const a = usePieceActions();
  const { W, D } = a.room;
  const drag = useRef<{
    id: string;
    x0: number;
    y0: number;
    px: number;
    py: number;
    mmPerPx: number;
    moved: boolean;
  } | null>(null);

  const onDown = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    const p = a.props.get(n.id)!;
    if (a.tool !== "select" || a.focus || p.locked || e.button !== 0) return;
    const box = e.currentTarget.parentElement?.parentElement;
    if (!box) return;
    const at = a.spots.get(n.id)!;
    drag.current = {
      id: n.id,
      x0: at.x,
      y0: at.y,
      px: e.clientX,
      py: e.clientY,
      mmPerPx: W / box.getBoundingClientRect().width,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    const d = drag.current;
    if (!d || d.id !== n.id) return;
    const dx = (e.clientX - d.px) * d.mmPerPx;
    const dy = (e.clientY - d.py) * d.mmPerPx;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < DRAG_FROM) return;
      d.moved = true;
      useScene.getState().dragStart();
    }
    const f = footprint(a.props.get(n.id)!);
    useScene
      .getState()
      .dragMove(
        n.id,
        clampSnap(d.x0 + dx, f.w, W, PLACE_SNAP),
        clampSnap(d.y0 + dy, f.d, D, PLACE_SNAP),
      );
  };
  const onUp = (n: AssetNode) => {
    const d = drag.current;
    if (!d || d.id !== n.id) return;
    drag.current = null;
    if (d.moved) useScene.getState().dragEnd();
  };
  const onClick = (n: AssetNode) => {
    // the click after a drag is the drag's end, not a pick
    if (drag.current?.moved) return;
    a.onPick(n);
  };

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
      {a.shown.map((n) => {
        const p = a.props.get(n.id)!;
        const f = footprint(p);
        const label = a.labelOf(n);
        const at = a.spots.get(n.id)!;
        const selected = a.selectedId === n.id;
        const style = a.focus
          ? undefined
          : {
              left: `${(at.x / W) * 100}%`,
              top: `${(at.y / D) * 100}%`,
              width: `${(f.w / W) * 100}%`,
              height: `${(f.d / D) * 100}%`,
            };
        return (
          <div
            key={n.id}
            className="stage-piece"
            data-kind={n.kind}
            data-category={n.category}
            data-selected={selected}
            data-labelled={label >= 0}
            data-locked={p.locked}
            data-turn={p.rotation}
            style={style}
          >
            <button
              type="button"
              className="stage-piece-body"
              aria-label={n.name}
              aria-pressed={selected}
              onPointerDown={(e) => onDown(e, n)}
              onPointerMove={(e) => onMove(e, n)}
              onPointerUp={() => onUp(n)}
              onPointerCancel={() => onUp(n)}
              onClick={() => onClick(n)}
            >
              <span className="stage-piece-name">{n.name}</span>
              {p.locked && (
                <span className="stage-piece-lock" aria-hidden="true">
                  <LockIcon size={11} />
                </span>
              )}
            </button>
            {label >= 0 && (
              <span
                className="stage-piece-tag f-num"
                aria-label={`Label ${label + 1}`}
              >
                {label + 1}
              </span>
            )}
            {selected && a.tool === "select" && !a.focus && !p.locked && (
              <button
                type="button"
                className="stage-piece-turn shell-tip"
                data-tooltip="Turn"
                aria-label={`Turn ${n.name}`}
                onClick={() => a.turn(n)}
              >
                <RotateIcon size={12} />
              </button>
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
