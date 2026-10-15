import type Anthropic from "@anthropic-ai/sdk";
import {
  checkRecipe,
  DESIGN_FINISHES,
  DESIGN_RULES,
  DRAWER_MM,
  PLINTH_MM,
  SHEET,
  type DesignProblem,
  type DesignRecipe,
} from "@furnishes/domain";
import { z } from "zod";

/**
 * Eva's `design_piece` tool (round 8, Part 3a): the words go to the
 * model with the one tool it must call, whose input is a recipe, never
 * a mesh. The recipe is read twice, by its shape (zod) and by how the
 * pieces are made (the domain's checkRecipe); what it breaks goes back
 * to the model as the tool's error, and it tries again, at most
 * REPAIRS times. The first recipe that passes is the answer; none, and
 * the studio reads the words by its own rules (recipeFromWords).
 */
export const DESIGN_TOOL = "design_piece";
export const REPAIRS = 3;

const [wLo, wHi] = DESIGN_RULES.width;
const [hLo, hHi] = DESIGN_RULES.height;
const [dLo, dHi] = DESIGN_RULES.depth;
const [bLo, bHi] = DESIGN_RULES.bays;
const [sLo, sHi] = DESIGN_RULES.shelves;

export const RecipeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  width: z.number().int().min(wLo).max(wHi),
  height: z.number().int().min(hLo).max(hHi),
  depth: z.number().int().min(dLo).max(dHi),
  bays: z.number().int().min(bLo).max(bHi),
  shelves: z.number().int().min(sLo).max(sHi),
  doors: z.number().int().min(0).max(bHi),
  drawers: z.number().int().min(0).max(bHi),
  plinth: z.boolean(),
  finish: z.enum(DESIGN_FINISHES),
}) satisfies z.ZodType<DesignRecipe>;

/** the tool the model is made to call; its input is the recipe */
export const designTool = (): Anthropic.Tool => {
  const { $schema: _, ...schema } = z.toJSONSchema(RecipeSchema) as Record<
    string,
    unknown
  >;
  return {
    name: DESIGN_TOOL,
    description:
      "Design one Furnishes plywood piece as a recipe: its size in millimetres, its bays, the shelves in each bay, how many bays from the left have a door, how many bays after those have a drawer at their foot, whether it stands on a plinth, and its finish. The studio draws, prices and cuts the piece from the recipe.",
    input_schema: schema as Anthropic.Tool.InputSchema,
  };
};

/** how the pieces are made, in words, from the rules' own numbers */
export const DESIGN_SYSTEM = `You design Furnishes pieces: carcasses of ${DESIGN_RULES.panel} mm birch plywood, made to measure. Call ${DESIGN_TOOL} once with a recipe for the piece the person describes. The rules a recipe must keep:
- width ${wLo}–${wHi} mm, height ${hLo}–${hHi} mm, depth ${dLo}–${dHi} mm; whole millimetres.
- ${bLo}–${bHi} bays side by side, with a ${DESIGN_RULES.panel} mm divider between bays and a side at each end; a bay's inside width is (width − ${DESIGN_RULES.panel} × (bays + 1)) / bays and is never more than ${DESIGN_RULES.span} mm, the most an ${DESIGN_RULES.panel} mm shelf spans without sagging.
- ${sLo}–${sHi} shelves in each bay, set on the ${DESIGN_RULES.pitch} mm system, with at least ${DESIGN_RULES.gap} mm between them.
- a door covers one bay and its leaf is never wider than ${DESIGN_RULES.leaf} mm; doors take bays from the left, drawers the bays after them, and doors + drawers is at most the bays.
- a drawer is ${DRAWER_MM} mm tall at a bay's foot; a plinth is ${PLINTH_MM} mm and recessed.
- every panel is cut from a ${SHEET.length} × ${SHEET.width} mm sheet.
- finish is one of ${DESIGN_FINISHES.join(", ")}.
Keep to the sizes the person gives; where they give none, use the usual size of that kind of piece. The name is two or three words a catalogue would use.`;

/** what is wrong with a tool's input, as the lines the model reads */
export const problemsOf = (input: unknown): DesignProblem[] | DesignRecipe => {
  const shaped = RecipeSchema.safeParse(input);
  if (!shaped.success)
    return shaped.error.issues.map((i) => ({
      field: (i.path[0] ?? "name") as DesignProblem["field"],
      message: `${i.path.join(".") || "recipe"}: ${i.message}`,
    }));
  const problems = checkRecipe(shaped.data);
  return problems.length > 0 ? problems : shaped.data;
};

export type DesignAnswer =
  | { recipe: DesignRecipe; repairs: number }
  | { problems: DesignProblem[]; repairs: number };

/** the designer's turns: ask, read the recipe, send back what it breaks,
    until one passes or the repairs run out. `ask` makes one call with the
    turns so far and counts what it cost */
export async function designPiece(
  words: string,
  ask: (messages: Anthropic.MessageParam[]) => Promise<Anthropic.Message>,
): Promise<DesignAnswer> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: words }];
  let problems: DesignProblem[] = [];
  for (let k = 0; k <= REPAIRS; k++) {
    const answer = await ask(messages);
    const use = answer.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === DESIGN_TOOL,
    );
    if (!use) return { problems, repairs: k };
    const read = problemsOf(use.input);
    if (!Array.isArray(read)) return { recipe: read, repairs: k };
    problems = read;
    messages.push(
      { role: "assistant", content: answer.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: `This recipe cannot be made:\n${read.map((p) => `- ${p.message}`).join("\n")}\nCall ${DESIGN_TOOL} again with a recipe that keeps every rule.`,
          },
        ],
      },
    );
  }
  return { problems, repairs: REPAIRS };
}
