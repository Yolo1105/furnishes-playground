"use client";

import { useState } from "react";
import { ChevronDownIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { useRoom } from "./room-store";
import { useScene } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * The overlaps, in one card floating at the top left of the stage: a
 * row for each pair of pieces standing over each other, which picks the
 * piece that was moved onto the other, and a Fix that moves the other
 * clear; and before them a row for each room this one stands into,
 * which brings that room to the front, and a Settle that moves this
 * room the shortest way out, a wall apart. Nothing shows while nothing overlaps; the card folds to its
 * count. It rests while rendering or touring, with the panels hidden,
 * and with a piece in focus.
 */
export function ClashCard() {
  const a = usePieceActions();
  const readOnly = useStudio((s) => s.readOnly);
  const resting = useStudio(
    (s) =>
      s.mode === "preview" || s.uiHidden || s.touring || s.focusId !== null,
  );
  const [folded, setFolded] = useState(false);
  const rows = a.issues.filter(
    (i) => i.kind === "overlap" || i.kind === "rooms",
  );
  if (resting || rows.length === 0) return null;
  const n = rows.length;
  return (
    <section
      className="glass clash-card"
      aria-label="Overlaps"
      data-folded={folded}
    >
      <div className="clash-card-head">
        <span className="clash-card-dot" aria-hidden="true" />
        <span className="clash-card-title">
          {n === 1 ? "1 overlap" : `${n} overlaps`}
        </span>
        <button
          type="button"
          className="shell-iconbtn clash-card-fold"
          aria-expanded={!folded}
          aria-label={folded ? "Show the overlaps" : "Fold the overlaps"}
          onClick={() => setFolded((f) => !f)}
        >
          <ChevronDownIcon size={12} rotated={!folded} />
        </button>
      </div>
      {!folded && (
        <ul className="clash-card-list">
          {rows.map((i) => {
            const rooms = i.kind === "rooms";
            return (
              <li
                key={rooms ? `room|${i.roomId}` : `${i.pieceId}|${i.otherId}`}
                className="clash-card-row"
                data-kind={i.kind}
              >
                <button
                  type="button"
                  className="clash-card-pick"
                  onClick={() =>
                    rooms
                      ? useRoom.getState().setActive(i.roomId!)
                      : useScene.getState().select(i.otherId!)
                  }
                >
                  {i.text}
                </button>
                {(rooms || i.fix) && !readOnly && (
                  <button
                    type="button"
                    className="stage-action"
                    aria-label={`${rooms ? "Settle" : "Fix"}: ${i.text}`}
                    onClick={() => a.fix(i)}
                  >
                    {rooms ? "Settle" : "Fix"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
