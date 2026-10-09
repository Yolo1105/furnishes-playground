/**
 * An order's status and what it is called: the one part of the orders
 * module the studio reads in the browser (its store, the cart's order
 * list), kept apart from the pricing and the schemas, which bring zod
 * and Node's crypto and belong to the server alone.
 */
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
