import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sync } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { BAD_REQUEST } from "@/lib/schemas";

/**
 * The account's mirror of what the browser keeps: the projects (with
 * what was deleted), the orders, the generations, the guide's record
 * and the board, one row per kind. GET hands them back; PUT takes the merged
 * whole from the browser and keeps it, with the time. The browser does
 * the merging, so this stays a store of five documents per person.
 */
export const runtime = "nodejs";

const KINDS = ["projects", "orders", "generations", "guides", "board"] as const;

const Body = z.object(
  Object.fromEntries(KINDS.map((k) => [k, z.unknown().optional()])) as Record<
    (typeof KINDS)[number],
    z.ZodOptional<z.ZodUnknown>
  >,
);

export async function GET(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const rows = await getDb()
    .db.select()
    .from(sync)
    .where(eq(sync.userId, userId));
  return NextResponse.json({
    data: Object.fromEntries(rows.map((r) => [r.kind, r.data])),
    at: rows.length ? Math.max(...rows.map((r) => r.at)) : null,
  });
}

export async function PUT(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  const at = Date.now();
  const { db } = getDb();
  for (const kind of KINDS) {
    const data = parsed.data[kind];
    if (data === undefined) continue;
    if (JSON.stringify(data).length > LIMITS.documentBytes)
      return NextResponse.json({ error: `${kind} too large` }, { status: 413 });
    await db
      .insert(sync)
      .values({ userId, kind, data, at })
      .onConflictDoUpdate({
        target: [sync.userId, sync.kind],
        set: { data, at },
      });
  }
  return NextResponse.json({ at });
}
