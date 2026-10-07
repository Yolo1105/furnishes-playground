import { and, eq, gte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { costLog } from "./db/schema";
import { num } from "./env";

/**
 * What the providers cost, counted as it is spent: every model turn and
 * every generated item is a row with its tokens and its dollars, and a
 * caller or the whole site that has spent its day's share is told so
 * before the next call is made. The rates are estimates, set by the
 * environment (dollars per million tokens in and out, dollars per
 * generated item); a cap of 0 is no cap.
 */
/** US dollars, as the providers bill */
export const RATES = {
  perMillionIn: num("EVA_USD_PER_M_IN", 3),
  perMillionOut: num("EVA_USD_PER_M_OUT", 15),
  perItem: num("FAL_USD_PER_ITEM", 0.25),
};
export const DAILY_USD = {
  caller: num("DAILY_USD_PER_CALLER", 2),
  site: num("DAILY_USD", 50),
};

export type CostKind = "chat" | "item" | "review";

export const costOfTokens = (inTokens: number, outTokens: number) =>
  (inTokens * RATES.perMillionIn + outTokens * RATES.perMillionOut) / 1e6;

export const dayStart = (now = new Date()) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
export const monthStart = (now = new Date()) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

/** the dollars and the calls since a moment, by what they were for */
export async function spentByKind(since: number) {
  const { db, ready } = getDb();
  await ready;
  const rows = await db
    .select({
      kind: costLog.kind,
      usd: sql<number>`coalesce(sum(${costLog.usd}), 0)`,
      calls: sql<number>`count(*)::int`,
    })
    .from(costLog)
    .where(gte(costLog.at, since))
    .groupBy(costLog.kind);
  return rows.map((r) => ({
    kind: r.kind as CostKind,
    usd: Number(r.usd),
    calls: Number(r.calls),
  }));
}

/** the dollars spent since midnight UTC, by one caller or by everyone */
export async function spentToday(caller?: string) {
  const { db, ready } = getDb();
  await ready;
  const since = gte(costLog.at, dayStart());
  const rows = await db
    .select({ usd: sql<number>`coalesce(sum(${costLog.usd}), 0)` })
    .from(costLog)
    .where(caller ? and(since, eq(costLog.caller, caller)) : since);
  return Number(rows[0]?.usd ?? 0);
}

/** whether a caller, or the site, has spent its day's share */
export async function overCap(caller: string) {
  if (DAILY_USD.caller > 0 && (await spentToday(caller)) >= DAILY_USD.caller)
    return true;
  return DAILY_USD.site > 0 && (await spentToday()) >= DAILY_USD.site;
}

export async function logCost(entry: {
  caller: string;
  userId?: string | null;
  kind: CostKind;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  usd: number;
}) {
  const { db, ready } = getDb();
  await ready;
  await db.insert(costLog).values({
    id: randomBytes(8).toString("base64url"),
    caller: entry.caller,
    userId: entry.userId ?? null,
    kind: entry.kind,
    model: entry.model ?? null,
    inputTokens: entry.inputTokens ?? 0,
    outputTokens: entry.outputTokens ?? 0,
    usd: entry.usd,
    at: Date.now(),
  });
}
