import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ContextBody } from "@/lib/context-body";
import { MESSAGE_MAX, refuse, sanitize } from "@/lib/guard";
import { LIMITS } from "@/lib/limits";
import {
  admit,
  anthropicKey,
  countTokens,
  fallback,
  MODEL,
  providerFailure,
} from "@/lib/model";
import type { Context } from "@/components/studio/eva-brain";
import { pickDocs } from "@/components/studio/design-docs";
import {
  contextText,
  layoutText,
  personaText,
  EVA_RULES,
  ReplySchema,
  toReply,
} from "@/components/studio/eva-prompt";

/**
 * Eva's turn, when a model is connected: the message, the last few turns
 * and the studio's facts go to Claude with the chatbot's rules, and one
 * answer of a fixed shape comes back as the studio's reply. Without an
 * API key the route says so (503) and the studio answers from its rule
 * brain instead; so it does on any failure here, and on a message that
 * tries to talk the model out of its rules (400), which the rules
 * answer without taking instruction. A caller gets a bounded number of
 * turns an hour and a bounded spend a day, counted in the cost log;
 * what the model says is read without any line that plays a role. The
 * studio's facts arrive in the shape of lib/context-body.
 */
export const runtime = "nodejs";

const Body = z.object({
  message: z.string().trim().min(1).max(MESSAGE_MAX),
  mode: z.enum(["ask", "furniture", "layout"]).default("ask"),
  thread: z
    .array(
      z.object({ who: z.enum(["you", "eva"]), text: z.string().max(4000) }),
    )
    .max(12),
  context: ContextBody,
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fallback("bad-request", 400);
  const { message, thread, context, mode } = parsed.data;
  const refused = refuse(message);
  if (refused) return fallback(refused, 400);
  if (!anthropicKey()) return fallback("no-key", 503);
  const door = await admit(req, "chat", LIMITS.chatTurnsPerHour);
  if ("refused" in door) return door.refused;
  const ctx = context as Context;

  const docs = pickDocs(message, ctx.prefs.style?.values ?? []);
  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(ReplySchema) },
      system: [
        { type: "text", text: EVA_RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextText(ctx) },
        ...(ctx.persona === "eva"
          ? []
          : [{ type: "text" as const, text: personaText(ctx.persona) }]),
        ...(docs.length
          ? [
              {
                type: "text" as const,
                text: `Design notes for this turn, from the studio's own guidance:\n\n${docs.map((d) => d.text).join("\n\n---\n\n")}`,
              },
            ]
          : []),
        ...(mode === "ask"
          ? []
          : [
              {
                type: "text" as const,
                text:
                  mode === "furniture"
                    ? "The person set the box to Furniture: answer with picks from the catalogue, up to three, with why each fits."
                    : layoutText(ctx),
              },
            ]),
      ],
      messages: [
        ...thread.map((t) => ({
          role: t.who === "you" ? ("user" as const) : ("assistant" as const),
          content: t.text,
        })),
        { role: "user", content: message },
      ],
    });
  } catch (error) {
    return providerFailure(error);
  }
  await countTokens(req, door.caller, "chat", response);
  if (response.stop_reason === "refusal" || !response.parsed_output)
    return fallback("no-answer", 502);
  const reply = toReply(response.parsed_output, ctx);
  return NextResponse.json({
    reply: { ...reply, text: sanitize(reply.text) },
    model: response.model,
  });
}
