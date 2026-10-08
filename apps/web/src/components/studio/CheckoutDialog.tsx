"use client";

import { useState } from "react";
import { validAddress, type Address } from "@/lib/address";
import { useSession } from "@/lib/auth-client";
import { EMAIL } from "@/lib/email";
import { sgd, type AssetNode } from "./assets-data";
import { Dialog } from "./Dialog";
import { exportCartCsv } from "./export";
import { CheckIcon, ExportIcon } from "./icons";
import { STATUS_NAMES, useOrders, type Order } from "./order-store";
import { useScene } from "./scene-store";

/**
 * Checkout in three steps: the order read back piece by piece with its
 * total; where it goes (a name, an address, a six-digit postal code, a
 * Singapore phone number, and for a guest the email the order's mails
 * go to; an account's go to its own); then the order placed, on the
 * server too.
 * The server numbers the order and hands the number back; with Stripe
 * connected the dialog offers the payment page; without it the order
 * waits at "awaiting payment" and the dialog says so plainly.
 * The list can still be downloaded. The pieces stay in the room and
 * read as ordered; the cart empties.
 */
type Form = Address & { email: string };
const EMPTY: Form = {
  recipient: "",
  line1: "",
  postal: "",
  phone: "",
  email: "",
};

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
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [note, setNote] = useState<string>("");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const account = useSession().data?.user.email;
  const { email, ...address } = form;
  const ok = {
    ...validAddress(address),
    email: !!account || EMAIL.test(email.trim()),
  };
  const allOk = Object.values(ok).every(Boolean);

  const place = async () => {
    setTouched(true);
    if (!allOk) return;
    const order = useOrders.getState().place(
      pieces.map((n) => ({
        pieceId: n.id,
        ...(n.productId ? { productId: n.productId } : {}),
        name: n.name,
        category: n.category,
        price: n.price ?? 0,
      })),
      address,
      account ? undefined : email.trim().toLowerCase(),
    );
    useScene.getState().clearCart();
    setPlaced(order);
    setStep("placed");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: order.lines.map((l) => ({
            productId: l.productId ?? l.pieceId,
            name: l.name,
            price: l.price,
          })),
          total: order.total,
          address,
          currency: "SGD",
          ...(order.email ? { email: order.email } : {}),
        }),
      });
      const data = (await res.json()) as {
        mode: string;
        message?: string;
        id?: string;
        key?: string;
        url?: string;
      };
      // the order is the server's number from here on
      const id = data.id ?? order.id;
      if (data.id && data.id !== order.id) {
        useOrders.getState().assign(order.id, data.id);
        setPlaced((p) => (p ? { ...p, id: data.id! } : p));
      }
      if (data.key || data.url)
        useOrders.getState().setPayment(id, {
          ...(data.key ? { key: data.key } : {}),
          ...(data.url ? { payUrl: data.url } : {}),
        });
      if (data.mode === "redirect" && data.url) {
        setPayUrl(data.url);
        setNote("The payment page is ready: pay there, and the order follows.");
      } else setNote(data.message ?? "");
    } catch {
      setNote(
        "Payment could not be reached. The order is kept as awaiting payment.",
      );
    }
  };

  const field = (
    key: keyof Form,
    label: string,
    hint: string,
    extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {},
  ) => (
    <label className="order-field" data-bad={touched && !ok[key]}>
      <span className="room-dim-label">{label}</span>
      <input
        className="room-dim-input"
        value={form[key]}
        aria-label={label}
        aria-invalid={touched && !ok[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
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
            {!account &&
              field("email", "Email", "Where the order's mails go", {
                type: "email",
                inputMode: "email",
                autoComplete: "email",
              })}
          </div>
          <p className="order-note">
            The order is kept as awaiting payment until it is paid, and can be
            cancelled under Orders meanwhile.{" "}
            {account
              ? `Word of it goes to ${account}.`
              : "Word of it goes to the email above."}{" "}
            Prices are estimates until the first run is costed.
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
              className={payUrl ? "main-btn" : "main-btn main-btn-primary"}
              onClick={onClose}
            >
              <span>{payUrl ? "Pay later" : "Done"}</span>
            </button>
            {payUrl && (
              <a className="main-btn main-btn-primary" href={payUrl}>
                <span>Pay now · {sgd(placed.total)}</span>
              </a>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
