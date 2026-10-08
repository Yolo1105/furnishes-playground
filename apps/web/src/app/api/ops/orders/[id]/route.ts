import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { orderMailOf, orderMovedMail } from "@/lib/mails";
import { canMove, type OrderStatus } from "@/lib/orders";
import { log } from "@/lib/log";
import { adminOf } from "@/lib/ops";
import { BAD_REQUEST, readJson } from "@/lib/schemas";
import { expireSession } from "@/lib/stripe";

/**
 * An order moved on by the studio, from the operations page: paid when
 * payment came another way than Stripe, delivered once it is, cancelled
 * while it waits (its payment page closed with it), refunded once the
 * money went back in Stripe's own dashboard (the move here records it
 * and writes to the buyer; it moves no money); and the studio's note
 * on it. The
 * move follows the same rule as the webhook's (lib/orders), and the
 * buyer is written to when it is paid, delivered or refunded. Anyone
 * who is not an admin gets 404, as if the route were not here.
 */
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  status: z.enum(["paid", "fulfilled", "cancelled", "refunded"]).optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await adminOf(req)))
    return NextResponse.json({ error: "not here" }, { status: 404 });
  const { id } = await params;
  const body = await readJson(req);
  if (body.error) return body.error;
  const parsed = Patch.safeParse(body.value);
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  const { db } = getDb();
  const row = (await db.select().from(orders).where(eq(orders.id, id)))[0];
  if (!row) return NextResponse.json({ error: "not here" }, { status: 404 });
  const { status, note } = parsed.data;
  if (status && !canMove(row.status as OrderStatus, status))
    return NextResponse.json(
      { error: `an order ${row.status} cannot be ${status}` },
      { status: 409 },
    );
  await db
    .update(orders)
    .set({
      ...(status ? { status } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(orders.id, id));
  if (status === "cancelled" && row.paymentRef)
    if (!(await expireSession(row.paymentRef)))
      log.warn("stripe.expire.missed", { orderId: id });
  if (status) {
    log.info("order.moved", { orderId: id, from: row.status, to: status });
    await orderMovedMail(orderMailOf(row), status);
  }
  return NextResponse.json({
    id,
    status: status ?? row.status,
    note: note !== undefined ? note || null : row.note,
  });
}
