"use client";

import { useState } from "react";
import { sgd, type AssetNode } from "./assets-data";
import { Dialog } from "./Dialog";
import { exportCartCsv } from "./export";
import { CheckIcon, ExportIcon } from "./icons";
import {
  STATUS_NAMES,
  useOrders,
  validAddress,
  type Address,
  type Order,
} from "./order-store";
import { useScene } from "./scene-store";

/**
 * Checkout in three steps: the order read back piece by piece with its
 * total; where it goes (a name, an address, a six-digit postal code, a
 * Singapore phone number); then the order placed. Paying is not connected
 * in this build, so the order waits at "awaiting payment" and the dialog
 * says so plainly; the list can still be downloaded. The pieces stay in
 * the room and read as ordered; the cart empties.
 */
const EMPTY: Address = { recipient: "", line1: "", postal: "", phone: "" };

export function CheckoutDialog({
  pieces,
  total,
  onClose,
}: {
  pieces: AssetNode[];
  total: number;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"summary" | "delivery" | "placed">(
    "summary",
  );
  const [address, setAddress] = useState<Address>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [note, setNote] = useState<string>("");
  const ok = validAddress(address);
  const allOk = Object.values(ok).every(Boolean);

  const place = async () => {
    setTouched(true);
    if (!allOk) return;
    const order = useOrders.getState().place(
      pieces.map((n) => ({
        pieceId: n.id,
        name: n.name,
        category: n.category,
        price: n.price ?? 0,
      })),
      address,
    );
    useScene.getState().clearCart();
    setPlaced(order);
    setStep("placed");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          total: order.total,
          currency: "SGD",
        }),
      });
      const data = (await res.json()) as { mode: string; message?: string };
      setNote(data.message ?? "");
    } catch {
      setNote(
        "Payment could not be reached. The order is kept as awaiting payment.",
      );
    }
  };

  const field = (
    key: keyof Address,
    label: string,
    hint: string,
    extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {},
  ) => (
    <label className="order-field" data-bad={touched && !ok[key]}>
      <span className="room-dim-label">{label}</span>
      <input
        className="room-dim-input"
        value={address[key]}
        aria-label={label}
        aria-invalid={touched && !ok[key]}
        onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
        {...extra}
      />
      {touched && !ok[key] && <small className="order-hint">{hint}</small>}
    </label>
  );

  return (
    <Dialog
      title={
        step === "summary"
          ? "Your order"
          : step === "delivery"
            ? "Where it goes"
            : "Order placed"
      }
      onClose={onClose}
    >
      {step === "summary" && (
        <>
          <ul className="shell-dialog-list f-num" data-total="true">
            {pieces.map((n) => (
              <li key={n.id}>
                <span>{n.name}</span>
                <span>{sgd(n.price ?? 0)}</span>
              </li>
            ))}
            <li>
              <span>
                Total · {pieces.length}{" "}
                {pieces.length === 1 ? "piece" : "pieces"}
              </span>
              <span>{sgd(total)}</span>
            </li>
          </ul>
          <div className="shell-dialog-acts">
            <button type="button" className="main-btn" onClick={exportCartCsv}>
              <ExportIcon size={14} />
              <span>Download the list</span>
            </button>
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={() => setStep("delivery")}
            >
              <span>Continue to delivery</span>
            </button>
          </div>
        </>
      )}
      {step === "delivery" && (
        <>
          <div className="order-form">
            {field("recipient", "Recipient", "A name, please", {
              autoComplete: "name",
            })}
            {field("line1", "Address", "Block, street and unit", {
              autoComplete: "street-address",
            })}
            <div className="order-form-row">
              {field("postal", "Postal code", "Six digits", {
                inputMode: "numeric",
                autoComplete: "postal-code",
                maxLength: 6,
              })}
              {field("phone", "Phone", "A Singapore number, 8 digits", {
                inputMode: "tel",
                autoComplete: "tel",
              })}
            </div>
          </div>
          <p className="order-note">
            Paying is not connected on this server yet: the order is kept as
            awaiting payment and you can cancel it under Orders.
          </p>
          <div className="shell-dialog-acts">
            <button
              type="button"
              className="main-btn"
              onClick={() => setStep("summary")}
            >
              <span>Back</span>
            </button>
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={() => void place()}
            >
              <span>Place order · {sgd(total)}</span>
            </button>
          </div>
        </>
      )}
      {step === "placed" && placed && (
        <>
          <p className="order-placed">
            <CheckIcon size={16} />
            Order <b className="f-num">{placed.id}</b> ·{" "}
            <span className="order-status" data-status={placed.status}>
              {STATUS_NAMES[placed.status]}
            </span>
          </p>
          <p>
            {placed.lines.length}{" "}
            {placed.lines.length === 1 ? "piece" : "pieces"} for{" "}
            {placed.address.recipient}, Singapore {placed.address.postal},{" "}
            {sgd(placed.total)}.
          </p>
          {note && <p className="order-note">{note}</p>}
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
      )}
    </Dialog>
  );
}
