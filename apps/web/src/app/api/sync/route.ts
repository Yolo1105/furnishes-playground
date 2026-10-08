import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userIdOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sync } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { allow } from "@/lib/rate-limit";
import {
  BAD_REQUEST,
  readJson,
  SYNC_BYTES,
  SYNC_KINDS,
  SyncKinds,
} from "@/lib/schemas";

/**
 * The account's mirror of what the browser keeps: the projects (with
 * what was deleted), the orders, the generations, the guide's record
 * and the board, one row per kind. GET hands them back with the time
 * they were last taken; PUT takes the documents the browser sends
 * (the whole after a pull or a merge, else the ones that changed) and
 * keeps them, with the time. A PUT says the time it last saw
 * (`ifAt`): when the account has moved on since (another device
 * pushed), nothing is written and the account's copy comes back as
 * 409 for the browser to merge and push again, so two devices never
 * write over each other. Each document is checked against its shape
 * and the whole against its weight before anything is written. The
 * browser does the merging, so this stays a store of five documents
 * per person.
 */
export const runtime = "nodejs";

/** pushes an hour an account gets: a change a moment apart is one push */
const PUSHES_PER_HOUR = 120;

const Body = z.object({
  ifAt: z.number().nullable().optional(),
  ...(Object.fromEntries(
    SYNC_KINDS.map((k) => [k, SyncKinds[k].optional()]),
  ) as { [K in keyof typeof SyncKinds]: z.ZodOptional<(typeof SyncKinds)[K]> }),
});

const mirrorOf = async (userId: string) => {
  const rows = await getDb()
    .db.select()
    .from(sync)
    .where(eq(sync.userId, userId));
  return {
    data: Object.fromEntries(rows.map((r) => [r.kind, r.data])),
    at: rows.length ? Math.max(...rows.map((r) => r.at)) : null,
  };
};

export async function GET(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  return NextResponse.json(await mirrorOf(userId));
}

export async function PUT(req: Request) {
  const userId = await userIdOf(req);
  if (!userId) return NextResponse.json({ error: "sign in" }, { status: 401 });
  if (!(await allow(`sync:${userId}`, PUSHES_PER_HOUR)))
    return NextResponse.json({ error: "rate-limit" }, { status: 429 });
  const body = await readJson(req, SYNC_BYTES);
  if (body.error) return body.error;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  const given = SYNC_KINDS.filter((k) => parsed.data[k] !== undefined);
  for (const kind of given)
    if (JSON.stringify(parsed.data[kind]).length > LIMITS.documentBytes)
      return NextResponse.json({ error: `${kind} too large` }, { status: 413 });
  const { db } = getDb();
  const current = await mirrorOf(userId);
  if (
    parsed.data.ifAt !== undefined &&
    current.at !== null &&
    parsed.data.ifAt !== current.at
  )
    return NextResponse.json(current, { status: 409 });
  const at = Date.now();
  for (const kind of given) {
    const data = parsed.data[kind];
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
