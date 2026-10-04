"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { ArrowLeftIcon, LockIcon, RotateIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { DRAG_FROM, LONG_PRESS } from "./input";
import {
  footprint,
  isSquare,
  normTurn,
  PLACE_SNAP,
  ROTATE_SNAP,
} from "./piece-detail";
import { settle } from "./room-layout";
import { useScene } from "./scene-store";

/**
 * The pieces standing in the room, drawn to plan on the stage (the 2D
 * view), each at its place and size in the room's millimetres. Each is a
 * button: Select picks it, and drags it about the room (snapped, kept
 * inside the walls; one undo step for the whole drag); the handle on a
 * picked piece turns it a quarter with a click, or freely with a drag
 * round the piece, snapped to 15 degrees unless Shift is held; Inspect
 * raises its actions. A locked
 * piece shows its lock and stays put. A piece in focus stands alone on
 * a blank ground with a way back. Under a finger, a long press raises
 * the actions, as Inspect's click does.
 */
/** a plan name's letters, about, in CSS pixels at the plan's own scale */
const NAME_CHAR_PX = 6.4;

export function StagePieces() {
  const a = usePieceActions();
  const { W, D } = a.room;
  // the layer's width in pixels, so a name is written only where its
  // whole word fits the footprint; the plan's zoom scales both alike
  const layer = useRef<HTMLDivElement>(null);
  const [layerPx, setLayerPx] = useState(0);
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setLayerPx(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pxPerMm = layerPx / W;
  const nameFits = (name: string, w: number, d: number) =>
    layerPx === 0 ||
    (w * pxPerMm >= name.length * NAME_CHAR_PX + 12 && d * pxPerMm >= 16);
  const drag = useRef<{
    id: string;
    x0: number;
    y0: number;
    px: number;
    py: number;
    mmPerPx: number;
    moved: boolean;
  } | null>(null);
  const press = useRef<number | null>(null);
  /** the turn handle's drag: the angle at the press and the piece's turn */
  const turning = useRef<{
    id: string;
    cx: number;
    cy: number;
    a0: number;
    r0: number;
    moved: boolean;
  } | null>(null);
  const angleTo = (cx: number, cy: number, x: number, y: number) =>
    (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  const onTurnDown = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    if (e.button !== 0) return;
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    turning.current = {
      id: n.id,
      cx,
      cy,
      a0: angleTo(cx, cy, e.clientX, e.clientY),
      r0: a.props.get(n.id)!.rotation,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onTurnMove = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    const t = turning.current;
    if (!t || t.id !== n.id) return;
    const delta = angleTo(t.cx, t.cy, e.clientX, e.clientY) - t.a0;
    if (!t.moved) {
      if (Math.abs(delta) < 4) return;
      t.moved = true;
      useScene.getState().dragStart();
    }
    const raw = t.r0 + delta;
    const snapped = e.shiftKey
      ? raw
      : Math.round(raw / ROTATE_SNAP) * ROTATE_SNAP;
    useScene.getState().turnMove(n.id, normTurn(snapped));
  };
  const onTurnUp = (n: AssetNode) => {
    const t = turning.current;
    if (!t || t.id !== n.id) return;
    turning.current = null;
    if (t.moved) {
      useScene.getState().dragEnd();
      // the click that follows is the drag's end, not a quarter turn
      skipTurnClick.current = true;
    }
  };
  const skipTurnClick = useRef(false);
  const endPress = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    const p = a.props.get(n.id)!;
    if (e.pointerType === "touch" && !a.focus) {
      endPress();
      press.current = window.setTimeout(() => {
        press.current = null;
        drag.current = null;
        a.hold(n);
      }, LONG_PRESS);
    }
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    const d = drag.current;
    if (!d || d.id !== n.id) return;
    const dx = (e.clientX - d.px) * d.mmPerPx;
    const dy = (e.clientY - d.py) * d.mmPerPx;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < DRAG_FROM) return;
      endPress();
      d.moved = true;
      useScene.getState().dragStart();
    }
    const f = footprint(a.props.get(n.id)!);
    useScene
      .getState()
      .dragMove(
        n.id,
        settle(d.x0 + dx, f.w, W, PLACE_SNAP),
        settle(d.y0 + dy, f.d, D, PLACE_SNAP),
      );
  };
  const onUp = (n: AssetNode) => {
    endPress();
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
    <div ref={layer} className="stage-pieces" data-focus={a.focus !== null}>
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
        // square to the walls, the piece is its box; on the slant it is
        // its own size, turned about the box's middle
        const slant = !isSquare(p.rotation);
        const style = a.focus
          ? undefined
          : slant
            ? {
                left: `${((at.x + f.w / 2 - p.width / 2) / W) * 100}%`,
                top: `${((at.y + f.d / 2 - p.depth / 2) / D) * 100}%`,
                width: `${(p.width / W) * 100}%`,
                height: `${(p.depth / D) * 100}%`,
                transform: `rotate(${p.rotation}deg)`,
              }
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
            data-clash={a.clashes.has(n.id)}
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
              {(a.focus || nameFits(n.name, f.w, f.d)) && (
                <span
                  className="stage-piece-name"
                  style={
                    slant
                      ? { transform: `rotate(${-p.rotation}deg)` }
                      : undefined
                  }
                >
                  {n.name}
                </span>
              )}
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
                data-tooltip="Turn: click a quarter, drag freely"
                aria-label={`Turn ${n.name}`}
                onPointerDown={(e) => onTurnDown(e, n)}
                onPointerMove={(e) => onTurnMove(e, n)}
                onPointerUp={() => onTurnUp(n)}
                onPointerCancel={() => onTurnUp(n)}
                onClick={() => {
                  if (skipTurnClick.current) {
                    skipTurnClick.current = false;
                    return;
                  }
                  a.turn(n);
                }}
              >
                <RotateIcon size={12} />
              </button>
            )}
            {a.actionsFor === n.id && (
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
