"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AccountDialog } from "./AccountDialog";
import { syncNow, useAccountSync, useSyncState } from "./account-sync";
import { useGenerationsSync } from "./generation-store";
import { ArrowLeftIcon } from "./icons";
import { OrderList } from "./OrderList";
import { useOrdersSync } from "./order-store";
import { useProjects, useProjectSync } from "./project-store";
import { authClient, useSession } from "@/lib/auth-client";

/**
 * The account, as a page of its own: who is signed in and their name,
 * when the account last took the browser's mirror, the projects with a
 * way back into each, the orders, and the end of the account. Without
 * a session it offers to sign in. `from` says which studio to go back
 * to, the square or the rounded one.
 */
const when = (at: number) =>
  new Date(at).toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function AccountPage() {
  const { data: session, isPending } = useSession();
  const from = useSearchParams().get("from") === "rounded" ? "/rounded" : "/";
  useProjectSync();
  useOrdersSync();
  useGenerationsSync();
  useAccountSync(session?.user.id ?? null);
  const projects = useProjects((s) => s.projects);
  const sync = useSyncState();
  const [signIn, setSignIn] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const saveName = async () => {
    const t = name?.trim();
    if (!t) return;
    const r = await authClient.updateUser({ name: t });
    setNote(r.error ? (r.error.message ?? "That did not save.") : "Saved.");
    if (!r.error) setName(null);
  };
  const end = async () => {
    const r = await authClient.deleteUser();
    if (r.error) setNote(r.error.message ?? "The account could not go.");
    setEnding(false);
  };

  return (
    <main className="account-page">
      <header className="account-head">
        <h1 className="shell-dialog-title">Account</h1>
        <Link href={from} className="main-btn">
          <ArrowLeftIcon size={14} />
          <span>Back to the studio</span>
        </Link>
      </header>
      {!session ? (
        <section className="glass account-card">
          {isPending ? (
            <p className="assets-empty">One moment.</p>
          ) : (
            <>
              <p className="account-text">
                Sign in to keep your projects, orders and room items with you on
                every device. Without an account they stay in this browser.
              </p>
              <div className="shell-dialog-acts">
                <button
                  type="button"
                  className="main-btn main-btn-primary"
                  onClick={() => setSignIn(true)}
                >
                  Sign in
                </button>
              </div>
            </>
          )}
          {signIn && <AccountDialog onClose={() => setSignIn(false)} />}
        </section>
      ) : (
        <>
          <section className="glass account-card">
            <h2 className="eva-pref-title">You</h2>
            <label className="order-field">
              <span className="room-dim-label">Name</span>
              <input
                className="room-dim-input"
                type="text"
                value={name ?? session.user.name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Name"
              />
            </label>
            <p className="account-text">{session.user.email}</p>
            <div className="shell-dialog-acts">
              {note && (
                <span className="account-note" role="status">
                  {note}
                </span>
              )}
              <button
                type="button"
                className="main-btn"
                onClick={() => void authClient.signOut()}
              >
                Sign out
              </button>
              <button
                type="button"
                className="main-btn main-btn-primary"
                disabled={name === null || !name.trim()}
                onClick={() => void saveName()}
              >
                Save name
              </button>
            </div>
          </section>
          <section className="glass account-card">
            <h2 className="eva-pref-title">On every device</h2>
            <p className="account-text">
              The studio works in this browser and mirrors to your account: the
              projects, the orders, the room items you made and what the guide
              has shown.{" "}
              {sync.state === "syncing"
                ? "Mirroring now."
                : sync.state === "failed"
                  ? "The last mirror did not go through."
                  : sync.at
                    ? `Last mirrored ${when(sync.at)}.`
                    : ""}
            </p>
            <div className="shell-dialog-acts">
              <button
                type="button"
                className="main-btn"
                onClick={() => void syncNow()}
              >
                Mirror now
              </button>
            </div>
          </section>
          <section className="glass account-card">
            <h2 className="eva-pref-title">Projects</h2>
            <ul className="shell-dialog-list">
              {projects.map((p) => (
                <li key={p.id}>
                  <span>
                    <span className="account-project">{p.name}</span>
                    <small className="account-when">
                      {p.at ? `changed ${when(p.at)}` : "not yet changed"}
                    </small>
                  </span>
                  <Link
                    className="main-btn"
                    href={`${from}?project=${encodeURIComponent(p.id)}`}
                    aria-label={`Open ${p.name}`}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="glass account-card">
            <h2 className="eva-pref-title">Orders</h2>
            <OrderList />
          </section>
          <section className="glass account-card">
            <h2 className="eva-pref-title">The end of the account</h2>
            <p className="account-text">
              Deleting the account takes its mirror with it: the projects,
              orders and room items it holds. What is in this browser stays
              here.
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
          </section>
        </>
      )}
    </main>
  );
}
