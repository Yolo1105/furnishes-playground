import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { costLog, rateLimit } from "@/lib/db/schema";
import { DAY } from "@/lib/rate-limit";

/**
 * The nightly sweep, run by the host's cron (vercel.json) with the
 * CRON_SECRET it was given, as a bearer token: a rate-limit window
 * older than a day has passed, and a cost row older than ninety days
 * has been in every bill it will be in; both go. Orders, payment
 * events, accounts and what people wrote are never touched here.
 * Without the secret set the route does nothing and says so; with a
 * wrong one it says 401.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP_COSTS = 90 * DAY;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret)
    return NextResponse.json({ error: "no cron secret" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { db, ready } = getDb();
  await ready;
  const now = Date.now();
  const windows = await db
    .delete(rateLimit)
    .where(lt(rateLimit.windowStart, now - DAY))
    .returning({ key: rateLimit.key });
  const costs = await db
    .delete(costLog)
    .where(lt(costLog.at, now - KEEP_COSTS))
    .returning({ id: costLog.id });
  return NextResponse.json({
    ok: true,
    at: new Date(now).toISOString(),
    removed: { rateLimits: windows.length, costs: costs.length },
  });
}
