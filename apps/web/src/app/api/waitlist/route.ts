import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { allow, callerOf } from "@/lib/rate-limit";

/**
 * The waitlist: an email, kept once. The landing's "Be first through
 * the door" posts here; the same email again is said to be there
 * already. Ten tries an hour per caller.
 */
export const runtime = "nodejs";

const PER_HOUR = 10;
const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!(await allow(`waitlist:${callerOf(req)}`, PER_HOUR)))
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
