"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sgd } from "./assets-data";
import { importProject, showSnapshot, type Snapshot } from "./project-store";
import Scene3D from "./Scene3D";
import { propsOf, useScene, useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * A shared room, read-only: its name, the 3D room to look round (a
 * click picks a piece, nothing moves), the pieces with their prices,
 * and two ways on: into a studio of one's own as a new project, or to
 * the studio's front door. A link that was taken down says so.
 */
type Shared = { name: string; data: Snapshot; at: number };

export function SharePage({ id }: { id: string }) {
  const router = useRouter();
  const [shared, setShared] = useState<Shared | null | "gone">(null);
  useEffect(() => {
    useStudio.setState({ readOnly: true, tool: "inspect", view: "3d" });
    let live = true;
    fetch(`/api/share/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setShared("gone");
        const s = (await r.json()) as Shared;
        showSnapshot(s.data);
        setShared(s);
      })
      .catch(() => live && setShared("gone"));
    return () => {
      live = false;
      useStudio.setState({ readOnly: false });
    };
  }, [id]);
  const items = useTopLevel();
  const overrides = useScene((s) => s.overrides);
  const room = shared && shared !== "gone" ? shared : null;
  const pieces = room
    ? items
        .filter((n) => n.kind === "piece" && !propsOf(n, overrides).hidden)
        .map((n) => ({ id: n.id, name: n.name, price: n.price }))
    : [];
  const total = pieces.reduce((t, p) => t + (p.price ?? 0), 0);

  if (shared === "gone")
    return (
      <main className="share-page">
        <section className="glass account-card">
          <h1 className="shell-dialog-title">This room is no longer shared</h1>
          <p className="account-text">
            Whoever shared it has taken the link down.
          </p>
          <div className="shell-dialog-acts">
            <Link href="/" className="main-btn main-btn-primary">
              Open the studio
            </Link>
          </div>
        </section>
      </main>
    );
  return (
    <main className="share-page">
      <header className="account-head">
        <div>
          <h1 className="shell-dialog-title">{room?.name ?? "A room"}</h1>
          <p className="account-text">
            A room shared from the Furnishes studio.
          </p>
        </div>
        <div className="shell-dialog-acts share-acts">
          <Link href="/" className="main-btn">
            Make your own
          </Link>
          <button
            type="button"
            className="main-btn main-btn-primary"
            disabled={!room}
            onClick={() => {
              if (!room) return;
              const pid = importProject(room.name, room.data);
              router.push(`/?project=${encodeURIComponent(pid)}`);
            }}
          >
            Open in my studio
          </button>
        </div>
      </header>
      <section className="glass share-stage" aria-label="The room">
        {room ? <Scene3D /> : <p className="assets-empty">One moment.</p>}
      </section>
      <section className="glass account-card">
        <h2 className="eva-pref-title">Furnishes pieces in the room</h2>
        {pieces.length === 0 ? (
          <p className="assets-empty">No Furnishes pieces in this room yet.</p>
        ) : (
          <ul className="shell-dialog-list" data-total>
            {pieces.map((p) => (
              <li key={p.id}>
                <span>{p.name}</span>
                <span className="f-num">
                  {p.price !== undefined ? sgd(p.price) : ""}
                </span>
              </li>
            ))}
            <li>
              <span>
                {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}
              </span>
              <span className="f-num">{sgd(total)}</span>
            </li>
          </ul>
        )}
      </section>
    </main>
  );
}
