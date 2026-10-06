import { and, eq, gte, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { costLog } from "./db/schema";

/**
 * What the providers cost, counted as it is spent: every model turn and
 * every generated item is a row with its tokens and its dollars, and a
 * caller or the whole site that has spent its day's share is told so
 * before the next call is made. The rates are estimates, set by the
 * environment (dollars per million tokens in and out, dollars per
 * generated item); a cap of 0 is no cap.
 */
const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
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

export type CostKind = "chat" | "item";

export const costOfTokens = (inTokens: number, outTokens: number) =>
  (inTokens * RATES.perMillionIn + outTokens * RATES.perMillionOut) / 1e6;

const dayStart = (now = new Date()) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

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
