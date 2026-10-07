import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { LIMITS } from "@/lib/limits";
import { missingForHosting, services } from "@/lib/services";

/**
 * Is the backend up, and which of it: the database reached and
 * migrated, and every service behind the studio as on or off, with
 * what a hosted deployment would still be missing. No secret is ever
 * in the answer. 200 when the database answers, 503 when it does not;
 * a monitor can read the status alone.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const at = new Date().toISOString();
  const s = services();
  try {
    const { db, ready } = getDb();
    await ready;
    // the two drivers answer in two shapes: rows on a field, or rows
    const res: unknown = await db.execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    const rows = (
      Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
    ) as { n?: number | string }[];
    return NextResponse.json(
      {
        ok: true,
        at,
        database: { kind: s.database, migrations: Number(rows[0]?.n ?? 0) },
        services: s,
        limits: LIMITS,
        missingForHosting: missingForHosting(s),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        at,
        database: { kind: s.database, error: (error as Error).message },
        services: s,
        missingForHosting: missingForHosting(s),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
