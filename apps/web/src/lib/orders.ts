import { productOf } from "@/components/studio/catalogue";

/**
 * An order as the server reads it. The price of each line is counted
 * again here from the catalogue, the same recipes the studio prices
 * from, so what is charged is what the studio showed and no price is
 * taken from the browser's word.
 */
export type LineIn = { productId: string; name: string; price: number };
export type Priced = { productId: string; name: string; sgd: number };

/** the lines priced from the catalogue, or the piece that is not in it */
export function priceLines(
  lines: LineIn[],
):
  | { ok: true; lines: Priced[]; total: number }
  | { ok: false; unknown: string } {
  const out: Priced[] = [];
  for (const l of lines) {
    const p = productOf(l.productId);
    if (!p) return { ok: false, unknown: l.productId };
    out.push({ productId: p.id, name: p.name, sgd: p.price });
  }
  return { ok: true, lines: out, total: out.reduce((t, l) => t + l.sgd, 0) };
}

/** the order's states, as the shop's ledger has them */
export type OrderStatus =
  "pending_payment" | "paid" | "fulfilled" | "cancelled" | "refunded";

/** each state as the studio and the shopper read it */
export const STATUS_NAMES: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** a state the shop can move an order to from where it stands: paid
    only from awaiting payment (the webhook's word, or the studio's when
    payment came another way), cancelled only while awaiting, delivered
    once paid, refunded once paid or delivered; the same state again is
    no move */
export const canMove = (from: OrderStatus, to: OrderStatus) =>
  (to === "paid" && from === "pending_payment") ||
  (to === "cancelled" && from === "pending_payment") ||
  (to === "refunded" && (from === "paid" || from === "fulfilled")) ||
  (to === "fulfilled" && from === "paid");
