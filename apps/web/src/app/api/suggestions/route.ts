import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ContextBody } from "@/lib/context-body";
import { sanitize } from "@/lib/guard";
import { LIMITS } from "@/lib/limits";
import {
  admit,
  anthropicKey,
  countTokens,
  fallback,
  MODEL,
  providerFailure,
} from "@/lib/model";
import { DAY } from "@/lib/rate-limit";
import type { Context, Reply } from "@/components/studio/eva-brain";
import { products } from "@/components/studio/catalogue";
import { FURNISH } from "@/components/studio/eva-data";
import { contextText, EVA_RULES } from "@/components/studio/eva-prompt";

/**
 * Review this room, when a model is connected: the studio's facts go
 * to Claude with the chatbot's rules and a reviewer's voice, and three
 * to five observations of a fixed shape come back, each grounded in a
 * piece, a size or a rule of this room. A caller gets so many reviews a
 * day, counted in the database, since each is a full call; past that
 * the route says so (429) and the studio's own rules review the room
 * instead, as they do without a key (503).
 */
export const runtime = "nodejs";

const Body = z.object({ context: ContextBody });

const ReviewSchema = z.object({
  text: z.string(),
  observations: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
        /** a catalogue id, when one piece would settle it */
        pick: z.string().nullable(),
        /** what the person could ask next about it, in a few words, and
            the words themselves */
        act: z.object({ label: z.string(), send: z.string() }).nullable(),
      }),
    )
    .min(1)
    .max(5),
});

const VOICE = `This turn you are reviewing the room as it stands, not chatting: walk through it and note three to five things that would make it work better, the most useful first. Each observation has a short title (eight words or fewer) and one to three sentences grounded in a real piece, size, distance or rule of this room; no platitudes. Where one catalogue piece would settle an observation, give its id as "pick"; where the person could ask you to act on it, give "act" with a label of four words or fewer and the words to send (for example "${FURNISH}" or "Lay the room out by the book"). The text is one line saying how many things you noticed.`;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fallback("bad-request", 400);
  if (!anthropicKey()) return fallback("no-key", 503);
  const door = await admit(req, "review", LIMITS.reviewsPerDay, DAY);
  if ("refused" in door) return door.refused;
  const ctx = parsed.data.context as Context;
  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1536,
      output_config: { effort: "low", format: zodOutputFormat(ReviewSchema) },
      system: [
        { type: "text", text: EVA_RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextText(ctx) },
        { type: "text", text: VOICE },
      ],
      messages: [{ role: "user", content: "Review this room." }],
    });
  } catch (error) {
    return providerFailure(error);
  }
  await countTokens(req, door.caller, "review", response);
  if (response.stop_reason === "refusal" || !response.parsed_output)
    return fallback("no-answer", 502);
  const m = response.parsed_output;
  const inRoom = new Set(ctx.pieces.map((n) => n.name));
  const reply: Reply = {
    text: sanitize(m.text),
    proposals: [],
    cards: [],
    chips: [],
    observations: m.observations.map((o) => {
      const pick = o.pick
        ? products.find(
            (p) =>
              p.id === o.pick &&
              p.category !== "components" &&
              !inRoom.has(p.name),
          )
        : undefined;
      return {
        title: sanitize(o.title).slice(0, 80),
        body: sanitize(o.body).slice(0, 400),
        ...(pick ? { pick } : {}),
        ...(o.act
          ? {
              act: {
                label: sanitize(o.act.label).slice(0, 40),
                send: sanitize(o.act.send).slice(0, 120),
              },
            }
          : {}),
      };
    }),
  };
  return NextResponse.json({ reply, model: response.model });
}
