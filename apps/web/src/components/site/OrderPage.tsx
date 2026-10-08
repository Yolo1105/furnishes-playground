"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SitePage } from "./SitePage";
import type { Address } from "@/lib/address";
import { sgd } from "@/lib/money";
import { STATUS_NAMES, type OrderStatus, type Priced } from "@/lib/orders";
import { SITE } from "@/lib/site";

/**
 * One order, for whoever holds its key (every mail about it carries
 * the link, and the payment page sends the shopper back here) or is
 * signed in as its owner: where it stands, its pieces and its total,
 * where it goes, the page to pay on while it waits, and a way to
 * cancel it meanwhile. Read live from the server, so a payment that
 * just went through reads as paid.
 */
type Shown = {
  id: string;
  status: OrderStatus;
  total: number;
  at: number;
  lines: Pick<Priced, "name" | "sgd">[];
  address: Address;
  payUrl?: string;
};

const WORD: Record<OrderStatus, string> = {
  pending_payment: "It waits to be paid; it can be paid or cancelled here.",
  paid: "Thank you. It is being made, and we write when it is on its way.",
  fulfilled: "It is delivered. The help page says how it goes together.",
  cancelled: "It was cancelled; nothing was charged.",
  refunded: "It is refunded; the money goes back the way it was paid.",
};

export function OrderPage({ id, orderKey }: { id: string; orderKey: string }) {
  const [order, setOrder] = useState<Shown | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const url = `/api/orders/${encodeURIComponent(id)}?key=${encodeURIComponent(orderKey)}`;
  useEffect(() => {
    let live = true;
    fetch(url)
      .then(async (r) => {
        if (!live) return;
        setOrder(r.ok ? ((await r.json()) as Shown) : "none");
      })
      .catch(() => live && setOrder("none"));
    return () => {
      live = false;
    };
  }, [url]);
  const cancel = async () => {
    setBusy(true);
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok && order && order !== "none")
      setOrder({ ...order, status: "cancelled" });
  };
  if (order === "none")
    return (
      <SitePage
        current={null}
        eye="Order"
        title="Not here"
        sub="No order stands under this link. A link from a mail about an order carries its key; the studio's Orders lists the ones placed from this browser."
      >
        <div className="shell-dialog-acts">
          <Link href={SITE.studio} className="main-btn main-btn-primary">
            Open the studio
          </Link>
        </div>
      </SitePage>
    );
  return (
    <SitePage
      current={null}
      eye="Order"
      title={order ? order.id : "One moment"}
      sub={
        order
          ? `${STATUS_NAMES[order.status]} · ${WORD[order.status]}`
          : "Reading the order."
      }
    >
      {order && (
        <section className="glass account-card" aria-label="The order">
          <ul className="shell-dialog-list f-num" data-total="true">
            {order.lines.map((l, i) => (
              <li key={i}>
                <span>{l.name}</span>
                <span>{sgd(l.sgd)}</span>
              </li>
            ))}
            <li>
              <span>
                Total · {order.lines.length}{" "}
                {order.lines.length === 1 ? "piece" : "pieces"}
              </span>
              <span>{sgd(order.total)}</span>
            </li>
          </ul>
          <p className="account-text">
            To {order.address.recipient}, {order.address.line1}, Singapore{" "}
            {order.address.postal}. Placed{" "}
            {new Date(order.at).toLocaleDateString("en-SG", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            .
          </p>
          <div className="shell-dialog-acts">
            {order.status === "pending_payment" && order.payUrl && (
              <a className="main-btn main-btn-primary" href={order.payUrl}>
                Pay now · {sgd(order.total)}
              </a>
            )}
            {order.status === "pending_payment" && (
              <button
                type="button"
                className="main-btn"
                disabled={busy}
                onClick={() => void cancel()}
              >
                Cancel order
              </button>
            )}
            <Link href={SITE.studio} className="main-btn">
              Open the studio
            </Link>
          </div>
        </section>
      )}
    </SitePage>
  );
}
