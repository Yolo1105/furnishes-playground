import { create } from "zustand";
import {
  assetGroups as seed,
  CATEGORY_NAMES,
  type AssetGroup,
  type AssetNode,
} from "./assets-data";
import type { Product } from "./catalogue";
import { defaultProps, LABEL_MAX, type PieceProps } from "./piece-detail";

/** what undo brings back: the room's contents and what was done to them */
type Snapshot = Pick<SceneState, "groups" | "cart" | "labels" | "overrides">;
/** how far back undo reaches */
const HISTORY_MAX = 50;

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
  /** the states before each change, oldest first, and the ones undone */
  past: Snapshot[];
  future: Snapshot[];
  /** the state a drag started from, until it ends */
  dragFrom: Snapshot | null;
  undo: () => void;
  redo: () => void;
  /** put a catalogue product into the room; returns the new node's id */
  addProduct: (p: Product) => string;
  select: (id: string | null, reveal?: boolean) => void;
  toggleCart: (id: string) => void;
  /** label a piece for Eva, or take the label off; a sixth is refused */
  toggleLabel: (id: string) => void;
  setProps: (id: string, patch: Partial<PieceProps>) => void;
  /** take a piece out of the room altogether */
  removeNode: (id: string) => void;
  /** a drag writes many positions; only the whole of it is one undo step */
  dragStart: () => void;
  dragMove: (id: string, x: number, y: number) => void;
  dragEnd: () => void;
};

/** What stands in the room right now: the outliner, the shelf and the
    counts all read this one store, so they always agree. */
export const useScene = create<SceneState>((set, get) => {
  const snap = (s: SceneState): Snapshot => ({
    groups: s.groups,
    cart: s.cart,
    labels: s.labels,
    overrides: s.overrides,
  });
  /** a change worth undoing: the state before it goes onto `past`, and a
      new change forgets what was undone */
  const remember = (s: SceneState) => ({
    past: [...s.past.slice(-(HISTORY_MAX - 1)), snap(s)],
    future: [] as Snapshot[],
  });
  return {
    groups: seed,
    selectedId: null,
    selectedAt: 0,
    revealAt: 0,
    cart: [],
    labels: [],
    overrides: {},
    past: [],
    future: [],
    dragFrom: null,
    undo: () =>
      set((s) => {
        const back = s.past.at(-1);
        if (!back) return {};
        return {
          ...back,
          past: s.past.slice(0, -1),
          future: [...s.future, snap(s)],
        };
      }),
    redo: () =>
      set((s) => {
        const next = s.future.at(-1);
        if (!next) return {};
        return {
          ...next,
          past: [...s.past, snap(s)],
          future: s.future.slice(0, -1),
        };
      }),
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
              {
                id: p.category,
                name: CATEGORY_NAMES[p.category],
                items: [node],
              },
              ...s.groups,
            ];
        return { groups, ...remember(s) };
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
        ...remember(s),
      })),
    toggleLabel: (id) =>
      set((s) => {
        if (s.labels.includes(id))
          return { labels: s.labels.filter((x) => x !== id), ...remember(s) };
        if (s.labels.length >= LABEL_MAX) return {};
        return { labels: [...s.labels, id], ...remember(s) };
      }),
    setProps: (id, patch) =>
      set((s) => ({
        overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch } },
        ...remember(s),
      })),
    removeNode: (id) =>
      set((s) => {
        const overrides = { ...s.overrides };
        delete overrides[id];
        return {
          groups: s.groups
            .map((g) => ({ ...g, items: g.items.filter((n) => n.id !== id) }))
            .filter((g) => g.items.length > 0),
          cart: s.cart.filter((x) => x !== id),
          labels: s.labels.filter((x) => x !== id),
          overrides,
          selectedId: s.selectedId === id ? null : s.selectedId,
          ...remember(s),
        };
      }),
    dragStart: () => set((s) => ({ dragFrom: snap(s) })),
    dragMove: (id, x, y) =>
      set((s) => ({
        overrides: { ...s.overrides, [id]: { ...s.overrides[id], x, y } },
      })),
    dragEnd: () =>
      set((s) => {
        const from = s.dragFrom;
        if (!from) return {};
        const moved = from.overrides !== s.overrides;
        return {
          dragFrom: null,
          ...(moved
            ? { past: [...s.past.slice(-(HISTORY_MAX - 1)), from], future: [] }
            : {}),
        };
      }),
  };
});

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
