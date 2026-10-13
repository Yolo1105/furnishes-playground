import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeSession,
  outcomeOf,
  parseEvent,
  sessionBody,
  sign,
  verifySignature,
} from "./stripe";

const SECRET = "whsec_test_secret";

describe("a Checkout Session", () => {
  it("charges each piece as a line in cents, in Singapore dollars", () => {
    const body = sessionBody({
      orderId: "FN-ABC12",
      lines: [
        { name: "Bookwall", sgd: 1230 },
        { name: "Storage bench", sgd: 440 },
      ],
      successUrl: "https://x/ok",
      cancelUrl: "https://x/no",
    });
    expect(body.get("mode")).toBe("payment");
    expect(body.get("client_reference_id")).toBe("FN-ABC12");
    expect(body.get("line_items[0][price_data][unit_amount]")).toBe("123000");
    expect(body.get("line_items[0][price_data][currency]")).toBe("sgd");
    expect(body.get("line_items[1][price_data][product_data][name]")).toBe(
      "Storage bench",
    );
    expect(body.get("line_items[1][quantity]")).toBe("1");
    expect(body.get("customer_email")).toBeNull();
  });
});

describe("the webhook's signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "x" });
  it("accepts Stripe's own signing", () => {
    expect(verifySignature(body, sign(body, SECRET), new Date(), SECRET)).toBe(
      null,
    );
  });
  it("refuses a wrong secret, a changed body, and a stale timestamp", () => {
    expect(verifySignature(body, sign(body, "other"), new Date(), SECRET)).toBe(
      "bad-signature",
    );
    expect(
      verifySignature(body + " ", sign(body, SECRET), new Date(), SECRET),
    ).toBe("bad-signature");
    const old = new Date(Date.now() - 10 * 60 * 1000);
    expect(
      verifySignature(body, sign(body, SECRET, old), new Date(), SECRET),
    ).toBe("stale");
    expect(verifySignature(body, null, new Date(), SECRET)).toBe(
      "no-signature",
    );
    expect(verifySignature(body, sign(body, SECRET), new Date(), "")).toBe(
      "no-secret",
    );
  });
});

describe("an event", () => {
  it("is matched on the session for a session event, on the intent for a charge", () => {
    const session = parseEvent(
      JSON.stringify({
        id: "evt_s",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_1",
            payment_intent: "pi_1",
            payment_status: "paid",
          },
        },
      }),
    )!;
    expect(session.ref).toBe("cs_1");
    expect(session.intentRef).toBe("pi_1");
    expect(outcomeOf(session)).toBe("paid");
    const charge = parseEvent(
      JSON.stringify({
        id: "evt_c",
        type: "charge.refunded",
        data: { object: { id: "ch_1", payment_intent: "pi_1" } },
      }),
    )!;
    expect(charge.ref).toBe("pi_1");
    expect(outcomeOf(charge)).toBe("refunded");
  });
  it("does nothing for an unpaid completion or an unknown kind", () => {
    const unpaid = parseEvent(
      JSON.stringify({
        id: "evt_u",
        type: "checkout.session.completed",
        data: { object: { id: "cs_2", payment_status: "unpaid" } },
      }),
    )!;
    expect(outcomeOf(unpaid)).toBe(null);
    const odd = parseEvent(
      JSON.stringify({
        id: "evt_o",
        type: "customer.created",
        data: { object: { id: "cus_1" } },
      }),
    )!;
    expect(outcomeOf(odd)).toBe(null);
    expect(parseEvent("not json")).toBe(null);
    expect(parseEvent(JSON.stringify({ id: "x" }))).toBe(null);
  });
});

describe("closing a payment page before its order is cancelled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  /** Stripe as a list of answers, one per call, in order */
  const stripeSays = (...answers: [number, object][]) => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${init.method ?? "GET"} ${url}`);
      const [status, body] = answers.shift()!;
      return new Response(JSON.stringify(body), { status });
    });
    return calls;
  };

  it("is closed when Stripe expires it", async () => {
    const calls = stripeSays([200, { status: "expired" }]);
    expect(await closeSession("cs_1")).toBe("expired");
    expect(calls).toEqual([
      "POST https://api.stripe.com/v1/checkout/sessions/cs_1/expire",
    ]);
  });

  it("says a page paid first, or one already lapsed, by reading it", async () => {
    stripeSays([400, { error: {} }], [200, { status: "complete" }]);
    expect(await closeSession("cs_2")).toBe("complete");
    stripeSays([400, { error: {} }], [200, { status: "expired" }]);
    expect(await closeSession("cs_3")).toBe("expired");
  });

  it("cannot say without an answer or a key", async () => {
    stripeSays([500, {}], [500, {}]);
    expect(await closeSession("cs_4")).toBeNull();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await closeSession("cs_5")).toBeNull();
  });
});
