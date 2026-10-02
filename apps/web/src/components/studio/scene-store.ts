import { create } from "zustand";
import {
  assetGroups as seed,
  type AssetGroup,
  type AssetNode,
} from "./assets-data";
import type { Product } from "./catalogue";

type SceneState = {
  groups: AssetGroup[];
  /** put a catalogue product into the room; returns the new node's id */
  addProduct: (p: Product) => string;
};

/** What stands in the room right now: the outliner, the shelf and the
    counts all read this one store, so they always agree. */
export const useScene = create<SceneState>((set, get) => ({
  groups: seed,
  addProduct: (p) => {
    const n = get()
      .groups.flatMap((g) => g.items)
      .filter((a) => a.name === p.name).length;
    const node: AssetNode = {
      id: `${p.id}-${n + 1}`,
      name: n === 0 ? p.name : `${p.name} ${n + 1}`,
      kind: "piece",
      category: p.category,
      price: p.price,
    };
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === p.category ? { ...g, items: [...g.items, node] } : g,
      ),
    }));
    return node.id;
  },
}));

/** top-level things only: what the shelf shows and the tab counts */
export const useTopLevel = () =>
  useScene((s) => s.groups).flatMap((g) => g.items);
