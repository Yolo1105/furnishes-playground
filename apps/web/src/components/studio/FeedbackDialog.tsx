"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { SITE } from "@/lib/site";
import { Dialog } from "./Dialog";
import { CheckIcon } from "./icons";
import { useProjects } from "./project-store";

/**
 * A word to the studio, from the gear: a problem, an idea or a question,
 * in a few lines, with an email when not signed in. It goes to the
 * studio's own table (api/help); should that fail, the same words can
 * go by mail.
 */
const KINDS = [
  { id: "problem", label: "Something is wrong" },
  { id: "idea", label: "An idea" },
  { id: "question", label: "A question" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

export function FeedbackDialog({
  email,
  onClose,
}: {
  /** the account's email, when signed in */
  email?: string;
  onClose: () => void;
}) {
  const path = usePathname();
  const projectName = useProjects(
    (s) => s.projects.find((p) => p.id === s.activeId)?.name,
  );
  const [kind, setKind] = useState<Kind>("problem");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const address = email ?? from.trim();
  const ready =
    message.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
  const context = `${path}${projectName ? ` · ${projectName}` : ""}`;
  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: kind,
          message: message.trim(),
          context,
          ...(email ? {} : { email: address }),
        }),
      });
      if (res.ok) setSent(true);
      else
        setFailed(
          res.status === 429
            ? "That is the day's share of messages from here; send it by mail instead."
            : "It did not go through; send it by mail instead.",
        );
    } catch {
      setFailed("The studio could not be reached; send it by mail instead.");
    }
    setBusy(false);
  };
  const mailto = `mailto:${SITE.contact}?subject=${encodeURIComponent(
    `${SITE.name}: ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`,
  )}&body=${encodeURIComponent(`${message.trim()}\n\n(${context})`)}`;
  return (
    <Dialog title="Feedback" onClose={onClose}>
      {sent ? (
        <>
          <p className="order-placed">
            <CheckIcon size={16} />
            Thank you. We read every one.
          </p>
          <div className="shell-dialog-acts">
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={onClose}
            >
              <span>Done</span>
            </button>
          </div>
        </>
      ) : (
        <form
          className="order-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="eva-chips" role="radiogroup" aria-label="What it is">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                className="assets-chip"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <label className="order-field">
            <span className="room-dim-label">
              What happened, or what you would like
            </span>
            <textarea
              className="room-dim-input feedback-text"
              rows={4}
              maxLength={4000}
              value={message}
              aria-label="Message"
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {!email && (
            <label className="order-field">
              <span className="room-dim-label">Your email, for a reply</span>
              <input
                className="room-dim-input"
                type="email"
                autoComplete="email"
                value={from}
                aria-label="Your email"
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
          )}
          <p className="order-note">
            Sent with where you were: {context}.
            {failed && (
              <>
                {" "}
                {failed} <a href={mailto}>Mail {SITE.contact}</a>
              </>
            )}
          </p>
          <div className="shell-dialog-acts">
            <button
              type="submit"
              className="main-btn main-btn-primary"
              disabled={!ready || busy}
              aria-busy={busy}
            >
              <span>{busy ? "Sending…" : "Send"}</span>
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
