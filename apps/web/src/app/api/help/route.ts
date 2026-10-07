import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { userOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { helpRequest } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { helpReceivedMail } from "@/lib/mails";
import { allow, callerOf, DAY } from "@/lib/rate-limit";

/**
 * A word to the studio: a problem, an idea or a question, from the
 * gear's Feedback. Kept as a row with who sent it (the account, or the
 * email given) and where they were, and answered with a mail that says
 * so. Ten a day per caller.
 */
export const runtime = "nodejs";

export const HELP_CATEGORIES = ["problem", "idea", "question"] as const;

const Body = z.object({
  category: z.enum(HELP_CATEGORIES),
  message: z.string().trim().min(5).max(4000),
  context: z.string().trim().max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  const who = await userOf(req);
  const email = who?.email ?? parsed.data.email;
  if (!email) return NextResponse.json({ error: "email" }, { status: 400 });
  if (!(await allow(`help:${callerOf(req)}`, LIMITS.helpPerDay, DAY)))
    return NextResponse.json({ error: "rate-limit" }, { status: 429 });
  const id = randomBytes(8).toString("base64url");
  await getDb()
    .db.insert(helpRequest)
    .values({
      id,
      userId: who?.id ?? null,
      email,
      category: parsed.data.category,
      message: parsed.data.message,
      context: parsed.data.context ?? null,
      at: Date.now(),
    });
  await helpReceivedMail(email, parsed.data.message);
  return NextResponse.json({ id });
}
