import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, paymentEvent } from "@/lib/db/schema";
import { orderPaidMail, orderRefundedMail, type OrderMail } from "@/lib/mails";
import { canMove, type OrderStatus } from "@/lib/orders";
import {
  outcomeOf,
  parseEvent,
  verifySignature,
  webhookSecret,
} from "@/lib/stripe";

/**
 * What Stripe says became of a payment: the one write with no session,
 * so it earns its trust itself, in this order. The signature over the
 * raw body, within five minutes. Then the event's id kept, so a replay
 * does nothing twice. Then, and only then, the order moved on: paid,
 * cancelled when the page lapsed, refunded; a move the order's state
 * does not allow is left alone, and the buyer is written to when it
 * is paid or refunded. A failure answers 5xx, so Stripe sends the event
 * again.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!webhookSecret())
    return NextResponse.json({ error: "no webhook secret" }, { status: 503 });
  const raw = await req.text();
  const rejected = verifySignature(raw, req.headers.get("stripe-signature"));
  if (rejected) return NextResponse.json({ error: rejected }, { status: 400 });
  const event = parseEvent(raw);
  if (!event)
    return NextResponse.json({ error: "bad-payload" }, { status: 400 });
  const { db, ready } = getDb();
  await ready;
  const fresh = await db
    .insert(paymentEvent)
    .values({ id: event.id, kind: event.kind, at: Date.now() })
    .onConflictDoNothing()
    .returning({ id: paymentEvent.id });
  if (fresh.length === 0)
    return NextResponse.json({ received: true, duplicate: true });
  const outcome = outcomeOf(event);
  if (!outcome) return NextResponse.json({ received: true, applied: false });
  const row = (
    await db
      .select()
      .from(orders)
      .where(
        or(
          eq(orders.paymentRef, event.ref),
          eq(orders.paymentIntentRef, event.ref),
        ),
      )
  )[0];
  if (!row || !canMove(row.status as OrderStatus, outcome))
    return NextResponse.json({ received: true, applied: false });
  const now = Date.now();
  await db
    .update(orders)
    .set({
      status: outcome,
      updatedAt: now,
      ...(event.intentRef ? { paymentIntentRef: event.intentRef } : {}),
    })
    .where(eq(orders.id, row.id));
  await db
    .update(paymentEvent)
    .set({ orderId: row.id })
    .where(eq(paymentEvent.id, event.id));
  const mail = {
    ...row,
    lines: row.lines as OrderMail["lines"],
    address: row.address as OrderMail["address"],
  };
  if (outcome === "paid") await orderPaidMail(mail);
  if (outcome === "refunded") await orderRefundedMail(mail);
  return NextResponse.json({ received: true, applied: true });
}
