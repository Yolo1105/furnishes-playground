import { create } from "zustand";
import {
  assetGroups as seed,
  CATEGORY_NAMES,
  type AssetGroup,
  type AssetNode,
} from "./assets-data";
import type { Product } from "./catalogue";
import { defaultProps, LABEL_MAX, type PieceProps } from "./piece-detail";

type SceneState = {
  groups: AssetGroup[];
  /** the one thing picked, in the outliner and on the shelf alike */
  selectedId: string | null;
  /** counts every pick, so a repeat pick of the same thing still shows it */
  selectedAt: number;
  /** counts the picks that should bring the outliner to the thing: a card
      or a row, not an add from Products or a drop on the room */
  revealAt: number;
  /** ids of the pieces put in the cart */
  cart: string[];
  /** ids of the pieces labelled for Eva, in order, up to LABEL_MAX */
  labels: string[];
  /** the Detail tab's changes, over each piece's defaults */
  overrides: Record<string, Partial<PieceProps>>;
  /** put a catalogue product into the room; returns the new node's id */
  addProduct: (p: Product) => string;
  select: (id: string | null, reveal?: boolean) => void;
  toggleCart: (id: string) => void;
  /** label a piece for Eva, or take the label off; a sixth is refused */
  toggleLabel: (id: string) => void;
  setProps: (id: string, patch: Partial<PieceProps>) => void;
};

/** What stands in the room right now: the outliner, the shelf and the
    counts all read this one store, so they always agree. */
export const useScene = create<SceneState>((set, get) => ({
  groups: seed,
  selectedId: null,
  selectedAt: 0,
  revealAt: 0,
  cart: [],
  labels: [],
  overrides: {},
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
    set((s) => {
      const has = s.groups.some((g) => g.id === p.category);
      const groups = has
        ? s.groups.map((g) =>
            g.id === p.category ? { ...g, items: [...g.items, node] } : g,
          )
        : [
            { id: p.category, name: CATEGORY_NAMES[p.category], items: [node] },
            ...s.groups,
          ];
      return { groups };
    });
    return node.id;
  },
  select: (id, reveal = true) =>
    set((s) => ({
      selectedId: id,
      selectedAt: s.selectedAt + 1,
      revealAt: reveal ? s.revealAt + 1 : s.revealAt,
    })),
  toggleCart: (id) =>
    set((s) => ({
      cart: s.cart.includes(id)
        ? s.cart.filter((x) => x !== id)
        : [...s.cart, id],
    })),
  toggleLabel: (id) =>
    set((s) => {
      if (s.labels.includes(id))
        return { labels: s.labels.filter((x) => x !== id) };
      if (s.labels.length >= LABEL_MAX) return {};
      return { labels: [...s.labels, id] };
    }),
  setProps: (id, patch) =>
    set((s) => ({
      overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } },
    })),
}));

/** a node's properties: its defaults with the Detail tab's changes over them */
export const propsOf = (
  n: AssetNode,
  overrides: Record<string, Partial<PieceProps>>,
): PieceProps => ({ ...defaultProps(n), ...overrides[n.id] });

/** the node with `id`, at any depth, and its parent if it has one */
export const findNode = (
  groups: AssetGroup[],
  id: string | null,
): { node: AssetNode; parent: AssetNode | null } | null => {
  if (!id) return null;
  for (const g of groups)
    for (const n of g.items) {
      if (n.id === id) return { node: n, parent: null };
      const c = n.children?.find((x) => x.id === id);
      if (c) return { node: c, parent: n };
    }
  return null;
};

/** top-level things only: what the shelf shows and the tab counts */
export const useTopLevel = () =>
  useScene((s) => s.groups).flatMap((g) => g.items);

/** the top-level node that holds `id` (itself, or its parent piece) */
export const topLevelOf = (groups: AssetGroup[], id: string | null) => {
  if (!id) return null;
  for (const g of groups)
    for (const n of g.items)
      if (n.id === id || n.children?.some((c) => c.id === id)) return n.id;
  return null;
};

/** the group that holds `id`, at any depth */
export const groupOf = (groups: AssetGroup[], id: string) =>
  groups.find((g) =>
    g.items.some((n) => n.id === id || n.children?.some((c) => c.id === id)),
  );
