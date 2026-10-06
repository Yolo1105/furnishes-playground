import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { helpRequest, orders, share, sync, user } from "@/lib/db/schema";

/**
 * Everything the account holds, as one JSON file to keep: who you are,
 * the mirror of the browser (projects, orders, generations, the guide's
 * record), the rooms shared by link, the orders placed, and what was
 * written to the studio. From the gear's Account, "Download my data".
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const { db } = getDb();
  const [who] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId));
  const mirror = await db.select().from(sync).where(eq(sync.userId, userId));
  const shares = await db
    .select({ id: share.id, name: share.name, at: share.at, data: share.data })
    .from(share)
    .where(eq(share.userId, userId));
  const placed = await db
    .select({
      id: orders.id,
      status: orders.status,
      lines: orders.lines,
      total: orders.total,
      address: orders.address,
      at: orders.at,
    })
    .from(orders)
    .where(eq(orders.userId, userId));
  const written = await db
    .select({
      category: helpRequest.category,
      message: helpRequest.message,
      at: helpRequest.at,
    })
    .from(helpRequest)
    .where(eq(helpRequest.userId, userId));
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      account: who,
      mirror: Object.fromEntries(mirror.map((r) => [r.kind, r.data])),
      sharedRooms: shares,
      orders: placed,
      feedback: written,
    },
    null,
    2,
  );
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="furnishes-account.json"',
    },
  });
}
