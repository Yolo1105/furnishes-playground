import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { share } from "@/lib/db/schema";
import { randomId } from "@/lib/id";
import { LIMITS } from "@/lib/limits";
import { BAD_REQUEST } from "@/lib/schemas";

/**
 * Shared rooms: a copy of a project (its room and pieces, never Eva's
 * side) kept under a short id, for anyone with the link to look at.
 * POST makes one for the signed-in person; GET lists theirs. The copy
 * itself is read at api/share/[id] by anyone.
 */
export const runtime = "nodejs";

/** bytes of JSON a shared room may hold */
const LIMIT = LIMITS.documentBytes;
const Body = z.object({
  name: z.string().trim().min(1).max(80),
  data: z.unknown(),
});

export async function GET(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const rows = await getDb()
    .db.select({ id: share.id, name: share.name, at: share.at })
    .from(share)
    .where(eq(share.userId, userId))
    .orderBy(desc(share.at));
  return NextResponse.json({ shares: rows });
}

export async function POST(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  if (JSON.stringify(parsed.data.data).length > LIMIT)
    return NextResponse.json({ error: "too large" }, { status: 413 });
  // short, as the tail of a link
  const id = randomId(6);
  await getDb().db.insert(share).values({
    id,
    userId,
    name: parsed.data.name,
    data: parsed.data.data,
    at: Date.now(),
  });
  return NextResponse.json({ id });
}
