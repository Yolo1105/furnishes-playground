import { NextResponse } from "next/server";
import { z } from "zod";
import { userOf } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { helpRequest } from "@/lib/db/schema";
import { HELP_CATEGORIES, HELP_MAX, HELP_MIN } from "@/lib/help";
import { randomId } from "@/lib/id";
import { LIMITS } from "@/lib/limits";
import { helpReceivedMail } from "@/lib/mails";
import { allow, callerOf, DAY } from "@/lib/rate-limit";
import { BAD_REQUEST, EmailField } from "@/lib/schemas";

/**
 * A word to the studio: a problem, an idea or a question, from the
 * gear's Feedback or the help page's Ask us (lib/help-client). Kept as
 * a row with who sent it (the account, or the email given) and where
 * they were, and answered with a mail that says so. A caller gets
 * LIMITS.helpPerDay a day.
 */
export const runtime = "nodejs";

const Body = z.object({
  category: z.enum(HELP_CATEGORIES),
  message: z.string().trim().min(HELP_MIN).max(HELP_MAX),
  context: z.string().trim().max(200).optional(),
  email: EmailField.optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  const who = await userOf(req);
  const email = who?.email ?? parsed.data.email;
  if (!email) return NextResponse.json({ error: "email" }, { status: 400 });
  if (!(await allow(`help:${callerOf(req)}`, LIMITS.helpPerDay, DAY)))
    return NextResponse.json({ error: "rate-limit" }, { status: 429 });
  const id = randomId();
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
