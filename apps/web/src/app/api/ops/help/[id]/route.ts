import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { helpRequest } from "@/lib/db/schema";
import { adminOf } from "@/lib/ops";
import { BAD_REQUEST } from "@/lib/schemas";

/**
 * A word to the studio marked answered (or not) from the operations
 * page; the answer itself goes by mail from the studio's own mailbox.
 * Anyone who is not an admin gets 404.
 */
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({ answered: z.boolean() });

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await adminOf(req)))
    return NextResponse.json({ error: "not here" }, { status: 404 });
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(BAD_REQUEST, { status: 400 });
  const answeredAt = parsed.data.answered ? Date.now() : null;
  const moved = await getDb()
    .db.update(helpRequest)
    .set({ answeredAt })
    .where(eq(helpRequest.id, id))
    .returning({ id: helpRequest.id });
  if (moved.length === 0)
    return NextResponse.json({ error: "not here" }, { status: 404 });
  return NextResponse.json({ id, answeredAt });
}
