import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { rateLimit } from "./db/schema";

/**
 * A bounded number of goes per caller in a window, counted in the
 * database, so a fleet of servers counts as one. The caller is who the
 * proxy says it is, and one name for everyone where there is no proxy.
 * The bound is for the deployed site: a development server, where
 * everyone is "local" and the test suites come round and round, counts
 * nothing. The window is fixed, not sliding: it starts with the first
 * go and the count starts again once it has passed.
 */
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
const BOUNDED = process.env.NODE_ENV === "production";

/** one more go for the key, if its window has room */
export async function allow(key: string, max: number, windowMs = HOUR) {
  if (!BOUNDED) return true;
  const { db, ready } = getDb();
  await ready;
  const now = Date.now();
  const row = (
    await db.select().from(rateLimit).where(eq(rateLimit.key, key))
  )[0];
  if (!row || now - row.windowStart >= windowMs) {
    await db
      .insert(rateLimit)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { windowStart: now, count: 1 },
      });
    return true;
  }
  if (row.count >= max) return false;
  await db
    .update(rateLimit)
    .set({ count: row.count + 1 })
    .where(eq(rateLimit.key, key));
  return true;
}

export const callerOf = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
