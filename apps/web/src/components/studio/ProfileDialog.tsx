"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { syncNow, useSyncState } from "./account-sync";
import { Dialog } from "./Dialog";
import { PASSWORD_MIN } from "@/lib/account-rules";
import { authClient, useSession } from "@/lib/auth-client";

/**
 * The account, from the studio's gear: the name (editable), the email
 * and whether it is confirmed (the link again if not), the password
 * changed with the current one, the devices signed in (each signed out
 * from here), when the account last took the browser's mirror with Save
 * now, Sign out, the rooms shared by link (open one, take a link down),
 * a copy of everything the account holds to download, and the end of
 * the account with its confirmation.
 */
type Device = {
  token: string;
  userAgent?: string | null;
  createdAt: Date | string;
};
/** a device as its browser names itself, in two words */
const deviceOf = (ua: string | null | undefined) => {
  const u = ua ?? "";
  const browser = /Firefox/.test(u)
    ? "Firefox"
    : /Edg\//.test(u)
      ? "Edge"
      : /Chrome/.test(u)
        ? "Chrome"
        : /Safari/.test(u)
          ? "Safari"
          : "A browser";
  const os = /iPhone|iPad/.test(u)
    ? "iOS"
    : /Android/.test(u)
      ? "Android"
      : /Mac/.test(u)
        ? "Mac"
        : /Windows/.test(u)
          ? "Windows"
          : /Linux/.test(u)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
};
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
  const { data: session } = useSession();
  const verified = session?.user.emailVerified ?? false;
  const thisToken = session?.session.token;
  const [draft, setDraft] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passNote, setPassNote] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  useEffect(() => {
    let live = true;
    void authClient
      .listSessions()
      .then((r) => live && r.data && setDevices(r.data as Device[]))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const resend = async () => {
    const r = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/rounded?verified=1",
    });
    setNote(
      r.error
        ? (r.error.message ?? "That did not send.")
        : "The link is on its way.",
    );
  };
  const changePassword = async () => {
    if (next.length < PASSWORD_MIN) {
      setPassNote(`A password needs ${PASSWORD_MIN} characters or more.`);
      return;
    }
    const r = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    if (r.error) setPassNote(r.error.message ?? "That did not work.");
    else {
      setPassNote("Password changed; the other devices are signed out.");
      setCurrent("");
      setNext("");
      setDevices((d) => d.filter((x) => x.token === thisToken));
    }
  };
  const signOutThere = async (token: string) => {
    await authClient.revokeSession({ token });
    setDevices((d) => d.filter((x) => x.token !== token));
  };
  const signOutElsewhere = async () => {
    await authClient.revokeOtherSessions();
    setDevices((d) => d.filter((x) => x.token === thisToken));
  };
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
      <h2 className="eva-pref-title">Email</h2>
      <p className="account-text">
        {verified
          ? `${email} is confirmed.`
          : `${email} is not confirmed yet: the link went by mail when the account was made.`}
      </p>
      {!verified && (
        <div className="shell-dialog-acts">
          <button
            type="button"
            className="main-btn"
            onClick={() => void resend()}
          >
            Send the link again
          </button>
        </div>
      )}
      <h2 className="eva-pref-title">Password</h2>
      <form
        className="order-form"
        onSubmit={(e) => {
          e.preventDefault();
          void changePassword();
        }}
      >
        <div className="order-form-row">
          <label className="order-field">
            <span className="room-dim-label">Current password</span>
            <input
              className="room-dim-input"
              type="password"
              autoComplete="current-password"
              aria-label="Current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label className="order-field">
            <span className="room-dim-label">New password</span>
            <input
              className="room-dim-input"
              type="password"
              autoComplete="new-password"
              aria-label="New password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
        </div>
        <div className="shell-dialog-acts">
          {passNote && (
            <span className="account-note" role="status">
              {passNote}
            </span>
          )}
          <button
            type="submit"
            className="main-btn"
            disabled={!current || !next}
          >
            Change password
          </button>
        </div>
      </form>
      <h2 className="eva-pref-title">Signed-in devices</h2>
      <ul className="shell-dialog-list" aria-label="Signed-in devices">
        {devices.map((d) => (
          <li key={d.token}>
            <span>
              <span className="account-project">{deviceOf(d.userAgent)}</span>
              <small className="account-when">
                since {when(new Date(d.createdAt).getTime())}
                {d.token === thisToken ? " · this device" : ""}
              </small>
            </span>
            {d.token !== thisToken && (
              <button
                type="button"
                className="main-btn"
                onClick={() => void signOutThere(d.token)}
              >
                Sign out there
              </button>
            )}
          </li>
        ))}
      </ul>
      {devices.length > 1 && (
        <div className="shell-dialog-acts">
          <button
            type="button"
            className="main-btn"
            onClick={() => void signOutElsewhere()}
          >
            Sign out everywhere else
          </button>
        </div>
      )}
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
      <h2 className="eva-pref-title">Your data</h2>
      <p className="account-text">
        Everything the account holds, as one file: the mirror of this browser,
        the rooms shared by link, the orders placed and what you wrote to the
        studio.
      </p>
      <div className="shell-dialog-acts">
        <a className="main-btn" href="/api/account/export" download>
          Download my data
        </a>
      </div>
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
