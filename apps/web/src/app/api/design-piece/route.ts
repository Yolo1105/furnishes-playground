import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  DESIGN_SYSTEM,
  DESIGN_TOOL,
  designPiece,
  designTool,
} from "@/lib/design-piece";
import { MESSAGE_MAX, refuse } from "@/lib/guard";
import { LIMITS } from "@/lib/limits";
import {
  admit,
  anthropicKey,
  countTokens,
  fallback,
  MODEL,
  providerFailure,
} from "@/lib/model";
import { MODEL_BYTES, readJson } from "@/lib/schemas";

/**
 * Design a piece from words, when a model is connected: Claude is made
 * to call `design_piece`, whose input is a recipe; the recipe is read
 * by its shape and by how the pieces are made, and what it breaks goes
 * back for a repair, at most three times (lib/design-piece.ts). The
 * answer is the recipe and the repairs it took; without a key (503), past
 * the caller's share (429), or with no recipe that passes (422, with
 * what it still broke), the studio reads the words by its own rules
 * instead (recipeFromWords).
 */
export const runtime = "nodejs";

const Body = z.object({
  words: z.string().trim().min(1).max(MESSAGE_MAX),
  /** the room it is for, so a size left unsaid suits it */
  room: z
    .object({
      name: z.string().max(60),
      width: z.number().positive().max(50_000),
      depth: z.number().positive().max(50_000),
    })
    .optional(),
});

export async function POST(req: Request) {
  const body = await readJson(req, MODEL_BYTES);
  if (body.error) return body.error;
  const parsed = Body.safeParse(body.value);
  if (!parsed.success) return fallback("bad-request", 400);
  const { words, room } = parsed.data;
  const refused = refuse(words);
  if (refused) return fallback(refused, 400);
  if (!anthropicKey()) return fallback("no-key", 503);
  const door = await admit(req, "design", LIMITS.designsPerHour);
  if ("refused" in door) return door.refused;
  const client = new Anthropic();
  const tool = designTool();
  const system = [
    { type: "text" as const, text: DESIGN_SYSTEM },
    ...(room
      ? [
          {
            type: "text" as const,
            text: `The piece is for the ${room.name}, ${Math.round(room.width)} × ${Math.round(room.depth)} mm.`,
          },
        ]
      : []),
  ];
  let answer;
  try {
    answer = await designPiece(words, async (messages) => {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: "low" },
        system,
        tools: [tool],
        tool_choice: { type: "tool", name: DESIGN_TOOL },
        messages,
      });
      await countTokens(req, door.caller, "design", response);
      return response;
    });
  } catch (error) {
    return providerFailure(error);
  }
  // what still cannot be made, said, for the studio to show
  if (!("recipe" in answer))
    return NextResponse.json(
      {
        fallback: true,
        reason: "no-valid-recipe",
        problems: answer.problems.map((p) => p.message),
      },
      { status: 422 },
    );
  return NextResponse.json({ recipe: answer.recipe, repairs: answer.repairs });
}
