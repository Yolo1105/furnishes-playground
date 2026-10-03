"use client";

import { pieceTotals, sgd } from "./assets-data";
import { useEva } from "./eva-store";
import { LightbulbIcon } from "./icons";
import { metres, ROOM_NAMES } from "./room-data";
import { useRoom } from "./room-store";
import { LABEL_MAX } from "./piece-detail";
import { useScene, useTopLevel } from "./scene-store";
import { TagIcon } from "./icons";

/** What Eva can be asked first; each goes into the input box, to send
    as is or to edit. */
const PROMPTS = [
  "Plan this room around the sofa and the window",
  "Suggest storage for this wall under S$1,500",
  "What fits along a 3 m wall?",
  "Match the pieces to my wall tone",
];

/**
 * The Agent tab before a conversation: Eva says hello and what she has
 * read from the room, then offers a few places to start. The messages
 * themselves arrive when the chat is wired.
 */
export function AgentTab() {
  const room = useRoom();
  const items = useTopLevel();
  const labels = useScene((s) => s.labels);
  const setDraft = useEva((s) => s.setDraft);
  const t = pieceTotals(items);
  const labelled = labels
    .map((id) => items.find((n) => n.id === id))
    .filter((n) => n !== undefined);
  return (
    <div className="agent">
      <div className="agent-msg">
        <span className="agent-who">
          <span className="chat-eva-dot" aria-hidden="true" />
          Eva
        </span>
        <p>
          Hi, I&apos;m Eva. I plan rooms with Furnishes pieces: tell me how the
          room is used and I&apos;ll lay it out, price it and keep to what fits.
        </p>
      </div>
      <dl className="agent-context" aria-label="What Eva has read">
        <div>
          <dt>Room</dt>
          <dd>
            {ROOM_NAMES[room.room]} · {room.flat} HDB
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd className="f-num">
            {metres(room.width)} × {metres(room.depth)} · {metres(room.height)}{" "}
            high
          </dd>
        </div>
        <div>
          <dt>In the room</dt>
          <dd className="f-num">
            {t.pieces} pieces · {sgd(t.total)}
          </dd>
        </div>
      </dl>
      {labelled.length > 0 && (
        <>
          <p className="agent-lead">
            <TagIcon size={14} />
            Labelled, {labelled.length} of {LABEL_MAX}
          </p>
          <div className="agent-labels" aria-label="Labelled pieces">
            {labelled.map((n, i) => (
              <button
                key={n.id}
                type="button"
                className="assets-chip agent-label"
                onClick={() => setDraft(`About ${i + 1} (${n.name}): `)}
              >
                <span className="agent-label-n f-num">{i + 1}</span>
                {n.name}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="agent-lead">
        <LightbulbIcon size={14} />
        Start with one of these
      </p>
      <div className="agent-prompts">
        {PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            className="agent-prompt"
            onClick={() => setDraft(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
