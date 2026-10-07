import { createHmac, timingSafeEqual } from "node:crypto";
import { str } from "./env";
import { CURRENCY } from "./money";

/**
 * Stripe, over its REST API with fetch: a hosted Checkout Session to
 * send the shopper to, so no card detail ever reaches this server, and
 * the webhook that says what became of it, checked by hand. The keys
 * come from STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET; without the
 * first there is no payment, and the checkout route says so.
 */
const API = "https://api.stripe.com/v1";
/** Stripe rejects replays older than five minutes; so does this */
const TOLERANCE_S = 300;

export const stripeKey = () => str("STRIPE_SECRET_KEY");
export const webhookSecret = () => str("STRIPE_WEBHOOK_SECRET");

type ChargeLine = { name: string; sgd: number };

export type SessionInput = {
  orderId: string;
  lines: ChargeLine[];
  /** where the shopper lands after paying, and after giving up */
  successUrl: string;
  cancelUrl: string;
  email?: string;
};

/** the form a Checkout Session is made from. Stripe charges the sum of
    the line items, each in cents; the order's pieces are the lines */
export const sessionBody = (input: SessionInput) => {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.orderId,
    "metadata[order_id]": input.orderId,
    "payment_intent_data[metadata][order_id]": input.orderId,
    "automatic_tax[enabled]": "false",
  });
  if (input.email) body.set("customer_email", input.email);
  input.lines.forEach((l, i) => {
    body.set(`line_items[${i}][quantity]`, "1");
    body.set(`line_items[${i}][price_data][currency]`, CURRENCY.toLowerCase());
    body.set(
      `line_items[${i}][price_data][unit_amount]`,
      String(Math.round(l.sgd * 100)),
    );
    body.set(`line_items[${i}][price_data][product_data][name]`, l.name);
  });
  return body;
};

type Session = { id: string; url: string };

/** a hosted Checkout Session for an order; the order's id is the
    idempotency key, so the same order asked twice is one session */
export async function createSession(
  input: SessionInput,
): Promise<Session | null> {
  const key = stripeKey();
  if (!key) return null;
  try {
    const res = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `order-${input.orderId}`,
      },
      body: sessionBody(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; url?: string };
    return data.id && data.url ? { id: data.id, url: data.url } : null;
  } catch {
    return null;
  }
}

/** the hosted page of a session still open, to send the shopper back
    to; nothing once it has lapsed or been paid */
export async function sessionUrl(id: string): Promise<string | null> {
  const key = stripeKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${API}/checkout/sessions/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; url?: string };
    return data.status === "open" && data.url ? data.url : null;
  } catch {
    return null;
  }
}

export type Rejection =
  "no-secret" | "no-signature" | "bad-signature" | "stale";

/** the signature header, `t=<unix>,v1=<hex>`, checked against the raw
    body: the HMAC in constant time, the timestamp within tolerance */
export function verifySignature(
  rawBody: string,
  header: string | null,
  now = new Date(),
  secret = webhookSecret(),
): Rejection | null {
  if (!secret) return "no-secret";
  if (!header) return "no-signature";
  const parts = new Map<string, string>();
  for (const seg of header.split(",")) {
    const [k, v] = seg.split("=");
    if (k && v && !parts.has(k.trim())) parts.set(k.trim(), v.trim());
  }
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return "no-signature";
  const ts = Number(t);
  if (!Number.isFinite(ts)) return "bad-signature";
  if (Math.abs(Math.floor(now.getTime() / 1000) - ts) > TOLERANCE_S)
    return "stale";
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"),
    "hex",
  );
  const given = Buffer.from(v1, "hex");
  if (
    expected.length === 0 ||
    expected.length !== given.length ||
    !timingSafeEqual(expected, given)
  )
    return "bad-signature";
  return null;
}

/** a signature as Stripe would sign it, for the tests and a dry run */
export const sign = (rawBody: string, secret: string, now = new Date()) => {
  const t = Math.floor(now.getTime() / 1000);
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
};

export type Event = {
  id: string;
  kind: string;
  /** the reference the order is matched on: the session's id for a
      session event, the intent's for an intent or charge event */
  ref: string;
  intentRef: string | null;
  /** Stripe's own paid or unpaid for a session */
  paymentStatus: string | null;
};

/** the fields of a webhook payload the order's state needs */
export function parseEvent(rawBody: string): Event | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const e = parsed as {
    id?: unknown;
    type?: unknown;
    data?: {
      object?: {
        id?: unknown;
        payment_intent?: unknown;
        payment_status?: unknown;
      };
    };
  };
  const id = typeof e.id === "string" ? e.id : "";
  const kind = typeof e.type === "string" ? e.type : "";
  const o = e.data?.object;
  const objectId = typeof o?.id === "string" ? o.id : "";
  const intent =
    typeof o?.payment_intent === "string" ? o.payment_intent : null;
  const session = kind.startsWith("checkout.session.");
  const ref =
    session || kind.startsWith("payment_intent.")
      ? objectId
      : (intent ?? objectId);
  if (!id || !kind || !ref) return null;
  return {
    id,
    kind,
    ref,
    intentRef: session ? intent : null,
    paymentStatus:
      session && typeof o?.payment_status === "string"
        ? o.payment_status
        : null,
  };
}

/** what an event does to an order: paid, cancelled (the session lapsed),
    refunded, or nothing */
export const outcomeOf = (
  e: Event,
): "paid" | "cancelled" | "refunded" | null => {
  switch (e.kind) {
    case "checkout.session.completed":
      return e.paymentStatus === "unpaid" ? null : "paid";
    case "checkout.session.async_payment_succeeded":
    case "payment_intent.succeeded":
      return "paid";
    case "checkout.session.expired":
      return "cancelled";
    case "charge.refunded":
      return "refunded";
    default:
      return null;
  }
};
