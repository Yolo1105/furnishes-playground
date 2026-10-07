"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { canMove, STATUS_NAMES, type OrderStatus } from "@/lib/orders";
import { SITE } from "@/lib/site";

/**
 * The buttons on the operations page, each one call to an ops route
 * and the page read again: an order moved on or noted, a word marked
 * answered, the waitlist's note sent once. A failure is said in place.
 */
export type OrderRow = {
  id: string;
  status: OrderStatus;
  note: string | null;
};

const call = async (path: string, init: RequestInit) => {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (res.ok) return null;
  const data = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return data?.error ?? `${res.status}`;
};

/** the moves the studio makes, by name */
const MOVES: [OrderStatus, string][] = [
  ["paid", "Mark paid"],
  ["fulfilled", "Mark delivered"],
  ["cancelled", "Cancel"],
  ["refunded", "Refund noted"],
];

export function OrderActions({ order }: { order: OrderRow }) {
  const router = useRouter();
  const [note, setNote] = useState(order.note ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const patch = async (body: { status?: OrderStatus; note?: string }) => {
    setBusy(true);
    setFailed(null);
    const problem = await call(`/api/ops/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (problem) setFailed(problem);
    else router.refresh();
  };
  const moves = MOVES.filter(([to]) => canMove(order.status, to));
  return (
    <div className="ops-acts">
      {moves.map(([to, label]) => (
        <button
          key={to}
          type="button"
          className="home-btn"
          disabled={busy}
          onClick={() => void patch({ status: to })}
          title={`${STATUS_NAMES[order.status]} → ${STATUS_NAMES[to]}`}
        >
          {label}
        </button>
      ))}
      <label className="ops-note">
        <span className="home-row-l">Note</span>
        <input
          className="home-input"
          value={note}
          placeholder="For the studio: a courier, a date, a reason"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="home-btn"
        disabled={busy || note.trim() === (order.note ?? "")}
        onClick={() => void patch({ note: note.trim() })}
      >
        Keep the note
      </button>
      {failed && (
        <span className="home-error ops-error" role="alert">
          {failed}
        </span>
      )}
    </div>
  );
}

export function HelpActions({
  id,
  email,
  category,
  message,
  answered,
}: {
  id: string;
  email: string;
  category: string;
  message: string;
  answered: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const mark = async (to: boolean) => {
    setBusy(true);
    setFailed(null);
    const problem = await call(`/api/ops/help/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ answered: to }),
    });
    setBusy(false);
    if (problem) setFailed(problem);
    else router.refresh();
  };
  const quoted = message
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const mailto = `mailto:${email}?subject=${encodeURIComponent(`Re: your ${category} to ${SITE.name}`)}&body=${encodeURIComponent(`\n\n${quoted}`)}`;
  return (
    <div className="ops-acts">
      <a className="home-btn" href={mailto}>
        Reply by mail
      </a>
      <button
        type="button"
        className="home-btn"
        disabled={busy}
        onClick={() => void mark(!answered)}
      >
        {answered ? "Reopen" : "Mark answered"}
      </button>
      {failed && (
        <span className="home-error ops-error" role="alert">
          {failed}
        </span>
      )}
    </div>
  );
}

export function WaitlistActions({ due }: { due: number }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const send = async () => {
    setBusy(true);
    setSaid(null);
    const res = await fetch("/api/ops/waitlist", { method: "POST" });
    const data = (await res.json().catch(() => null)) as {
      sent?: number;
      error?: string;
    } | null;
    setBusy(false);
    setAsking(false);
    if (!res.ok) setSaid(data?.error ?? `${res.status}`);
    else {
      setSaid(
        data?.sent === 0
          ? "Nobody was due a note."
          : `Sent to ${data?.sent} ${data?.sent === 1 ? "address" : "addresses"}.`,
      );
      router.refresh();
    }
  };
  return (
    <div className="ops-acts">
      <a className="home-btn" href="/api/ops/waitlist" download="waitlist.csv">
        Download CSV
      </a>
      {asking ? (
        <>
          <button
            type="button"
            className="home-btn home-btn-primary"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "Sending" : `Send to ${due} now`}
          </button>
          <button
            type="button"
            className="home-btn"
            disabled={busy}
            onClick={() => setAsking(false)}
          >
            Not now
          </button>
        </>
      ) : (
        <button
          type="button"
          className="home-btn"
          disabled={due === 0}
          onClick={() => setAsking(true)}
        >
          Send the opening note
        </button>
      )}
      {said && (
        <span className="ops-said" role="status">
          {said}
        </span>
      )}
    </div>
  );
}
