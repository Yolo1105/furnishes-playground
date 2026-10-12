"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { ArrowLeftIcon, LockIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { DRAG_FROM, LONG_PRESS } from "./input";
import { footprint, isRug, isSquare } from "./piece-detail";
import { GapReadout, PieceBar } from "./PieceBar";
import { PlanSymbol } from "./plan-symbols";
import { settle, wallGaps } from "./room-layout";
import { useScene } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * The pieces standing in the room, drawn to plan on the stage (the 2D
 * view), each at its place and size in the room's millimetres. Each is a
 * button: Select picks it, and drags it about the room (snapped, kept
 * inside the walls; one undo step for the whole drag), and shows its
 * distance to the walls while it moves; over a picked piece stands its
 * bar (PieceBar: turns, degrees, Against wall, Duplicate, Remove);
 * Inspect raises its actions. A locked
 * piece shows its lock and stays put. A piece in focus stands alone on
 * a blank ground with a way back. Under a finger, a long press raises
 * the actions, as Inspect's click does. `compact` is the view panel's
 * small plan: the same pieces to pick and drag (the 3D room follows),
 * with no names, tags, bar or actions at that size.
 */
/** a plan name's letters, about, in CSS pixels at the plan's own scale */
const NAME_CHAR_PX = 6.4;

export function StagePieces({
  roomId,
  compact = false,
}: {
  /** the room whose pieces these are; the active one when unset */
  roomId?: string;
  compact?: boolean;
}) {
  const a = usePieceActions(roomId);
  const selectedId = useScene((s) => s.selectedId);
  const { W, D } = a.room;
  const magnet = useStudio((s) => s.magnet);
  // a render is for looking: nothing is dragged while it is up
  const rendering = useStudio((s) => s.mode === "preview");
  // the bar keeps its own size whatever the plan's zoom
  const zoom = useStudio((s) => s.planZoom);
  // the piece in hand, which shows its distance to the walls
  const [dragging, setDragging] = useState<string | null>(null);
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
  // a move or a turn under the pointer lands once a frame, as in 3D: a
  // pointer reports more often than the screen draws
  const nextMove = useRef<(() => void) | null>(null);
  const moveFrame = useRef(0);
  const flushFrame = () => {
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = 0;
    const f = nextMove.current;
    nextMove.current = null;
    f?.();
  };
  const onFrame = (f: () => void) => {
    nextMove.current = f;
    if (!moveFrame.current)
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = 0;
        flushFrame();
      });
  };
  useEffect(() => () => cancelAnimationFrame(moveFrame.current), []);
  const endPress = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>, n: AssetNode) => {
    const p = a.props.get(n.id)!;
    if (e.pointerType === "touch" && !a.focus && !compact) {
      endPress();
      press.current = window.setTimeout(() => {
        press.current = null;
        drag.current = null;
        a.hold(n);
      }, LONG_PRESS);
    }
    if (
      a.tool !== "select" ||
      a.focus ||
      p.locked ||
      rendering ||
      e.button !== 0
    )
      return;
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
      setDragging(n.id);
    }
    const f = footprint(a.props.get(n.id)!);
    // the other pieces on the floor draw it too; a rug is walked on
    const others = a.shown
      .filter((o) => o.id !== n.id && !isRug(o))
      .map((o) => ({
        ...a.spots.get(o.id)!,
        ...footprint(a.props.get(o.id)!),
      }));
    const to = settle(
      { x: d.x0 + dx, y: d.y0 + dy },
      f,
      a.room,
      magnet,
      others,
    );
    onFrame(() => useScene.getState().dragMove(n.id, to.x, to.y));
  };
  const onUp = (n: AssetNode) => {
    endPress();
    const d = drag.current;
    if (!d || d.id !== n.id) return;
    drag.current = null;
    flushFrame();
    if (d.moved) {
      useScene.getState().dragEnd();
      setDragging(null);
    }
  };
  const onClick = (n: AssetNode, x: number, y: number) => {
    // the click after a drag is the drag's end, not a pick
    if (drag.current?.moved) return;
    // a click on the piece already picked reaches the one under it at
    // that spot: a rug under a table under a sofa, each in turn
    if (n.id === selectedId && typeof document !== "undefined") {
      const here = document
        .elementsFromPoint(x, y)
        .filter((el) => el.classList.contains("stage-piece-body"))
        .map((el) => el.getAttribute("aria-label"));
      const names = a.shown.filter((o) => here.includes(o.name));
      if (names.length > 1) {
        const i = names.findIndex((o) => o.id === n.id);
        a.onPick(names[(i + 1) % names.length]!);
        return;
      }
    }
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
        const selected = selectedId === n.id;
        // square to the walls, the piece is its box; on the slant it is
        // its own size, turned about the box's middle
        const slant = !isSquare(p.rotation);
        // a rug lies under the rest; the picked piece stands over its
        // neighbours, so its actions and its turn handle are never under
        // the piece beside it (on a whole flat a piece's least size
        // reaches past its own footprint)
        const zIndex = isRug(n) ? 0 : selected ? 3 : 1;
        const style = a.focus
          ? undefined
          : slant
            ? {
                left: `${((at.x + f.w / 2 - p.width / 2) / W) * 100}%`,
                top: `${((at.y + f.d / 2 - p.depth / 2) / D) * 100}%`,
                width: `${(p.width / W) * 100}%`,
                height: `${(p.depth / D) * 100}%`,
                transform: `rotate(${p.rotation}deg)`,
                zIndex,
              }
            : {
                left: `${(at.x / W) * 100}%`,
                top: `${(at.y / D) * 100}%`,
                width: `${(f.w / W) * 100}%`,
                height: `${(f.d / D) * 100}%`,
                zIndex,
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
              onClick={(e) => onClick(n, e.clientX, e.clientY)}
            >
              <PlanSymbol node={n} props={p} turn={slant ? 0 : p.rotation} />
              {!compact && (a.focus || nameFits(n.name, f.w, f.d)) && (
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
              {p.locked && !compact && (
                <span className="stage-piece-lock" aria-hidden="true">
                  <LockIcon size={11} />
                </span>
              )}
            </button>
            {label >= 0 && !compact && (
              <span
                className="stage-piece-tag f-num"
                aria-label={`Label ${label + 1}`}
              >
                {label + 1}
              </span>
            )}
          </div>
        );
      })}
      {!compact &&
        !a.focus &&
        !rendering &&
        (() => {
          // over the piece, at the screen's own size whatever the plan's
          // zoom: Inspect's actions, or the picked piece's bar, or its
          // distance to the walls while it is dragged
          const id =
            dragging ??
            a.actionsFor ??
            (a.tool === "select" ? selectedId : null);
          const n = a.shown.find((x) => x.id === id);
          if (!n) return null;
          const p = a.props.get(n.id)!;
          const acting = a.actionsFor === n.id && dragging !== n.id;
          if (p.locked && !acting) return null;
          const at = a.spots.get(n.id)!;
          const f = footprint(p);
          return (
            <div
              className="stage-piece-over"
              // under the piece, so it never covers what it acts on
              data-side="below"
              style={{
                left: `${((at.x + f.w / 2) / W) * 100}%`,
                top: `${((at.y + f.d) / D) * 100}%`,
                transform: `scale(${1 / zoom})`,
              }}
            >
              {acting ? (
                <PieceActions
                  node={n}
                  label={a.labelOf(n)}
                  full={a.labelsFull(n)}
                  onDetails={() => a.details(n)}
                  onLabel={() => a.toggleLabel(n.id)}
                />
              ) : dragging === n.id ? (
                <GapReadout {...wallGaps(at, f, a.room.outline)} />
              ) : (
                <PieceBar
                  node={n}
                  rotation={p.rotation}
                  stack={a.stackOf(n)}
                  onPickOther={a.pickById}
                  onTurnTo={(r) => a.turnTo(n, r)}
                  onToWall={a.wallable(n) ? () => a.toWall(n) : null}
                  onDuplicate={() => a.duplicate(n)}
                  onRemove={() => a.remove(n)}
                />
              )}
            </div>
          );
        })()}
      {a.focus && (
        <p className="stage-focus-caption">
          {a.focus.name} · {CATEGORY_NAMES[a.focus.category]}
        </p>
      )}
    </div>
  );
}
