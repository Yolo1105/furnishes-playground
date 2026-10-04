import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Paying for an order. No payment provider is wired in this build: with
 * none configured the route says so ("offline") and the order waits at
 * "awaiting payment" in the studio; with a provider key present but no
 * provider code to use it, it says that too (501) rather than pretend.
 */
export const runtime = "nodejs";

const Body = z.object({
  orderId: z.string().min(1).max(40),
  total: z.number().nonnegative(),
  currency: z.literal("SGD"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ mode: "bad-request" }, { status: 400 });
  if (!process.env.STRIPE_SECRET_KEY)
    return NextResponse.json({
      mode: "offline",
      message:
        "Payment is not connected on this server. The order is kept as awaiting payment.",
    });
  return NextResponse.json(
    {
      mode: "unavailable",
      message:
        "A payment key is set, but no payment provider is wired in this build.",
    },
    { status: 501 },
  );
}
