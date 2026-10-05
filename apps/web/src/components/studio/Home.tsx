"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { syncNow, useAccountSync, useSyncState } from "./account-sync";
import { sgd } from "./assets-data";
import { useGenerationsSync } from "./generation-store";
import { activityOf, ago, cartOf, type Share } from "./home-data";
import { HomeSignIn } from "./HomeSignIn";
import { OrderList } from "./OrderList";
import { STATUS_NAMES, useOrders, useOrdersSync } from "./order-store";
import { useProjects, useProjectSync } from "./project-store";
import { authClient, useSession } from "@/lib/auth-client";

/**
 * The home page, where the site opens: a rail and a stage. Signed out,
 * the stage is the way in (HomeSignIn). Signed in, it is the account's
 * workbench: a dashboard of doors (the studio, the account, projects,
 * orders, shared rooms, the cart) and the recent activity, and the
 * rail's views: Projects with a way into each, Orders, Shared rooms,
 * and Settings (the name, the mirror, signing out, the end of the
 * account). `from` says which studio the doors open, the square or the
 * rounded one; `view` opens a view directly.
 */
type View = "dashboard" | "projects" | "orders" | "shared" | "settings";
const LABEL: Record<View, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  orders: "Orders",
  shared: "Shared rooms",
  settings: "Settings",
};
const NAV: { head: string; items: View[] }[] = [
  { head: "Overview", items: ["dashboard"] },
  { head: "Design work", items: ["projects", "shared"] },
  { head: "Orders & account", items: ["orders", "settings"] },
];
const isView = (v: string | null): v is View => v !== null && v in LABEL;

const when = (at: number) =>
  new Date(at).toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Home() {
  const params = useSearchParams();
  const studio = params.get("from") === "studio" ? "/studio" : "/rounded";
  const asked = params.get("view");
  const { data: session, isPending } = useSession();
  useProjectSync();
  useOrdersSync();
  useGenerationsSync();
  const userId = session?.user.id ?? null;
  useAccountSync(userId);
  // the view picked, for the session that picked it: a new session (the
  // same person back in, or nobody) starts on the dashboard again, or on
  // the view the address asks for
  const sessionId = session?.session.id ?? null;
  const [picked, setPicked] = useState<{ of: string | null; view: View }>();
  const view =
    picked && picked.of === sessionId
      ? picked.view
      : isView(asked)
        ? asked
        : "dashboard";
  const setView = (v: View) => setPicked({ of: sessionId, view: v });
  // the rooms shared by link, from the account
  const [shares, setShares] = useState<Share[]>([]);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void fetch("/api/share")
      .then((r) => (r.ok ? r.json() : { shares: [] }))
      .then((j: { shares: Share[] }) => live && setShares(j.shares))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId]);
  const shown = userId ? shares : [];
  const unshare = async (id: string) => {
    await fetch(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" });
    setShares((s) => s.filter((x) => x.id !== id));
  };
  const name = session?.user.name ?? "Guest";

  return (
    <div className="home">
      <aside className="home-rail" aria-label="Account">
        <div className="home-brand">
          FURNISHES <b>「</b>STUDIO<b>」</b>
        </div>
        <div className="home-scroll">
          <div className="home-group">
            <p className="home-group-h">Workspace</p>
            <nav className="home-modes" aria-label="Workspace">
              <Link className="home-mode" href={studio}>
                <span>Studio</span>
                <span className="home-ix">[01]</span>
              </Link>
              <span className="home-mode" aria-current="page">
                <span>Account</span>
                <span className="home-ix">[02]</span>
              </span>
            </nav>
          </div>
          {session &&
            NAV.map((g) => (
              <div key={g.head} className="home-group">
                <p className="home-group-h">{g.head}</p>
                <ul className="home-nav">
                  {g.items.map((v) => (
                    <li key={v}>
                      <button
                        type="button"
                        aria-current={view === v ? "page" : undefined}
                        onClick={() => setView(v)}
                      >
                        <span>{LABEL[v]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
        <div className="home-foot">
          <span className="home-rule" aria-hidden="true" />
          <h2 className="home-tagline">
            A design studio where rooms move off-template
          </h2>
          <p className="home-credit">© 2026, Furnishes Studio</p>
          <div className="home-who">
            <span className="home-av" aria-hidden="true">
              {initialsOf(name)}
            </span>
            <span className="home-who-name">{name}</span>
          </div>
        </div>
      </aside>
      <section className="home-stage">
        {isPending ? (
          <p className="home-eye home-wait">One moment.</p>
        ) : !session ? (
          <HomeSignIn studio={studio} />
        ) : view === "dashboard" ? (
          <Dashboard
            name={session.user.name}
            studio={studio}
            shares={shown}
            go={setView}
          />
        ) : view === "projects" ? (
          <ProjectsView studio={studio} />
        ) : view === "orders" ? (
          <Head
            eye="Orders & account"
            title="Orders"
            sub="Every order placed from the studio, newest first, with where it stands."
          >
            <OrderList />
          </Head>
        ) : view === "shared" ? (
          <SharedView shares={shown} onUnshare={unshare} />
        ) : (
          <SettingsView name={session.user.name} email={session.user.email} />
        )}
      </section>
    </div>
  );
}

/** a view's head: the eyebrow, the title, a line under it, then the body */
function Head({
  eye,
  title,
  sub,
  children,
}: {
  eye: string;
  title: string;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="home-canvas">
      <header className="home-head">
        <p className="home-eye">{eye}</p>
        <h1 className="home-title">{title}</h1>
        <p className="home-sub">{sub}</p>
      </header>
      {children}
    </div>
  );
}

function Dashboard({
  name,
  studio,
  shares,
  go,
}: {
  name: string;
  studio: string;
  shares: Share[];
  go: (v: View) => void;
}) {
  const projects = useProjects((s) => s.projects);
  const activeId = useProjects((s) => s.activeId);
  const orders = useOrders((s) => s.orders);
  const sync = useSyncState();
  const active = projects.find((p) => p.id === activeId) ?? projects[0];
  const cart = cartOf(active);
  const latest = orders[0];
  const activity = activityOf(projects, orders, shares);
  const first = name.split(/\s+/)[0] ?? name;
  return (
    <div className="home-canvas">
      <header className="home-dash-head">
        <h1 className="home-hi">
          Welcome back, <em>{first}</em>.
        </h1>
        <p className="home-status">
          <b>{projects.length}</b>{" "}
          {projects.length === 1 ? "project" : "projects"} ·{" "}
          <b>{orders.length}</b> {orders.length === 1 ? "order" : "orders"}
          {sync.at ? (
            <>
              {" "}
              · saved to your account <b>{ago(sync.at)}</b>
            </>
          ) : null}
        </p>
      </header>
      <div className="home-ledger">
        <section
          className="home-row-grid home-row-feature"
          aria-label="The studio and the account"
        >
          {active ? (
            <Link
              className="home-door home-door-feat"
              href={`${studio}?project=${encodeURIComponent(active.id)}`}
            >
              <span className="home-band">Studio</span>
              <span className="home-feat-title">{active.name}</span>
              <span className="home-feat-sub">
                {active.at ? `Changed ${ago(active.at)}.` : "Not changed yet."}{" "}
                {cart.n > 0
                  ? `${cart.n} ${cart.n === 1 ? "piece" : "pieces"} in the cart, ${sgd(cart.total)}.`
                  : "Nothing in the cart yet."}
              </span>
              <span className="home-door-go">Open the studio →</span>
            </Link>
          ) : (
            <Link className="home-door home-door-feat" href={studio}>
              <span className="home-band">Studio</span>
              <span className="home-feat-title">A first room</span>
              <span className="home-door-go">Open the studio →</span>
            </Link>
          )}
          <button
            type="button"
            className="home-door home-door-feat"
            onClick={() => go("settings")}
          >
            <span className="home-band">Account</span>
            <span className="home-feat-title">{name}</span>
            <span className="home-feat-sub">
              {sync.state === "syncing"
                ? "Saving to your account now."
                : sync.state === "failed"
                  ? "The last save did not go through."
                  : sync.at
                    ? `Last saved to your account ${when(sync.at)}.`
                    : "The account takes this browser's work as you go."}
            </span>
            <span className="home-door-go">Settings →</span>
          </button>
        </section>
        <section className="home-row-grid home-row-work" aria-label="Your work">
          <button
            type="button"
            className="home-door"
            onClick={() => go("projects")}
          >
            <span className="home-door-top">
              <span className="home-door-name">Projects</span>
              <span className="home-door-count f-num">{projects.length}</span>
            </span>
            <span className="home-door-meta">
              {active?.at ? `changed ${ago(active.at)}` : "a room each"}
            </span>
            <span className="home-door-prev">
              {projects.map((p) => p.name).join(" · ")}
            </span>
          </button>
          <button
            type="button"
            className="home-door"
            onClick={() => go("orders")}
          >
            <span className="home-door-top">
              <span className="home-door-name">Orders</span>
              <span className="home-door-count f-num">{orders.length}</span>
            </span>
            <span className="home-door-meta">
              {latest ? STATUS_NAMES[latest.status] : "none yet"}
            </span>
            <span className="home-door-prev">
              {latest
                ? `${latest.lines.map((l) => l.name).join(", ")} · ${sgd(latest.total)}`
                : "Checkout on the studio's shelf places one."}
            </span>
          </button>
          <button
            type="button"
            className="home-door"
            onClick={() => go("shared")}
          >
            <span className="home-door-top">
              <span className="home-door-name">Shared rooms</span>
              <span className="home-door-count f-num">{shares.length}</span>
            </span>
            <span className="home-door-meta">
              {shares.length ? `last ${ago(shares[0]!.at)}` : "none yet"}
            </span>
            <span className="home-door-prev">
              {shares.length
                ? shares.map((s) => s.name).join(" · ")
                : "Export, then Share a link, in the studio."}
            </span>
          </button>
          <Link className="home-door" href={studio}>
            <span className="home-door-top">
              <span className="home-door-name">Cart</span>
              <span className="home-door-count f-num">{cart.n}</span>
            </span>
            <span className="home-door-meta">
              {cart.n ? sgd(cart.total) : "empty"}
            </span>
            <span className="home-door-prev">
              {cart.n
                ? `In ${active?.name ?? "the room"}; checkout is on the shelf.`
                : "Pieces saved on the shelf go to the cart from there."}
            </span>
          </Link>
        </section>
      </div>
      <div className="home-act">
        <p className="home-band">Recent activity</p>
        {activity.length === 0 ? (
          <p className="home-sub">
            Nothing yet. The studio is where it starts.
          </p>
        ) : (
          <ul className="home-act-list">
            {activity.map((a, i) => (
              <li key={i}>
                {a.text}
                <span className="home-act-d">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProjectsView({ studio }: { studio: string }) {
  const projects = useProjects((s) => s.projects);
  return (
    <Head
      eye="Design work"
      title="Projects"
      sub="A room each, with its pieces and Eva's side; the studio opens on whichever you pick."
    >
      <ul className="home-list">
        {projects.map((p) => (
          <li key={p.id} className="home-row">
            <span className="home-row-v">
              <span className="home-row-name">{p.name}</span>
              <span className="home-row-when">
                {p.at ? `changed ${when(p.at)}` : "not changed yet"}
              </span>
            </span>
            <Link
              className="home-btn"
              href={`${studio}?project=${encodeURIComponent(p.id)}`}
              aria-label={`Open ${p.name}`}
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
    </Head>
  );
}

function SharedView({
  shares,
  onUnshare,
}: {
  shares: Share[];
  onUnshare: (id: string) => void;
}) {
  return (
    <Head
      eye="Design work"
      title="Shared rooms"
      sub="Rooms shared by link from the studio: anyone with the link sees the room in 3D, read-only, until the link is taken down."
    >
      {shares.length === 0 ? (
        <p className="home-sub">
          Nothing shared yet. Export, then Share a link, in the studio.
        </p>
      ) : (
        <ul className="home-list">
          {shares.map((s) => (
            <li key={s.id} className="home-row">
              <span className="home-row-v">
                <span className="home-row-name">{s.name}</span>
                <span className="home-row-when">shared {when(s.at)}</span>
              </span>
              <Link className="home-btn" href={`/s/${s.id}`}>
                Open
              </Link>
              <button
                type="button"
                className="home-btn"
                aria-label={`Stop sharing ${s.name}`}
                onClick={() => onUnshare(s.id)}
              >
                Stop sharing
              </button>
            </li>
          ))}
        </ul>
      )}
    </Head>
  );
}

function SettingsView({ name, email }: { name: string; email: string }) {
  const sync = useSyncState();
  const [draft, setDraft] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
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
    setEnding(false);
  };
  return (
    <Head
      eye="Orders & account"
      title="Settings"
      sub="Your name and email, the mirror the account keeps of this browser, the session, and the end of the account."
    >
      <div className="home-rows home-rows-wide">
        <div className="home-row">
          <span className="home-row-l">Name</span>
          <input
            className="home-input"
            type="text"
            aria-label="Name"
            value={draft ?? name}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="home-btn"
            disabled={draft === null || !draft.trim()}
            onClick={() => void saveName()}
          >
            Save name
          </button>
        </div>
        <div className="home-row">
          <span className="home-row-l">Email</span>
          <span className="home-row-v">{email}</span>
        </div>
        <div className="home-row">
          <span className="home-row-l">Saved to your account</span>
          <span className="home-row-v">
            The studio works in this browser and saves to your account as you
            go: the projects, the orders, the room items you made and what the
            guide has shown.{" "}
            {sync.state === "syncing"
              ? "Saving now."
              : sync.state === "failed"
                ? "The last save did not go through."
                : sync.at
                  ? `Last saved to your account ${when(sync.at)}.`
                  : ""}
          </span>
          <button
            type="button"
            className="home-btn"
            onClick={() => void syncNow()}
          >
            Save now
          </button>
        </div>
        <div className="home-row">
          <span className="home-row-l">Session</span>
          <span className="home-row-v">Signed in on this browser.</span>
          <button
            type="button"
            className="home-btn"
            onClick={() => void authClient.signOut()}
          >
            Sign out
          </button>
        </div>
        <div className="home-row">
          <span className="home-row-l">Delete account</span>
          <span className="home-row-v">
            Deleting the account takes what it holds with it: the projects,
            orders, room items and shared links. What is in this browser stays
            here.
          </span>
          {ending ? (
            <span className="home-acts">
              <button
                type="button"
                className="home-btn"
                onClick={() => setEnding(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="home-btn home-btn-primary"
                onClick={() => void end()}
              >
                Delete for good
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="home-btn"
              onClick={() => setEnding(true)}
            >
              Delete account
            </button>
          )}
        </div>
      </div>
      {note && (
        <p className="home-note" role="status">
          {note}
        </p>
      )}
    </Head>
  );
}
