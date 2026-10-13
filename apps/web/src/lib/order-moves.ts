import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { orders } from "./db/schema";
import { log } from "./log";
import type { OrderStatus } from "./orders";
import { closeSession } from "./stripe";

type Order = typeof orders.$inferSelect;
type Changes = Partial<Omit<Order, "id">>;

/**
 * An order moved on from the state it was read in, and only from it:
 * two hands on one order at once (the shopper's cancel and Stripe's
 * paid, or two deliveries of one event) cannot both win. False when it
 * moved meanwhile; the caller says so rather than writing over it.
 */
export const moveOrder = async (
  row: Pick<Order, "id" | "status">,
  to: OrderStatus,
  changes: Changes = {},
) =>
  (
    await getDb()
      .db.update(orders)
      .set({ ...changes, status: to, updatedAt: Date.now() })
      .where(and(eq(orders.id, row.id), eq(orders.status, row.status)))
      .returning({ id: orders.id })
  ).length > 0;

/** why a move did not go through, as the shopper or the studio reads it */
export const NOT_MOVED = {
  paid: "it was paid a moment ago",
  unclosed: "its payment page could not be closed; try again in a moment",
  moved: "it moved on meanwhile",
} as const;

/**
 * An order cancelled while it awaits payment. Its payment page is
 * closed first, so nobody can pay it once it reads as cancelled; a page
 * paid first, or one Stripe would not close, leaves the order as it
 * is, and the webhook moves it on. Null once cancelled, else why not.
 */
export async function cancelOrder(
  row: Pick<Order, "id" | "status" | "paymentRef">,
  changes: Changes = {},
): Promise<keyof typeof NOT_MOVED | null> {
  if (row.paymentRef) {
    const page = await closeSession(row.paymentRef);
    if (page !== "expired") {
      log.warn("stripe.expire.missed", { orderId: row.id, page });
      return page === "complete" ? "paid" : "unclosed";
    }
  }
  return (await moveOrder(row, "cancelled", changes)) ? null : "moved";
}
