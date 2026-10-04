"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";

/**
 * The link to a room just shared: shown in full, copied in one press,
 * opened in a new tab, with a word on where to take it down again.
 */
export function ShareDialog({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog title="Share the room" onClose={onClose}>
      <p className="account-text">
        Anyone with this link can look round the room and its pieces, and take a
        copy into a studio of their own. Eva&apos;s conversations stay with you.
        The account page lists what you share and takes a link down.
      </p>
      <label className="order-field">
        <span className="room-dim-label">Link</span>
        <input
          className="room-dim-input f-num"
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      <div className="shell-dialog-acts">
        <a className="main-btn" href={url} target="_blank" rel="noreferrer">
          Open
        </a>
        <button
          type="button"
          className="main-btn main-btn-primary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </Dialog>
  );
}
