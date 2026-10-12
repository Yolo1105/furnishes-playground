"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { AssetNode } from "./assets-data";
import {
  ChevronDownIcon,
  CopyIcon,
  RotateIcon,
  TrashIcon,
  WallIcon,
} from "./icons";
import { normTurn } from "./piece-detail";

/**
 * The picked piece's bar, under the piece's outline in the plan and in
 * 3D alike (above it where there is no room below), so it never covers
 * what it acts on. It carries:
 *   - the piece's name; where other pieces stand over or under it (a
 *     rug under a table under a sofa), the name opens a list of them to
 *     pick the one wanted;
 *   - a quarter turn either way about its middle, the turn in degrees
 *     between them as words, which a click makes a field to type in;
 *   - To wall, its back to the nearest wall and flush there, for a
 *     piece that stands against a wall (not a rug, a plant, a lamp);
 *   - Duplicate, beside it, and Remove.
 * The piece itself is dragged to move it. The keys do the same: R and
 * Shift R, [ and ], the arrows.
 */
export function PieceBar({
  node,
  rotation,
  stack,
  onPickOther,
  onTurnTo,
  onToWall,
  onDuplicate,
  onRemove,
}: {
  node: AssetNode;
  /** the piece's turn, degrees */
  rotation: number;
  /** the other pieces standing over or under this one, lowest first */
  stack: readonly { id: string; name: string }[];
  onPickOther: (id: string) => void;
  onTurnTo: (rotation: number) => void;
  /** null for a piece that does not stand against a wall */
  onToWall: (() => void) | null;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [listing, setListing] = useState(false);
  const commit = (raw: string) => {
    setTyping(false);
    const v = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(v) && normTurn(v) !== rotation)
      onTurnTo(v);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit(e.currentTarget.value);
    else if (e.key === "Escape") setTyping(false);
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
      {stack.length > 0 ? (
        <span className="piece-bar-stack">
          <button
            type="button"
            className="piece-bar-btn piece-bar-name"
            aria-haspopup="menu"
            aria-expanded={listing}
            aria-label={`${node.name}: pick another piece here`}
            onClick={() => setListing(!listing)}
          >
            {node.name}
            <ChevronDownIcon size={12} />
          </button>
          {listing && (
            <span
              className="glass piece-bar-menu"
              role="menu"
              aria-label="Pieces here"
            >
              {stack.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="menuitem"
                  className="piece-bar-menu-item"
                  onClick={() => {
                    setListing(false);
                    onPickOther(s.id);
                  }}
                >
                  {s.name}
                </button>
              ))}
            </span>
          )}
        </span>
      ) : (
        <span className="piece-bar-name">{node.name}</span>
      )}
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
      {typing ? (
        <label className="piece-bar-deg">
          <input
            type="number"
            inputMode="numeric"
            step={15}
            defaultValue={rotation}
            aria-label="Turn, degrees"
            // the field opens on a click that asks to type in it
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={onKey}
            onBlur={(e) => commit(e.currentTarget.value)}
          />
          <span aria-hidden="true">°</span>
        </label>
      ) : (
        <button
          type="button"
          className="piece-bar-btn piece-bar-angle f-num shell-tip"
          data-tooltip="Type an angle"
          aria-label={`Turned ${rotation} degrees; type an angle`}
          onClick={() => setTyping(true)}
        >
          {rotation}°
        </button>
      )}
      <button
        type="button"
        className="piece-bar-btn shell-tip"
        data-tooltip="Turn a quarter right (R)"
        aria-label="Turn right"
        onClick={() => onTurnTo(rotation + 90)}
      >
        <RotateIcon size={14} />
      </button>
      {onToWall && (
        <>
          <span className="piece-bar-rule" aria-hidden="true" />
          <button
            type="button"
            className="piece-bar-btn piece-bar-text shell-tip"
            data-tooltip="Back to the nearest wall, flush"
            onClick={onToWall}
          >
            <WallIcon size={14} />
            To wall
          </button>
        </>
      )}
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
        aria-label="Remove from the room"
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
