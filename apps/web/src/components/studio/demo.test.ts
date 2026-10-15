import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkRecipe, recipeFromWords } from "@furnishes/domain";
import { describe, expect, it } from "vitest";
import { arrangementOf } from "./assets-data";
import {
  DEMO_PIECES,
  DEMO_SCENES,
  leaveDemo,
  sceneFor,
  startDemo,
} from "./demo";
import { useDemo } from "./demo-store";
import { useEva } from "./eva-store";
import { useProjects } from "./project-store";
import { kindOf, styleOf, variantFor, type Variant } from "./prop-variants";
import { propsOf, useScene } from "./scene-store";

/**
 * The guided demo (demo.ts): its scenes stand on the flat as it first
 * opens, whatever is typed plays one, and leaving it leaves the projects
 * as they were.
 */
const listed = JSON.parse(
  readFileSync(join(__dirname, "../../../public/props/index.json"), "utf8"),
) as { models: Variant[] };

const thread = () => {
  const id = useEva.getState().activeId;
  return id ? (useEva.getState().messages[id] ?? []) : [];
};

describe("the guided demo", () => {
  it("has twelve scenes, each its own, each with words to offer", () => {
    expect(DEMO_SCENES).toHaveLength(12);
    expect(new Set(DEMO_SCENES.map((s) => s.id)).size).toBe(12);
    for (const s of DEMO_SCENES) expect(s.you.length).toBeGreaterThan(5);
  });
  it("works with pieces the flat opens with, and a sofa a real model draws", () => {
    const a = arrangementOf("balanced");
    const ids = a.groups.flatMap((g) => g.items).map((n) => n.id);
    for (const id of Object.values(DEMO_PIECES)) expect(ids).toContain(id);
    // the swap's green velvet sofa: a curved sofa model fits its size
    const swap = DEMO_SCENES.find((s) => s.id === "swap")!.reply();
    const item = swap.changes!.items[0]!;
    const kind = kindOf(item.name)!;
    const size = item.size!;
    expect(
      variantFor(
        listed.models,
        kind,
        [size.width / 1000, size.height / 1000, size.depth / 1000],
        styleOf(item.name, kind),
      ),
    ).not.toBeNull();
    // the piece Eva designs can be made
    const design = DEMO_SCENES.find((s) => s.id === "design")!.reply().design!;
    expect(checkRecipe(design)).toEqual([]);
    expect(design).toEqual(
      recipeFromWords("A 1.6 m low bookcase with two doors, oak"),
    );
  });
  it("plays the scene the words name, else the next", () => {
    expect(sceneFor("asdf", [])?.id).toBe("hello");
    expect(sceneFor("walk me round", [])?.id).toBe("walk");
    expect(sceneFor("make it evening", ["hello"])?.id).toBe("evening");
    expect(sceneFor("asdf", ["hello", "brainstorm"])?.id).toBe("swap");
    expect(
      sceneFor(
        "x",
        DEMO_SCENES.map((s) => s.id),
      ),
    ).toBeNull();
  });
  it("opens fresh, answers anything, changes the room, and leaves the projects as they were", async () => {
    // the open project is kept as it stands before the demo opens
    useProjects.getState().save();
    const before = JSON.stringify(useProjects.getState().projects);
    startDemo();
    expect(useDemo.getState().on).toBe(true);
    // Eva greets, offering to play it
    expect(thread()).toHaveLength(1);
    expect(thread()[0]!.chips?.[0]?.label).toBe("Play the demo");
    // nonsense plays the first scene: her preferences to keep
    await useEva.getState().send("asdf");
    expect(useDemo.getState().played).toEqual(["hello"]);
    expect(thread().at(-1)!.proposals).toHaveLength(3);
    // the sofa named: the swap, applied as Eva's changes
    await useEva.getState().send("the sofa");
    const msg = thread().at(-1)!;
    expect(msg.changes?.removes[0]?.id).toBe(DEMO_PIECES.sofa);
    useEva.getState().applyChanges(msg.id, true);
    const sc = useScene.getState();
    const nodes = sc.groups.flatMap((g) => g.items);
    expect(nodes.some((n) => n.id === DEMO_PIECES.sofa)).toBe(false);
    const sofa = nodes.find((n) => n.name === "Deep green velvet sofa")!;
    const p = propsOf(sofa, sc.overrides);
    expect(p.colour).toMatch(/^#/);
    expect([p.width, p.depth, p.height]).toEqual([2190, 1020, 790]);
    // the sideboard in walnut
    await useEva.getState().send("walnut please");
    const finish = thread().at(-1)!;
    useEva.getState().applyChanges(finish.id, true);
    const board = useScene
      .getState()
      .groups.flatMap((g) => g.items)
      .find((n) => n.id === DEMO_PIECES.sideboard)!;
    expect(propsOf(board, useScene.getState().overrides).colour).toBe("walnut");
    // nothing of it was kept, and leaving goes back
    expect(JSON.stringify(useProjects.getState().projects)).toBe(before);
    leaveDemo();
    expect(useDemo.getState().on).toBe(false);
    expect(JSON.stringify(useProjects.getState().projects)).toBe(before);
  }, 20_000);
});
