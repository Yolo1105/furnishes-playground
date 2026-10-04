import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Context } from "@/components/studio/eva-brain";
import { pickDocs } from "@/components/studio/design-docs";
import {
  contextText,
  EVA_RULES,
  ReplySchema,
  toReply,
} from "@/components/studio/eva-prompt";

/**
 * Eva's turn, when a model is connected: the message, the last few turns
 * and the studio's facts go to Claude with the chatbot's rules, and one
 * answer of a fixed shape comes back as the studio's reply. Without an
 * API key the route says so (503) and the studio answers from its rule
 * brain instead; so it does on any failure here. A browser gets a
 * bounded number of turns an hour.
 */
export const runtime = "nodejs";

const MODEL = process.env.EVA_MODEL ?? "claude-opus-5-5";
const TURNS_PER_HOUR = 40;
const HOUR = 60 * 60 * 1000;

const Body = z.object({
  message: z.string().trim().min(1).max(2000),
  mode: z.enum(["ask", "furniture", "layout"]).default("ask"),
  thread: z
    .array(
      z.object({ who: z.enum(["you", "eva"]), text: z.string().max(4000) }),
    )
    .max(12),
  context: z.object({
    room: z.object({
      id: z.enum([
        "living",
        "master",
        "bedroom-1",
        "bedroom-2",
        "kitchen",
        "study",
      ]),
      flat: z.string().max(20),
      width: z.number(),
      depth: z.number(),
      height: z.number(),
      sized: z.boolean(),
    }),
    pieces: z
      .array(
        z.object({
          id: z.string(),
          name: z.string().max(80),
          kind: z.enum(["piece", "decor", "fixed"]),
          category: z.enum([
            "components",
            "storage",
            "seating",
            "tables",
            "lighting",
            "decor",
            "architecture",
          ]),
          price: z.number().optional(),
        }),
      )
      .max(200),
    cart: z.array(z.string()).max(200),
    prefs: z.record(
      z.string(),
      z.object({
        values: z.array(z.string()),
        budget: z.tuple([z.number(), z.number()]).optional(),
      }),
    ),
    exploration: z.boolean(),
  }),
});

const seen = new Map<string, number[]>();
const allowed = (key: string) => {
  const now = Date.now();
  const hits = (seen.get(key) ?? []).filter((t) => now - t < HOUR);
  if (hits.length >= TURNS_PER_HOUR) return false;
  hits.push(now);
  seen.set(key, hits);
  return true;
};

const fallback = (reason: string, status: number) =>
  NextResponse.json({ fallback: true, reason }, { status });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fallback("bad-request", 400);
  if (!process.env.ANTHROPIC_API_KEY) return fallback("no-key", 503);
  const key = req.headers.get("x-forwarded-for") ?? "local";
  if (!allowed(key)) return fallback("rate-limit", 429);
  const { message, thread, context, mode } = parsed.data;
  const ctx = context as Context;

  const docs = pickDocs(message, ctx.prefs.style?.values ?? []);
  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(ReplySchema) },
      system: [
        { type: "text", text: EVA_RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextText(ctx) },
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
                    : "The person set the box to Room layout: answer about where things should stand in this room, in millimetres from its walls, and pick a piece only if one is missing.",
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
    if (response.stop_reason === "refusal" || !response.parsed_output)
      return fallback("no-answer", 502);
    return NextResponse.json({
      reply: toReply(response.parsed_output, ctx),
      model: response.model,
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError)
      return fallback("rate-limit", 429);
    if (error instanceof Anthropic.AuthenticationError)
      return fallback("bad-key", 503);
    if (error instanceof Anthropic.APIError)
      return fallback(`api-${error.status}`, 502);
    return fallback("error", 502);
  }
}
