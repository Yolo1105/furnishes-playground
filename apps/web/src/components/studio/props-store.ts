"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { AssetNode } from "./assets-data";
import { recipeOf } from "./catalogue";
import type { PieceProps } from "./piece-detail";
import { kindOf, snapFor, styleOf, type Variant } from "./prop-variants";
import { propsOf } from "./scene-store";

/**
 * The real models a room item can be drawn from, as
 * public/props/index.json lists them (prop-variants.ts picks one): read
 * once when the studio opens, so a model added to the list is drawn
 * with no change to the code. `drawn` counts the models on screen by
 * file, `far` those drawn from their far copy, and `loading` the ones
 * still on their way (their built forms standing in), which the stage
 * says (`data-models`, `data-models-far`, `data-models-pending`) so a
 * test can wait on them.
 */
export const useProps = create<{
  models: Variant[] | null;
  drawn: Record<string, number>;
  far: number;
  loading: number;
}>(() => ({ models: null, drawn: {}, far: 0, loading: 0 }));

let asked: Promise<void> | null = null;
/** the list read, once; an unreadable list leaves every item built */
export const loadProps = () =>
  (asked ??= fetch("/props/index.json")
    .then((r) => (r.ok ? r.json() : { models: [] }))
    .then((j: { models?: Variant[] }) =>
      useProps.setState({ models: j.models ?? [] }),
    )
    .catch(() => useProps.setState({ models: [] })));

/** the list, read on first use by whatever draws or sizes from it (the
    studio, a shared room) */
export const useModels = () => {
  useEffect(() => {
    void loadProps();
  }, []);
  return useProps((s) => s.models);
};

/** a model on its way, or arrived (or failed: its form stays) */
export const loadingModel = (on: boolean) =>
  useProps.setState((s) => ({ loading: s.loading + (on ? 1 : -1) }));

/** a model on screen, or gone from it; drawn from its far copy or not */
export const drawnModel = (file: string, on: boolean, far = false) =>
  useProps.setState((s) => {
    const n = (s.drawn[file] ?? 0) + (on ? 1 : -1);
    const drawn = { ...s.drawn };
    if (n > 0) drawn[file] = n;
    else delete drawn[file];
    return { drawn, far: s.far + (far ? (on ? 1 : -1) : 0) };
  });

/** the size, mm, each room item of a kind whose built form only stands
    in for a model (an armchair, a plant, a vase…) takes when no model
    fits it as it is: the nearest model of its design's own
    (prop-variants.ts). Never a product, a part or a generated item; an
    item sized so once (`fitted`) is left as the person leaves it after */
export const fittedSizes = (
  items: readonly AssetNode[],
  overrides: Record<string, Partial<PieceProps>>,
  models: readonly Variant[],
) => {
  const sizes: Record<
    string,
    Pick<PieceProps, "width" | "height" | "depth"> & { fitted: string }
  > = {};
  for (const n of items) {
    if (n.part || n.model || recipeOf(n)) continue;
    const kind = kindOf(n.name, n.category);
    if (!kind) continue;
    const p = propsOf(n, overrides);
    const snap = snapFor(models, kind, styleOf(n.name, kind), [
      p.width / 1000,
      p.height / 1000,
      p.depth / 1000,
    ]);
    if (!snap || p.fitted === snap.v.file) continue;
    sizes[n.id] = {
      width: Math.round(snap.size[0] * 1000),
      height: Math.round(snap.size[1] * 1000),
      depth: Math.round(snap.size[2] * 1000),
      fitted: snap.v.file,
    };
  }
  return sizes;
};
