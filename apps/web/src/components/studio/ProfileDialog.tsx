"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { syncNow, useSyncState } from "./account-sync";
import { Dialog } from "./Dialog";
import { authClient } from "@/lib/auth-client";

/**
 * The account, from the studio's gear: the name (editable), the email,
 * when the account last took the browser's mirror with Save now, Sign
 * out, the rooms shared by link (open one, take a link down), and the
 * end of the account with its confirmation.
 */
type Share = { id: string; name: string; at: number };
const when = (at: number) =>
  new Date(at).toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function ProfileDialog({
  name,
  email,
  onClose,
}: {
  name: string;
  email: string;
  onClose: () => void;
}) {
  const sync = useSyncState();
  const [draft, setDraft] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  useEffect(() => {
    let live = true;
    void fetch("/api/share")
      .then((r) => (r.ok ? r.json() : { shares: [] }))
      .then((j: { shares: Share[] }) => live && setShares(j.shares))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const unshare = async (id: string) => {
    await fetch(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" });
    setShares((s) => s.filter((x) => x.id !== id));
  };
  const saveName = async () => {
    const t = draft?.trim();
    if (!t) return;
    const r = await authClient.updateUser({ name: t });
    setNote(r.error ? (r.error.message ?? "That did not save.") : "Saved.");
    if (!r.error) setDraft(null);
  };
  const end = async () => {
    const r = await authClient.deleteUser();
    if (r.error) setNote(r.error.message ?? "The account could not go.");
    else onClose();
    setEnding(false);
  };
  return (
    <Dialog title="Account" onClose={onClose} wide>
      <label className="order-field">
        <span className="room-dim-label">Name</span>
        <input
          className="room-dim-input"
          type="text"
          aria-label="Name"
          value={draft ?? name}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <p className="account-text">{email}</p>
      <div className="shell-dialog-acts">
        {note && (
          <span className="account-note" role="status">
            {note}
          </span>
        )}
        <button
          type="button"
          className="main-btn"
          onClick={() => void authClient.signOut().then(onClose)}
        >
          Sign out
        </button>
        <button
          type="button"
          className="main-btn main-btn-primary"
          disabled={draft === null || !draft.trim()}
          onClick={() => void saveName()}
        >
          Save name
        </button>
      </div>
      <h2 className="eva-pref-title">Saved to your account</h2>
      <p className="account-text">
        The studio works in this browser and saves to your account as you go:
        the projects, the orders, the room items you made and what the guide has
        shown, so they are there on every device you sign in on.{" "}
        {sync.state === "syncing"
          ? "Saving now."
          : sync.state === "failed"
            ? "The last save did not go through."
            : sync.at
              ? `Last saved to your account ${when(sync.at)}.`
              : ""}
      </p>
      <div className="shell-dialog-acts">
        <button
          type="button"
          className="main-btn"
          onClick={() => void syncNow()}
        >
          Save now
        </button>
      </div>
      <h2 className="eva-pref-title">Shared rooms</h2>
      {shares.length === 0 ? (
        <p className="assets-empty">
          Nothing shared yet. Export, then Share a link.
        </p>
      ) : (
        <ul className="shell-dialog-list">
          {shares.map((s) => (
            <li key={s.id}>
              <span>
                <span className="account-project">{s.name}</span>
                <small className="account-when">shared {when(s.at)}</small>
              </span>
              <span className="shell-dialog-acts account-row-acts">
                <Link className="main-btn" href={`/s/${s.id}`}>
                  Open
                </Link>
                <button
                  type="button"
                  className="main-btn"
                  aria-label={`Stop sharing ${s.name}`}
                  onClick={() => void unshare(s.id)}
                >
                  Stop sharing
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h2 className="eva-pref-title">Deleting the account</h2>
      <p className="account-text">
        Deleting the account takes what it holds with it: the projects, orders,
        room items and shared links. What is in this browser stays here.{" "}
        <Link href="/privacy">What the studio keeps</Link> says the rest.
      </p>
      <div className="shell-dialog-acts">
        {ending ? (
          <>
            <button
              type="button"
              className="main-btn"
              onClick={() => setEnding(false)}
            >
              Keep it
            </button>
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={() => void end()}
            >
              Delete for good
            </button>
          </>
        ) : (
          <button
            type="button"
            className="main-btn"
            onClick={() => setEnding(true)}
          >
            Delete account
          </button>
        )}
      </div>
    </Dialog>
  );
}
