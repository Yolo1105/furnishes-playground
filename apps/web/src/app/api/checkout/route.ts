import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { randomId } from "@/lib/id";
import { orderPlacedMail } from "@/lib/mails";
import { CURRENCY, sgd } from "@/lib/money";
import { OrderId, priceLines } from "@/lib/orders";
import { AddressSchema, EmailField } from "@/lib/schemas";
import { SITE } from "@/lib/site";
import { createSession, stripeKey } from "@/lib/stripe";

/**
 * Placing an order. The lines are priced again from the catalogue, so
 * what is charged is what the studio showed; the order is kept on the
 * server as awaiting payment, under the shopper's account when signed
 * in and under a random key either way (the key is the shopper's handle
 * on it from the link back), with where its mails go: the account's
 * email, or the one a guest gives. A mail says it is placed. With
 * STRIPE_SECRET_KEY set, a hosted payment page is opened and its
 * address handed back ("redirect"); without one the order waits as
 * awaiting payment and the route says so ("offline"). The webhook
 * (api/webhooks/stripe) says when it is paid. An order number already
 * taken is only the signed-in owner's to place again, and only while
 * it still awaits payment: nobody learns another's key from here.
 */
export const runtime = "nodejs";

const Body = z.object({
  orderId: OrderId,
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
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("The order could not be read.", 400);
  const { orderId, address, total } = parsed.data;
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
  const { db } = getDb();
  // the same order placed twice (a retry) is the one order, for its
  // owner and while it waits; another's number is simply taken
  const kept = (
    await db.select().from(orders).where(eq(orders.id, orderId))
  )[0];
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
        message: `Order ${orderId} is already ${kept.status.replace("_", " ")}.`,
      },
      { status: 409 },
    );
  const key = kept?.key ?? randomId(9);
  const now = Date.now();
  if (!kept) {
    await db.insert(orders).values({
      id: orderId,
      userId: who?.id ?? null,
      key,
      email,
      status: "pending_payment",
      lines: priced.lines,
      total: priced.total,
      address,
      at: now,
      updatedAt: now,
    });
    await orderPlacedMail({
      id: orderId,
      email,
      lines: priced.lines,
      total: priced.total,
      address,
    });
  }
  if (!stripeKey())
    return NextResponse.json({ mode: "offline", key, message: OFFLINE });
  const origin = req.headers.get("origin") ?? SITE.url;
  const back = (how: string) =>
    `${origin}${SITE.studio}?checkout=${how}&order=${encodeURIComponent(orderId)}&key=${encodeURIComponent(key)}`;
  const session = await createSession({
    orderId,
    lines: priced.lines,
    successUrl: back("success"),
    cancelUrl: back("cancelled"),
    ...(email ? { email } : {}),
  });
  if (!session)
    return NextResponse.json(
      {
        error: "unavailable",
        mode: "unavailable",
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
  return NextResponse.json({ mode: "redirect", key, url: session.url });
}
