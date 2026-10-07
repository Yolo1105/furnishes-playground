import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { share } from "@/lib/db/schema";

/** one shared room: read by anyone with its id, taken down by its owner */
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const { db, ready } = getDb();
  await ready;
  const [row] = await db
    .select({ name: share.name, data: share.data, at: share.at })
    .from(share)
    .where(eq(share.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "gone" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const gone = await getDb()
    .db.delete(share)
    .where(and(eq(share.id, id), eq(share.userId, userId)))
    .returning({ id: share.id });
  if (gone.length === 0)
    return NextResponse.json({ error: "gone" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
