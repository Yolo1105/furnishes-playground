import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, paymentEvent } from "@/lib/db/schema";
import { log, reasonOf } from "@/lib/log";
import { orderMailOf, orderMovedMail } from "@/lib/mails";
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
 * cancelled when the page lapsed, refunded. The order is found by its
 * own number, which the session and its intent carry, or by the
 * session or intent it was opened with. A move the order's state does
 * not allow is left alone and said in the log, as is an event no
 * order answers to; the buyer is written to when it is paid or
 * refunded. A failure while moving the order lets the event's row go
 * again and answers 5xx, so Stripe sends the event again and it is
 * applied then.
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
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  const { db, ready } = getDb();
  await ready;
  const fresh = await db
    .insert(paymentEvent)
    .values({ id: event.id, kind: event.kind, at: Date.now() })
    .onConflictDoNothing()
    .returning({ id: paymentEvent.id });
  if (fresh.length === 0)
    return NextResponse.json({ received: true, duplicate: true });
  try {
    const outcome = outcomeOf(event);
    if (!outcome) {
      log.info("stripe.webhook.ignored", {
        eventId: event.id,
        kind: event.kind,
      });
      return NextResponse.json({ received: true, applied: false });
    }
    const row = (
      await db
        .select()
        .from(orders)
        .where(
          or(
            ...(event.orderId ? [eq(orders.id, event.orderId)] : []),
            eq(orders.paymentRef, event.ref),
            eq(orders.paymentIntentRef, event.ref),
          ),
        )
    )[0];
    if (!row) {
      log.warn("stripe.webhook.unmatched", {
        eventId: event.id,
        kind: event.kind,
        ref: event.ref,
        orderId: event.orderId,
      });
      return NextResponse.json({ received: true, applied: false });
    }
    if (!canMove(row.status as OrderStatus, outcome)) {
      log.warn("stripe.webhook.refused", {
        eventId: event.id,
        kind: event.kind,
        orderId: row.id,
        from: row.status,
        to: outcome,
      });
      return NextResponse.json({ received: true, applied: false });
    }
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
    log.info("stripe.webhook.applied", {
      eventId: event.id,
      kind: event.kind,
      orderId: row.id,
      to: outcome,
    });
    await orderMovedMail(orderMailOf(row), outcome);
    return NextResponse.json({ received: true, applied: true });
  } catch (error) {
    log.error("stripe.webhook.failed", {
      eventId: event.id,
      kind: event.kind,
      reason: reasonOf(error),
    });
    // the event is not yet done with: let its row go, so the retry
    // is not read as a replay
    await db
      .delete(paymentEvent)
      .where(eq(paymentEvent.id, event.id))
      .catch(() => undefined);
    return NextResponse.json({ error: "not applied" }, { status: 500 });
  }
}
