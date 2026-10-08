import { and, isNull, lt, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  costLog,
  orders,
  rateLimit,
  session,
  verification,
} from "@/lib/db/schema";
import { str } from "@/lib/env";
import { DAY } from "@/lib/rate-limit";

/**
 * The nightly sweep, run by the host's cron (vercel.json) with the
 * CRON_SECRET it was given, as a bearer token: a rate-limit window
 * older than a day has passed, a cost row older than ninety days has
 * been in every bill it will be in, a session or a mail's link past
 * its time is no way in any more; all go. An order placed offline
 * (no payment page ever opened) and left thirty days is cancelled, so
 * the ledger does not fill with orders nobody meant. Paid orders,
 * payment events, accounts and what people wrote are never touched.
 * Without the secret set the route does nothing and says so; with a
 * wrong one it says 401.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEP_COSTS = 90 * DAY;
/** how long an order placed offline waits before it is let go */
const KEEP_OFFLINE = 30 * DAY;

export async function GET(req: Request) {
  const secret = str("CRON_SECRET");
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
  const sessions = await db
    .delete(session)
    .where(lt(session.expiresAt, new Date(now)))
    .returning({ id: session.id });
  const links = await db
    .delete(verification)
    .where(lt(verification.expiresAt, new Date(now)))
    .returning({ id: verification.id });
  const stale = await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: now })
    .where(
      and(
        eq(orders.status, "pending_payment"),
        isNull(orders.paymentRef),
        lt(orders.at, now - KEEP_OFFLINE),
      ),
    )
    .returning({ id: orders.id });
  return NextResponse.json({
    ok: true,
    at: new Date(now).toISOString(),
    removed: {
      rateLimits: windows.length,
      costs: costs.length,
      sessions: sessions.length,
      links: links.length,
    },
    cancelled: stale.length,
  });
}
