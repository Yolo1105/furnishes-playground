"use client";

import { useEffect } from "react";
import { fittedSizes, useModels } from "./props-store";
import { useScene } from "./scene-store";

/**
 * The real models' list read as the studio opens (props-store.ts), and
 * every room item of a kind whose built form only stands in for a model
 * (an armchair, a plant, a vase…) that no model fits as it is sized to
 * the nearest model of its design, so it is drawn as the real thing
 * (round 8, Part 2). Never a product, nor a sofa or a table, which keep
 * their own size and form; an item sized so once (`fitted`) is left as
 * the person leaves it after. The planner says which items took their
 * model's size (piece-actions.ts).
 */
export function FitToModels() {
  const models = useModels();
  const groups = useScene((s) => s.groups);
  const overrides = useScene((s) => s.overrides);
  useEffect(() => {
    if (!models?.length) return;
    const sizes = fittedSizes(
      groups.flatMap((g) => g.items),
      overrides,
      models,
    );
    if (Object.keys(sizes).length) useScene.getState().fitToModels(sizes);
  }, [models, groups, overrides]);
  return null;
}
