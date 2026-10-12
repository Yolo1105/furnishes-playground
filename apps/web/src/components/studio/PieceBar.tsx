"use client";

import type { KeyboardEvent, PointerEvent } from "react";
import type { AssetNode } from "./assets-data";
import { CopyIcon, RotateIcon, TrashIcon, WallIcon } from "./icons";
import { normTurn } from "./piece-detail";

/**
 * The picked piece's bar, over it in the plan and in 3D alike: its
 * name, and what can be done with it, each in words. The piece itself
 * is dragged to move it (the bar says so); a quarter turn either way about its
 * middle; its turn in degrees, typed; Against wall, which turns its
 * back to the nearest wall and sets it flush there; Duplicate, beside
 * it; Remove. The keys do the same: R and Shift R, [ and ], the arrows.
 * It took the place of a turn ring and knob nobody read as a turn.
 */
export function PieceBar({
  node,
  rotation,
  onTurnTo,
  onToWall,
  onDuplicate,
  onRemove,
}: {
  node: AssetNode;
  /** the piece's turn, degrees */
  rotation: number;
  onTurnTo: (rotation: number) => void;
  onToWall: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(v) && normTurn(v) !== rotation)
      onTurnTo(v);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commit(e.currentTarget.value);
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.currentTarget.value = String(rotation);
      e.currentTarget.blur();
    }
  };
  // a press on the bar is the bar's: not a pan of the plan under it,
  // nor a turn of the view in 3D
  const own = (e: PointerEvent) => e.stopPropagation();
  return (
    <div
      className="glass piece-bar"
      role="toolbar"
      aria-label={`Arrange ${node.name}`}
      onPointerDown={own}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="piece-bar-name">{node.name}</span>
      <span className="piece-bar-hint">drag to move</span>
      <span className="piece-bar-rule" aria-hidden="true" />
      <button
        type="button"
        className="piece-bar-btn shell-tip"
        data-tooltip="Turn a quarter left (⇧R)"
        aria-label="Turn left"
        onClick={() => onTurnTo(rotation - 90)}
      >
        <span className="piece-bar-flip">
          <RotateIcon size={14} />
        </span>
      </button>
      <label className="piece-bar-deg">
        <input
          // a turn from elsewhere shows here at once
          key={rotation}
          type="number"
          inputMode="numeric"
          step={15}
          defaultValue={rotation}
          aria-label="Turn, degrees"
          onKeyDown={onKey}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
        <span aria-hidden="true">°</span>
      </label>
      <button
        type="button"
        className="piece-bar-btn shell-tip"
        data-tooltip="Turn a quarter right (R)"
        aria-label="Turn right"
        onClick={() => onTurnTo(rotation + 90)}
      >
        <RotateIcon size={14} />
      </button>
      <span className="piece-bar-rule" aria-hidden="true" />
      <button
        type="button"
        className="piece-bar-btn piece-bar-text"
        onClick={onToWall}
      >
        <WallIcon size={14} />
        Against wall
      </button>
      <span className="piece-bar-rule" aria-hidden="true" />
      <button
        type="button"
        className="piece-bar-btn shell-tip"
        data-tooltip="Duplicate"
        aria-label="Duplicate"
        onClick={onDuplicate}
      >
        <CopyIcon size={14} />
      </button>
      <button
        type="button"
        className="piece-bar-btn shell-tip"
        data-tooltip="Remove (⌫)"
        aria-label="Remove"
        onClick={onRemove}
      >
        <TrashIcon size={14} />
      </button>
    </div>
  );
}

/** while a piece is dragged, its distance to the walls in place of the
    bar: across (to the west or east wall) and along (north or south) */
export function GapReadout({
  across,
  along,
}: {
  across: number | null;
  along: number | null;
}) {
  const mm = (v: number) => `${Math.round(v)} mm`;
  return (
    <div className="glass piece-gaps f-num" role="status">
      {across !== null && <span>↔ {mm(across)}</span>}
      {along !== null && <span>↕ {mm(along)}</span>}
      {across === null && along === null && <span>Past the walls</span>}
    </div>
  );
}
