import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { allow, callerOf } from "@/lib/rate-limit";
import { BAD_REQUEST, EmailField, readJson } from "@/lib/schemas";

/**
 * The waitlist: an email, kept once. The landing's "Be first through
 * the door" posts here; the same email again is said to be there
 * already. A caller gets LIMITS.waitlistPerHour tries an hour.
 */
export const runtime = "nodejs";

const Body = z.object({ email: EmailField });

export async function POST(req: Request) {
  const body = await readJson(req);
  if (body.error) return body.error;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  if (!(await allow(`waitlist:${callerOf(req)}`, LIMITS.waitlistPerHour)))
    return NextResponse.json({ error: "rate-limit" }, { status: 429 });
  const { db, ready } = getDb();
  await ready;
  const added = await db
    .insert(waitlist)
    .values({ email: parsed.data.email, at: Date.now() })
    .onConflictDoNothing()
    .returning({ email: waitlist.email });
  if (added.length === 0)
    return NextResponse.json({ error: "duplicate" }, { status: 409 });
  return NextResponse.json({ joined: true });
}
