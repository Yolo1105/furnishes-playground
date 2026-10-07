import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  orderDeliveredMail,
  orderPaidMail,
  orderRefundedMail,
  type OrderMail,
} from "@/lib/mails";
import { canMove, type OrderStatus } from "@/lib/orders";
import { adminOf } from "@/lib/ops";

/**
 * An order moved on by the studio, from the operations page: paid when
 * payment came another way than Stripe, delivered once it is, cancelled
 * while it waits, refunded once paid; and the studio's note on it. The
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
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
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
  if (status) {
    const mail: OrderMail = {
      id: row.id,
      email: row.email,
      lines: row.lines as OrderMail["lines"],
      total: row.total,
      address: row.address as OrderMail["address"],
    };
    if (status === "paid") await orderPaidMail(mail);
    if (status === "fulfilled") await orderDeliveredMail(mail);
    if (status === "refunded") await orderRefundedMail(mail);
  }
  return NextResponse.json({
    id,
    status: status ?? row.status,
    note: note !== undefined ? note || null : row.note,
  });
}
