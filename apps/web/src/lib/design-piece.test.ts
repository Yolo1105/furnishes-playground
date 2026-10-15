import type Anthropic from "@anthropic-ai/sdk";
import { checkRecipe, recipeFromWords } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import {
  DESIGN_SYSTEM,
  DESIGN_TOOL,
  designPiece,
  designTool,
  problemsOf,
  REPAIRS,
} from "./design-piece";

const GOOD = recipeFromWords("A 1.6 m low bookcase with two doors, oak");

/** a model that answers with these tool inputs in turn */
const scripted = (inputs: unknown[]) => {
  const seen: Anthropic.MessageParam[][] = [];
  const ask = async (messages: Anthropic.MessageParam[]) => {
    seen.push(structuredClone(messages));
    const input = inputs[Math.min(seen.length - 1, inputs.length - 1)];
    return {
      content: [
        { type: "tool_use", id: `t${seen.length}`, name: DESIGN_TOOL, input },
      ],
    } as unknown as Anthropic.Message;
  };
  return { ask, seen };
};

describe("design_piece", () => {
  it("offers one tool whose input is the recipe", () => {
    const t = designTool();
    expect(t.name).toBe(DESIGN_TOOL);
    expect(t.input_schema.type).toBe("object");
    expect(t.input_schema.required).toEqual(
      expect.arrayContaining(["width", "bays", "doors", "finish"]),
    );
    expect(t.input_schema).not.toHaveProperty("$schema");
    // the rules the model reads are the domain's numbers
    expect(DESIGN_SYSTEM).toMatch(/800 mm/);
    expect(DESIGN_SYSTEM).toMatch(/2440 × 1220 mm/);
  });
  it("takes a recipe that passes the first time", async () => {
    const { ask, seen } = scripted([GOOD]);
    expect(await designPiece("a low bookcase", ask)).toEqual({
      recipe: GOOD,
      repairs: 0,
    });
    expect(seen).toHaveLength(1);
  });
  it("sends back what a recipe breaks and takes the repair", async () => {
    const wide = { ...GOOD, bays: 1, doors: 1 };
    const { ask, seen } = scripted([wide, GOOD]);
    const answer = await designPiece("a low bookcase", ask);
    expect(answer).toEqual({ recipe: GOOD, repairs: 1 });
    const back = seen[1]!.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(back[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "t1",
      is_error: true,
    });
    expect(String(back[0]!.content)).toMatch(/spans as a shelf/);
  });
  it("reads the shape before the rules", () => {
    const p = problemsOf({ ...GOOD, finish: "gold", bays: "three" });
    expect(Array.isArray(p) && p.map((x) => x.field).sort()).toEqual([
      "bays",
      "finish",
    ]);
  });
  it(`stops after ${REPAIRS} repairs with what is still wrong`, async () => {
    const { ask, seen } = scripted([{ ...GOOD, width: 9000 }]);
    const answer = await designPiece("a vast bookcase", ask);
    expect(seen).toHaveLength(REPAIRS + 1);
    expect("problems" in answer && answer.problems[0]!.field).toBe("width");
    expect(checkRecipe(GOOD)).toEqual([]);
  });
});
