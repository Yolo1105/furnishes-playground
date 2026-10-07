import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { rateLimit } from "./db/schema";
import { IS_PRODUCTION } from "./env";

/**
 * A bounded number of goes per caller in a window, counted in the
 * database, so a fleet of servers counts as one. The caller is who the
 * proxy says it is, and one name for everyone where there is no proxy.
 * The bound is for the deployed site: a development server, where
 * everyone is "local" and the test suites come round and round, counts
 * nothing. The window is fixed, not sliding: it starts with the first
 * go and the count starts again once it has passed. One statement
 * does the counting, so two goes at once cannot both slip under.
 */
const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** one more go for the key, if its window has room */
export async function allow(key: string, max: number, windowMs = HOUR) {
  if (!IS_PRODUCTION) return true;
  const { db, ready } = getDb();
  await ready;
  const now = Date.now();
  // a window that has passed starts again at one; otherwise one more
  const [row] = await db
    .insert(rateLimit)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${now} - ${rateLimit.windowStart} >= ${windowMs} then 1 else ${rateLimit.count} + 1 end`,
        windowStart: sql`case when ${now} - ${rateLimit.windowStart} >= ${windowMs} then ${now} else ${rateLimit.windowStart} end`,
      },
    })
    .returning({ count: rateLimit.count });
  return (row?.count ?? 1) <= max;
}

export const callerOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
