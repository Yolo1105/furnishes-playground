import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { canMove, type OrderStatus } from "@/lib/orders";
import { sessionUrl } from "@/lib/stripe";

/**
 * One order as the server has it, for whoever can show it is theirs:
 * the signed-in owner, or anyone with its key (the link back from
 * paying carries it). GET reads where it stands, with the payment page
 * to go back to while it is still open; PATCH cancels it while it is
 * awaiting payment.
 */
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ownerOf = async (req: Request, id: string) => {
  const row = (
    await getDb().db.select().from(orders).where(eq(orders.id, id))
  )[0];
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
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!canMove(row.status as OrderStatus, parsed.data.status))
    return NextResponse.json(
      { error: `an order ${row.status} cannot be cancelled` },
      { status: 409 },
    );
  await getDb()
    .db.update(orders)
    .set({ status: parsed.data.status, updatedAt: Date.now() })
    .where(eq(orders.id, id));
  return NextResponse.json({ id, status: parsed.data.status });
}
