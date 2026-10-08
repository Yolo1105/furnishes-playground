import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { HOSTED } from "@/lib/env";
import { randomId } from "@/lib/id";
import { log } from "@/lib/log";
import { orderPlacedMail } from "@/lib/mails";
import { CURRENCY, sgd } from "@/lib/money";
import { OrderId, orderNumber, priceLines } from "@/lib/orders";
import { allow, callerOf, DAY } from "@/lib/rate-limit";
import { AddressSchema, EmailField, readJson } from "@/lib/schemas";
import { SITE, trustedOrigins } from "@/lib/site";
import { createSession, sessionUrl, stripeKey } from "@/lib/stripe";

/**
 * Placing an order. The lines are priced again from the catalogue, so
 * what is charged is what the studio showed; the order is kept on the
 * server as awaiting payment under a number the server gives it (the
 * browser's own is only its handle until then), under the shopper's
 * account when signed in and under a random key either way (the key
 * is the shopper's handle on it, carried by its page's link), with
 * where its mails go: the account's email, or the one a guest gives.
 * A mail says it is placed. With STRIPE_SECRET_KEY set, a hosted
 * payment page is opened and its address handed back ("redirect"),
 * the shopper sent to the order's own page afterwards; without one
 * the order waits as awaiting payment and the route says so
 * ("offline"). The webhook (api/webhooks/stripe) says when it is
 * paid. An order placed again by its signed-in owner while it waits
 * is the one order: its page still open is handed back, a lapsed one
 * made anew. A caller gets so many orders an hour, an address so many
 * a day, so the letters cannot be made a flood.
 */
export const runtime = "nodejs";

/** orders a caller may place in an hour, and an address may be
    written to in a day */
const ORDERS_PER_HOUR = 10;
const ORDERS_PER_ADDRESS_DAY = 5;

const Body = z.object({
  /** an order of the owner's placed before, to place again */
  orderId: OrderId.optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(40),
        name: z.string().max(80),
        price: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(100),
  total: z.number().nonnegative(),
  address: AddressSchema,
  currency: z.literal(CURRENCY),
  /** a guest's, for the order's mails; an account's is its own */
  email: EmailField.optional(),
});

const OFFLINE =
  "Payment is not connected on this server. The order is kept as awaiting payment.";

const bad = (message: string, status: number, extra = {}) =>
  NextResponse.json(
    { error: "bad request", mode: "bad-request", message, ...extra },
    { status },
  );

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body.error) return body.error;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return bad("The order could not be read.", 400);
  if (!(await allow(`checkout:${callerOf(req)}`, ORDERS_PER_HOUR)))
    return NextResponse.json(
      {
        error: "rate-limit",
        mode: "rate-limit",
        message: "Too many orders from here for now; try again in an hour.",
      },
      { status: 429 },
    );
  const { address, total } = parsed.data;
  const priced = priceLines(parsed.data.lines);
  if (!priced.ok) return bad(`${priced.unknown} is not in the catalogue.`, 400);
  // the browser's total and the catalogue's must agree: a stale price
  // is said, not charged
  if (priced.total !== total)
    return NextResponse.json(
      {
        error: "repriced",
        mode: "repriced",
        message: `The pieces now come to ${sgd(priced.total)}; the order was not placed.`,
        total: priced.total,
      },
      { status: 409 },
    );
  const who = await userOf(req);
  const email = who?.email ?? parsed.data.email ?? null;
  if (email && !(await allow(`mail:${email}`, ORDERS_PER_ADDRESS_DAY, DAY)))
    return NextResponse.json(
      {
        error: "rate-limit",
        mode: "rate-limit",
        message: "Too many orders for this address today; try again tomorrow.",
      },
      { status: 429 },
    );
  const { db } = getDb();
  // an order placed again (its owner, from Orders) is the one order,
  // while it waits; another's number is simply taken
  const kept = parsed.data.orderId
    ? (
        await db.select().from(orders).where(eq(orders.id, parsed.data.orderId))
      )[0]
    : undefined;
  if (kept && (!who || kept.userId !== who.id))
    return NextResponse.json(
      {
        error: "taken",
        mode: "taken",
        message: "That order number is in use; place the order again.",
      },
      { status: 409 },
    );
  if (kept && kept.status !== "pending_payment")
    return NextResponse.json(
      {
        error: "placed",
        mode: "placed",
        status: kept.status,
        message: `Order ${kept.id} is already ${kept.status.replace("_", " ")}.`,
      },
      { status: 409 },
    );
  const key = kept?.key ?? randomId(9);
  const now = Date.now();
  let orderId = kept?.id ?? "";
  if (!kept) {
    // a number of the server's own; one already there is tried again
    for (let tries = 0; !orderId && tries < 5; tries++) {
      const id = orderNumber(now);
      const made = await db
        .insert(orders)
        .values({
          id,
          userId: who?.id ?? null,
          key,
          email,
          status: "pending_payment",
          lines: priced.lines,
          total: priced.total,
          address,
          at: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: orders.id });
      if (made.length) orderId = id;
    }
    if (!orderId)
      return bad("The order could not be numbered; try again.", 503);
    log.info("checkout.placed", {
      orderId,
      total: priced.total,
      user: who?.id ?? null,
    });
    await orderPlacedMail({
      id: orderId,
      key,
      email,
      lines: priced.lines,
      total: priced.total,
      address,
    });
  }
  if (!stripeKey())
    return NextResponse.json({
      mode: "offline",
      id: orderId,
      key,
      message: OFFLINE,
    });
  // the payment page already open for this order stands; a lapsed one
  // is made anew under a fresh key
  const open = kept?.paymentRef ? await sessionUrl(kept.paymentRef) : null;
  if (open)
    return NextResponse.json({ mode: "redirect", id: orderId, key, url: open });
  // the way back is the order's own page on this site: on a hosted run
  // only the site's own origins are trusted to send the shopper on
  const asked = req.headers.get("origin");
  const origin =
    asked && (!HOSTED || trustedOrigins().includes(asked)) ? asked : SITE.url;
  const back = (how: string) =>
    `${origin}/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(key)}&checkout=${how}`;
  const session = await createSession(
    {
      orderId,
      lines: priced.lines,
      successUrl: back("success"),
      cancelUrl: back("cancelled"),
      ...(email ? { email } : {}),
    },
    kept?.paymentRef ? now.toString(36) : "",
  );
  if (!session)
    return NextResponse.json(
      {
        error: "unavailable",
        mode: "unavailable",
        id: orderId,
        key,
        message:
          "The payment page could not be opened. The order is kept as awaiting payment; try again from Orders.",
      },
      { status: 502 },
    );
  await db
    .update(orders)
    .set({ paymentRef: session.id, updatedAt: Date.now() })
    .where(eq(orders.id, orderId));
  return NextResponse.json({
    mode: "redirect",
    id: orderId,
    key,
    url: session.url,
  });
}
