import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { userIdOf } from "./auth";
import { costOfTokens, logCost, overCap, RATES, type CostKind } from "./cost";
import { str } from "./env";
import { allow, callerOf } from "./rate-limit";

/**
 * What the routes that call a provider (Eva's turn, a review, a room
 * item) share: the model's name, the keys, the one shape of a refusal
 * (`fallback: true` with a reason, so the studio answers from its own
 * rules), the door a caller passes through (a share of goes in a
 * window, and a day's spend), the mapping of a provider's failure to
 * a reason, and the counting of what an answer cost, which never
 * fails the answer it counts.
 */
export const MODEL = str("EVA_MODEL") || "claude-opus-5-5";
export const anthropicKey = () => str("ANTHROPIC_API_KEY");
export const falKey = () => str("FAL_KEY");

export const fallback = (reason: string, status: number) =>
  NextResponse.json({ fallback: true, reason }, { status });

/** the caller admitted, or the answer that turns them away */
export async function admit(
  req: Request,
  scope: string,
  max: number,
  windowMs?: number,
): Promise<{ caller: string } | { refused: NextResponse }> {
  // a signed-in caller is counted as themselves, not as whoever shares
  // their address; a guest as their address
  const caller = (await userIdOf(req)) ?? callerOf(req);
  if (!(await allow(`${scope}:${caller}`, max, windowMs)))
    return { refused: fallback("rate-limit", 429) };
  if (await overCap(caller)) return { refused: fallback("cost-cap", 429) };
  return { caller };
}

/** a provider's failure, as a reason the studio can act on */
export const providerFailure = (error: unknown) => {
  if (error instanceof Anthropic.RateLimitError)
    return fallback("rate-limit", 429);
  if (error instanceof Anthropic.AuthenticationError)
    return fallback("bad-key", 503);
  if (error instanceof Anthropic.APIError)
    return fallback(`api-${error.status}`, 502);
  return fallback("error", 502);
};

type Usage = {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

/** what a model's answer cost, counted in the log */
export const countTokens = (
  req: Request,
  caller: string,
  kind: CostKind,
  response: Usage,
) =>
  count(req, caller, {
    kind,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    usd: costOfTokens(
      response.usage.input_tokens,
      response.usage.output_tokens,
    ),
  });

/** what a generated item cost, counted in the log */
export const countItem = (req: Request, caller: string, model: string) =>
  count(req, caller, { kind: "item", model, usd: RATES.perItem });

async function count(
  req: Request,
  caller: string,
  entry: Omit<Parameters<typeof logCost>[0], "caller" | "userId">,
) {
  try {
    await logCost({ caller, userId: await userIdOf(req), ...entry });
  } catch (error) {
    console.warn("[cost] not counted", entry.kind, (error as Error).message);
  }
}
