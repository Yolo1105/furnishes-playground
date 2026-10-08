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

/** one call to an ops route: its answer, or what went wrong */
const call = async <T,>(
  path: string,
  init: RequestInit,
): Promise<{ data: T; error: null } | { data: null; error: string }> => {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (res.ok && data) return { data, error: null };
  return { data: null, error: data?.error ?? `${res.status}` };
};

/** a call made from a button: busy while it runs, the failure kept,
    and the page read again when it went through */
function useOpsCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const run = async <T,>(path: string, init: RequestInit) => {
    setBusy(true);
    setFailed(null);
    const r = await call<T>(path, init);
    setBusy(false);
    if (r.error) setFailed(r.error);
    else router.refresh();
    return r.data;
  };
  return { busy, failed, run };
}

/** the moves the studio makes, by name */
const MOVES: [OrderStatus, string][] = [
  ["paid", "Mark paid"],
  ["fulfilled", "Mark delivered"],
  ["cancelled", "Cancel"],
  ["refunded", "Refund made in Stripe"],
];

export function OrderActions({ order }: { order: OrderRow }) {
  const [note, setNote] = useState(order.note ?? "");
  const { busy, failed, run } = useOpsCall();
  const patch = (body: { status?: OrderStatus; note?: string }) =>
    run(`/api/ops/orders/${order.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
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
  /** none once the account that wrote it has ended */
  email: string | null;
  category: string;
  message: string;
  answered: boolean;
}) {
  const { busy, failed, run } = useOpsCall();
  const mark = (to: boolean) =>
    run(`/api/ops/help/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ answered: to }),
    });
  const quoted = message
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const mailto = `mailto:${email}?subject=${encodeURIComponent(`Re: your ${category} to ${SITE.name}`)}&body=${encodeURIComponent(`\n\n${quoted}`)}`;
  return (
    <div className="ops-acts">
      {email && (
        <a className="home-btn" href={mailto}>
          Reply by mail
        </a>
      )}
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
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const { busy, failed, run } = useOpsCall();
  const send = async () => {
    setSaid(null);
    const data = await run<{ sent: number }>("/api/ops/waitlist", {
      method: "POST",
    });
    setAsking(false);
    if (data)
      setSaid(
        data.sent === 0
          ? "Nobody was due a note."
          : `Sent to ${data.sent} ${data.sent === 1 ? "address" : "addresses"}.`,
      );
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
      {failed && (
        <span className="home-error ops-error" role="alert">
          {failed}
        </span>
      )}
    </div>
  );
}
