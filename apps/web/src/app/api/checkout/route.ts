import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { orderPlacedMail } from "@/lib/mails";
import { priceLines } from "@/lib/orders";
import { SITE } from "@/lib/site";
import { createSession, stripeKey } from "@/lib/stripe";

/**
 * Placing an order. The lines are priced again from the catalogue, so
 * what is charged is what the studio showed; the order is kept on the
 * server as awaiting payment, under the shopper's account when signed
 * in and under a random key either way (the key is the shopper's handle
 * on it from the link back), with where its mails go: the account's
 * email, or the one a guest gives. A mail says it is placed. With
 * STRIPE_SECRET_KEY set, a hosted
 * payment page is opened and its address handed back ("redirect");
 * without one the order waits as awaiting payment and the route says so
 * ("offline"). The webhook (api/webhooks/stripe) says when it is paid.
 */
export const runtime = "nodejs";

const Address = z.object({
  recipient: z.string().trim().min(2).max(80),
  line1: z.string().trim().min(4).max(200),
  postal: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
  phone: z.string().trim().min(8).max(20),
});
const Body = z.object({
  orderId: z.string().regex(/^FN-[A-Z0-9]{3,10}$/),
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
  address: Address,
  currency: z.literal("SGD"),
  /** a guest's, for the order's mails; an account's is its own */
  email: z.string().trim().toLowerCase().email().max(200).optional(),
});

const OFFLINE =
  "Payment is not connected on this server. The order is kept as awaiting payment.";

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ mode: "bad-request" }, { status: 400 });
  const { orderId, address, total } = parsed.data;
  const priced = priceLines(parsed.data.lines);
  if (!priced.ok)
    return NextResponse.json(
      {
        mode: "bad-request",
        message: `${priced.unknown} is not in the catalogue.`,
      },
      { status: 400 },
    );
  // the browser's total and the catalogue's must agree: a stale price
  // is said, not charged
  if (priced.total !== total)
    return NextResponse.json(
      {
        mode: "repriced",
        message: `The pieces now come to S$${priced.total.toLocaleString("en-SG")}; the order was not placed.`,
        total: priced.total,
      },
      { status: 409 },
    );
  const who = await userOf(req);
  const email = who?.email ?? parsed.data.email ?? null;
  const { db } = getDb();
  // the same order placed twice (a retry) is the one order
  const kept = await db.select().from(orders).where(eq(orders.id, orderId));
  const key = kept[0]?.key ?? randomBytes(9).toString("base64url");
  const now = Date.now();
  if (!kept[0]) {
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
    `${origin}/rounded?checkout=${how}&order=${encodeURIComponent(orderId)}&key=${encodeURIComponent(key)}`;
  const session = await createSession({
    orderId,
    lines: priced.lines.map((l) => ({ name: l.name, sgd: l.sgd })),
    successUrl: back("success"),
    cancelUrl: back("cancelled"),
    ...(email ? { email } : {}),
  });
  if (!session)
    return NextResponse.json(
      {
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
