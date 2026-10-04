"use client";

import { sgd } from "./assets-data";
import { STATUS_NAMES, useOrders } from "./order-store";

/** Every order placed from the studio, newest first, with its state; an
    order awaiting payment can be cancelled. */
export function OrderList() {
  const orders = useOrders((s) => s.orders);
  const { cancel } = useOrders.getState();
  if (orders.length === 0)
    return (
      <p className="assets-empty">
        No orders yet. Put pieces in the cart and press Checkout on the shelf.
      </p>
    );
  return (
    <ul className="order-list">
      {orders.map((o) => (
        <li key={o.id} className="order" data-status={o.status}>
          <div className="order-head">
            <span className="order-id f-num">{o.id}</span>
            <span className="order-status" data-status={o.status}>
              {STATUS_NAMES[o.status]}
            </span>
            <span className="order-when">
              {new Date(o.at).toLocaleDateString("en-SG", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <p className="order-lines">
            {o.lines.map((l) => l.name).join(", ")} · {sgd(o.total)}
          </p>
          <p className="order-to">
            To {o.address.recipient}, {o.address.line1}, Singapore{" "}
            {o.address.postal}
          </p>
          {o.status === "pending_payment" && (
            <button
              type="button"
              className="main-btn order-cancel"
              onClick={() => cancel(o.id)}
            >
              <span>Cancel order</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
