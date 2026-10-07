import { asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { waitlist } from "@/lib/db/schema";
import { waitlistNoteMail } from "@/lib/mails";
import { adminOf } from "@/lib/ops";

/**
 * The waitlist, for the studio: GET hands it over as a CSV file (the
 * address and when it joined, in Singapore's time); POST sends the one
 * note that ordering is open to everyone who has not had it, and marks
 * each so nobody is written to twice. Anyone who is not an admin gets
 * 404.
 */
export const runtime = "nodejs";

const when = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export async function GET(req: Request) {
  if (!(await adminOf(req)))
    return NextResponse.json({ error: "not here" }, { status: 404 });
  const { db, ready } = getDb();
  await ready;
  const rows = await db.select().from(waitlist).orderBy(asc(waitlist.at));
  const csv = [
    "email,joined,notified",
    ...rows.map(
      (r) =>
        `${r.email},${when.format(r.at)},${r.notifiedAt ? when.format(r.notifiedAt) : ""}`,
    ),
  ].join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="waitlist.csv"',
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  if (!(await adminOf(req)))
    return NextResponse.json({ error: "not here" }, { status: 404 });
  const { db, ready } = getDb();
  await ready;
  const due = await db
    .select({ email: waitlist.email })
    .from(waitlist)
    .where(isNull(waitlist.notifiedAt))
    .orderBy(asc(waitlist.at));
  let sent = 0;
  for (const { email } of due) {
    if ((await waitlistNoteMail(email)) === "unsent") continue;
    await db
      .update(waitlist)
      .set({ notifiedAt: Date.now() })
      .where(eq(waitlist.email, email));
    sent += 1;
  }
  return NextResponse.json({ sent, due: due.length });
}
