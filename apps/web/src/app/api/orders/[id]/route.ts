import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { canMove, type OrderStatus } from "@/lib/orders";
import { log } from "@/lib/log";
import { BAD_REQUEST, readJson } from "@/lib/schemas";
import { expireSession, sessionUrl } from "@/lib/stripe";

/**
 * One order as the server has it, for whoever can show it is theirs:
 * the signed-in owner, or anyone with its key (the link back from
 * paying carries it). GET reads where it stands, its pieces and where
 * it goes, with the payment page to go back to while it is still
 * open; PATCH cancels it while it is awaiting payment, and closes its
 * payment page with it, so it cannot be paid after all.
 */
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ownerOf = async (req: Request, id: string) => {
  const { db, ready } = getDb();
  await ready;
  const row = (await db.select().from(orders).where(eq(orders.id, id)))[0];
  if (!row) return null;
  const key = new URL(req.url).searchParams.get("key");
  if (key && key === row.key) return row;
  const userId = await userIdOf(req);
  return userId && row.userId === userId ? row : null;
};

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const row = await ownerOf(req, id);
  if (!row) return NextResponse.json({ error: "not yours" }, { status: 404 });
  const payUrl =
    row.status === "pending_payment" && row.paymentRef
      ? await sessionUrl(row.paymentRef)
      : null;
  return NextResponse.json({
    id: row.id,
    status: row.status,
    total: row.total,
    lines: row.lines,
    address: row.address,
    at: row.at,
    updatedAt: row.updatedAt,
    ...(payUrl ? { payUrl } : {}),
  });
}

const Patch = z.object({ status: z.literal("cancelled") });

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const row = await ownerOf(req, id);
  if (!row) return NextResponse.json({ error: "not yours" }, { status: 404 });
  const body = await readJson(req);
  if (body.error) return body.error;
  const parsed = Patch.safeParse(body.value);
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  if (!canMove(row.status as OrderStatus, parsed.data.status))
    return NextResponse.json(
      { error: `an order ${row.status} cannot be cancelled` },
      { status: 409 },
    );
  await getDb()
    .db.update(orders)
    .set({ status: parsed.data.status, updatedAt: Date.now() })
    .where(eq(orders.id, id));
  if (row.paymentRef && !(await expireSession(row.paymentRef)))
    log.warn("stripe.expire.missed", { orderId: id });
  log.info("order.cancelled", { orderId: id, by: "shopper" });
  return NextResponse.json({ id, status: parsed.data.status });
}
