import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { orders, paymentEvent } from "@/lib/db/schema";
import { log, reasonOf } from "@/lib/log";
import { orderMailOf, orderMovedMail, studioAlertMail } from "@/lib/mails";
import { moveOrder } from "@/lib/order-moves";
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
 * raw body, within five minutes. Then a replay of an event already done
 * with does nothing twice. Then, and only then, the order moved on,
 * from the state it was read in: paid, cancelled when the page lapsed,
 * refunded; and only once it has, the event's id kept as done. The order is found by its
 * own number, which the session and its intent carry, or by the
 * session or intent it was opened with. A move the order's state does
 * not allow is left alone and said in the log, as is an event no
 * order answers to; money taken for an order already cancelled is an
 * error, and the studio's admins are written to. The buyer is written
 * to when it is paid or refunded. A failure while moving the order, or
 * an order moved meanwhile, answers 5xx with the event not kept, so
 * Stripe sends it again and it is weighed then.
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
  const seen = await db
    .select({ id: paymentEvent.id })
    .from(paymentEvent)
    .where(eq(paymentEvent.id, event.id));
  if (seen.length > 0)
    return NextResponse.json({ received: true, duplicate: true });
  /** the event done with, for whatever order it touched */
  const done = (orderId: string | null = null) =>
    db
      .insert(paymentEvent)
      .values({ id: event.id, kind: event.kind, at: Date.now(), orderId })
      .onConflictDoNothing();
  try {
    const outcome = outcomeOf(event);
    if (!outcome) {
      log.info("stripe.webhook.ignored", {
        eventId: event.id,
        kind: event.kind,
        // a partial refund: the order stays paid, noted by hand
        ...(event.fullyRefunded === false ? { partialRefund: true } : {}),
      });
      await done();
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
      await done();
      return NextResponse.json({ received: true, applied: false });
    }
    if (!canMove(row.status as OrderStatus, outcome)) {
      const said = {
        eventId: event.id,
        kind: event.kind,
        orderId: row.id,
        from: row.status,
        to: outcome,
      };
      // paid for an order nobody will send: a person refunds it
      if (outcome === "paid" && row.status === "cancelled") {
        log.error("stripe.webhook.paid_cancelled", said);
        await studioAlertMail(
          `Order ${row.id} was paid after it was cancelled`,
          `Stripe says order ${row.id} was paid (${event.kind}, ${event.id}), but it was cancelled first. Refund it in Stripe's dashboard, then mark it refunded on the operations page.`,
        );
      } else log.warn("stripe.webhook.refused", said);
      await done(row.id);
      return NextResponse.json({ received: true, applied: false });
    }
    const moved = await moveOrder(
      row,
      outcome,
      event.intentRef ? { paymentIntentRef: event.intentRef } : {},
    );
    // moved by another hand since it was read: weighed again on the retry
    if (!moved) throw new Error(`order ${row.id} moved meanwhile`);
    await done(row.id);
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
    return NextResponse.json({ error: "not applied" }, { status: 500 });
  }
}
