"use client";

import { useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { useBoard, shrink, PICTURES_MAX } from "./board-store";
import { useGenerations } from "./generation-store";
import { CloseIcon, StarIcon } from "./icons";

/**
 * The Board, from the gear: the pictures kept with a title and a note
 * (uploaded here, or saved from a room item's tile), and beside them
 * the starred room items. A picture is sized down before it is kept;
 * the board says when it is full.
 */
export function BoardDialog({ onClose }: { onClose: () => void }) {
  const pictures = useBoard((s) => s.pictures);
  const { add, edit, remove } = useBoard.getState();
  // the store's own array, filtered here: a fresh array from the
  // selector would never settle
  const generations = useGenerations((s) => s.generations);
  const starred = generations.filter((g) => g.starred);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f || busy) return;
    setBusy(true);
    const src = await shrink(f);
    setNote(
      src
        ? add({
            src,
            title: f.name.replace(/\.[a-z0-9]+$/i, ""),
            note: "",
            from: "upload",
          })
        : "That file is not a picture the browser can read (JPEG, PNG or WebP).",
    );
    setBusy(false);
    if (file.current) file.current.value = "";
  };
  return (
    <Dialog title="Board" onClose={onClose} wide>
      <div className="board-head">
        <p className="order-note">
          Pictures kept for this project&apos;s sake: a room you like, a wall as
          it is, a piece seen elsewhere. {pictures.length} of {PICTURES_MAX}.
        </p>
        <label className="main-btn main-btn-primary board-upload">
          <span>{busy ? "Keeping…" : "Add a picture"}</span>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Add a picture"
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
      </div>
      {note && (
        <p className="order-note board-note" role="status">
          {note}
        </p>
      )}
      {pictures.length === 0 ? (
        <p className="assets-empty">Nothing on the board yet.</p>
      ) : (
        <ul className="board-grid" aria-label="Pictures on the board">
          {pictures.map((p) => (
            <li key={p.id} className="board-card">
              <div
                className="board-pic"
                role="img"
                aria-label={p.title || "A picture"}
                style={{ backgroundImage: `url("${p.src}")` }}
              />
              <input
                className="room-dim-input board-title"
                value={p.title}
                placeholder="A title"
                aria-label="Title"
                maxLength={80}
                onChange={(e) => edit(p.id, { title: e.target.value })}
              />
              <textarea
                className="room-dim-input board-text"
                value={p.note}
                placeholder="A note: what to keep from it"
                aria-label="Note"
                rows={2}
                maxLength={400}
                onChange={(e) => edit(p.id, { note: e.target.value })}
              />
              <button
                type="button"
                className="add-tile-star add-tile-x board-x"
                aria-label={`Take ${p.title || "the picture"} off the board`}
                onClick={() => remove(p.id)}
              >
                <CloseIcon size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {starred.length > 0 && (
        <>
          <p className="room-dim-label board-sub">
            <StarIcon size={12} /> Starred room items
          </p>
          <ul className="board-strip" aria-label="Starred room items">
            {starred.map((g) => (
              <li key={g.id} className="board-item">
                {g.imageUrl ? (
                  <span
                    className="board-item-pic"
                    role="img"
                    aria-label={g.name}
                    style={{ backgroundImage: `url("${g.imageUrl}")` }}
                  />
                ) : (
                  <span
                    className="board-item-pic board-item-blank"
                    aria-hidden="true"
                  />
                )}
                <span className="add-tile-name">{g.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="shell-dialog-acts">
        <button
          type="button"
          className="main-btn main-btn-primary"
          onClick={onClose}
        >
          <span>Done</span>
        </button>
      </div>
    </Dialog>
  );
}
