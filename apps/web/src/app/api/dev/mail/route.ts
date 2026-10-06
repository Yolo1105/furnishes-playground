import { NextResponse } from "next/server";
import { keptMail } from "@/lib/mail";

/** the mails a development server kept instead of sending, for the
    tests to follow their links; nothing on a hosted run */
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "not here" }, { status: 404 });
  const to = new URL(req.url).searchParams.get("to");
  const mails = keptMail().filter((m) => !to || m.to === to);
  return NextResponse.json({ mails });
}
