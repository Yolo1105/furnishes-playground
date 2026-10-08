import {
  boundsOf,
  type Panel,
  priceOfPanels,
  settledPanels,
  sizeOf,
} from "@furnishes/domain";
import { create } from "zustand";
import { newId } from "./ids";
import {
  assetGroups as seed,
  CATEGORY_NAMES,
  type AssetCategory,
  type AssetGroup,
  type AssetNode,
} from "./assets-data";
import { productOf, type Product } from "./catalogue";
import { defaultProps, LABEL_MAX, type PieceProps } from "./piece-detail";

/** what undo brings back: the room's contents and what was done to them */
type Snapshot = Pick<SceneState, "groups" | "cart" | "labels" | "overrides">;
/** how far back undo reaches */
const HISTORY_MAX = 50;

type Spot = { x: number; y: number };
/** where the pieces the room laid out stand right now, as the stage last
    drew them (the layout hook notes it after each render) */
let standing: ReadonlyMap<string, Spot> = new Map();
const standingByRoom = new Map<string, ReadonlyMap<string, Spot>>();
/** where a piece the room laid out stands right now, mm */
export const standingOf = (id: string) => standing.get(id);
export const noteStanding = (
  room: string,
  spots: ReadonlyMap<string, Spot>,
) => {
  standingByRoom.set(room, spots);
  standing = new Map([...standingByRoom.values()].flatMap((m) => [...m]));
};
/** whether a piece stands in a room: an unplaced piece is in the first */
export const inRoom = (
  p: { roomId?: string },
  roomId: string,
  firstId: string,
) => (p.roomId ?? firstId) === roomId;

type SceneState = {
  groups: AssetGroup[];
  /** the one thing picked, in the outliner and on the shelf alike */
  selectedId: string | null;
  /** the panel of the picked piece in hand, when it is opened as panels */
  panelId: string | null;
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
  /** put a catalogue product into a room; returns the new node's id */
  addProduct: (p: Product, roomId: string) => string;
  /** put a room item into a room: something that sets the scene and is
      not for sale; returns the new node's id */
  addItem: (
    item: {
      name: string;
      category: AssetCategory;
      image?: string;
      model?: string;
    },
    roomId: string,
  ) => string;
  select: (id: string | null, reveal?: boolean) => void;
  selectPanel: (id: string | null) => void;
  /** a piece's panels moved under a drag: live, between dragStart and
      dragEnd, its size following */
  panelsMove: (id: string, panels: readonly Panel[]) => void;
  /** a piece opened as panels, its panels changed, or closed again
      (undefined): the box settles round them, the size and the price
      follow; one step to undo unless `live`, inside a drag */
  setPanels: (
    id: string,
    panels: readonly Panel[] | undefined,
    live?: boolean,
  ) => void;
  toggleCart: (id: string) => void;
  /** the cart after an order: empty (not a step to undo) */
  clearCart: () => void;
  /** label a piece for Eva, or take the label off; a sixth is refused */
  toggleLabel: (id: string) => void;
  /** one piece's change; the pieces the room laid out hold their spots */
  setProps: (id: string, patch: Partial<PieceProps>) => void;
  /** a whole layout at once: every piece's place, one undo step */
  placeAll: (places: Record<string, Partial<PieceProps>>) => void;
  /** take a piece out of the room altogether */
  removeNode: (id: string) => void;
  /** Eva's changes as one undo step: pieces taken out, catalogue
      pieces and room items brought in, then every piece placed as
      `placesFor` says once the new nodes are known */
  change: (
    c: {
      removes: string[];
      adds: { product: Product; roomId: string }[];
      items: { item: Parameters<SceneState["addItem"]>[0]; roomId: string }[];
    },
    placesFor: (added: AssetNode[]) => Record<string, Partial<PieceProps>>,
  ) => void;
  /** a drag writes many positions; only the whole of it is one undo step;
      the pieces not dragged are held where they stand */
  dragStart: () => void;
  dragMove: (id: string, x: number, y: number) => void;
  /** the turn handle's drag, between dragStart and dragEnd */
  turnMove: (id: string, rotation: number) => void;
  dragEnd: () => void;
  /** a room's shape changed: every piece in it is held where it stands
      (a laid-out one is not laid out afresh) and, when the room's corner
      moved, all move by the same amount, so they keep to the walls that
      stayed. Not a step to undo, since the room's shape is not one either */
  nudgeAll: (dx: number, dy: number, roomId: string, firstId: string) => void;
  /** a room left the flat: what stood in it goes too */
  removeRoomPieces: (roomId: string, firstId: string) => void;
};

/** a catalogue product as a new node: numbered after the ones of its
    name already there */
const productNode = (groups: AssetGroup[], p: Product): AssetNode => {
  const n = groups
    .flatMap((g) => g.items)
    .filter((a) => a.name === p.name).length;
  return {
    id: `${p.id}-${n + 1}`,
    name: n === 0 ? p.name : `${p.name} ${n + 1}`,
    kind: "piece",
    category: p.category,
    price: p.price,
    productId: p.id,
  };
};
/** a room item as a new node, numbered the same way */
const itemNode = (
  groups: AssetGroup[],
  item: {
    name: string;
    category: AssetCategory;
    image?: string;
    model?: string;
  },
): AssetNode => {
  const n = groups
    .flatMap((g) => g.items)
    .filter((a) => a.name === item.name).length;
  return {
    id: newId("item"),
    name: n === 0 ? item.name : `${item.name} ${n + 1}`,
    kind: "decor",
    category: item.category,
    ...(item.image ? { image: item.image } : {}),
    ...(item.model ? { model: item.model } : {}),
  };
};
/** a piece's price set anew: from its panels, or its recipe's again */
const priced = (
  groups: AssetGroup[],
  id: string,
  panels: readonly Panel[] | undefined,
): AssetGroup[] =>
  groups.map((g) => ({
    ...g,
    items: g.items.map((n) => {
      if (n.id !== id) return n;
      const price = panels
        ? priceOfPanels(panels)
        : n.productId
          ? productOf(n.productId)?.price
          : undefined;
      return price === undefined ? n : { ...n, price };
    }),
  }));

/** a piece's size from the box round its panels, mm, as they stand */
const sizedBy = (panels: readonly Panel[]) => {
  const b = boundsOf(panels);
  return b ? sizeOf(b) : {};
};

/** the node into its category's group, which is made when new */
const into = (groups: AssetGroup[], node: AssetNode): AssetGroup[] =>
  groups.some((g) => g.id === node.category)
    ? groups.map((g) =>
        g.id === node.category ? { ...g, items: [...g.items, node] } : g,
      )
    : [
        {
          id: node.category,
          name: CATEGORY_NAMES[node.category],
          items: [node],
        },
        ...groups,
      ];

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
  /** a change to one piece never moves another, and a piece coming in
      never shifts the ones there: before either, every piece the room
      laid out is held at the spot it has now */
  const held = (s: SceneState) => {
    let overrides = s.overrides;
    for (const g of s.groups)
      for (const n of g.items) {
        const o = overrides[n.id];
        if (n.kind === "fixed" || (o?.x !== undefined && o?.y !== undefined))
          continue;
        const at = standing.get(n.id);
        if (!at) continue;
        if (overrides === s.overrides) overrides = { ...overrides };
        overrides[n.id] = { ...o, x: at.x, y: at.y };
      }
    return overrides;
  };
  return {
    groups: seed,
    selectedId: null,
    panelId: null,
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
    addProduct: (p, roomId) => {
      const node = productNode(get().groups, p);
      set((s) => ({
        groups: into(s.groups, node),
        overrides: { ...held(s), [node.id]: { roomId } },
        ...remember(s),
      }));
      return node.id;
    },
    addItem: (item, roomId) => {
      const node = itemNode(get().groups, item);
      set((s) => ({
        groups: into(s.groups, node),
        overrides: { ...held(s), [node.id]: { roomId } },
        ...remember(s),
      }));
      return node.id;
    },
    change: (c, placesFor) =>
      set((s) => {
        const gone = new Set(c.removes);
        let groups = s.groups
          .map((g) => ({ ...g, items: g.items.filter((n) => !gone.has(n.id)) }))
          .filter((g) => g.items.length > 0);
        const overrides = { ...held(s) };
        for (const id of gone) delete overrides[id];
        const added: AssetNode[] = [];
        for (const a of c.adds) {
          const node = productNode(groups, a.product);
          groups = into(groups, node);
          overrides[node.id] = { roomId: a.roomId };
          added.push(node);
        }
        for (const it of c.items) {
          const node = itemNode(groups, it.item);
          groups = into(groups, node);
          overrides[node.id] = { roomId: it.roomId };
          added.push(node);
        }
        for (const [id, patch] of Object.entries(placesFor(added)))
          if (overrides[id] || added.some((n) => n.id === id))
            overrides[id] = { ...overrides[id], ...patch };
        return {
          groups,
          overrides,
          cart: s.cart.filter((x) => !gone.has(x)),
          labels: s.labels.filter((x) => !gone.has(x)),
          selectedId:
            s.selectedId && gone.has(s.selectedId) ? null : s.selectedId,
          ...remember(s),
        };
      }),
    select: (id, reveal = true) =>
      set((s) => ({
        selectedId: id,
        panelId: null,
        selectedAt: s.selectedAt + 1,
        revealAt: reveal ? s.revealAt + 1 : s.revealAt,
      })),
    selectPanel: (panelId) => set({ panelId }),
    panelsMove: (id, panels) =>
      set((s) => ({
        groups: priced(s.groups, id, panels),
        overrides: {
          ...s.overrides,
          [id]: { ...s.overrides[id], panels: [...panels], ...sizedBy(panels) },
        },
      })),
    setPanels: (id, panels, live = false) =>
      set((s) => {
        const overrides = live ? s.overrides : held(s);
        const settled = panels ? settledPanels(panels) : null;
        const patch = settled
          ? {
              panels: settled.panels,
              width: settled.width,
              depth: settled.depth,
              height: settled.height,
            }
          : {};
        const { panels: _was, ...rest } = overrides[id] ?? {};
        return {
          groups: priced(s.groups, id, settled?.panels),
          overrides: { ...overrides, [id]: { ...rest, ...patch } },
          panelId:
            s.panelId && settled?.panels.some((p) => p.id === s.panelId)
              ? s.panelId
              : null,
          ...(live ? {} : remember(s)),
        };
      }),
    clearCart: () => set({ cart: [] }),
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
      set((s) => {
        const overrides = held(s);
        return {
          overrides: { ...overrides, [id]: { ...overrides[id], ...patch } },
          ...remember(s),
        };
      }),
    placeAll: (places) =>
      set((s) => {
        const overrides = { ...s.overrides };
        for (const [id, patch] of Object.entries(places))
          overrides[id] = { ...overrides[id], ...patch };
        return { overrides, ...remember(s) };
      }),
    removeNode: (id) =>
      set((s) => {
        const overrides = { ...held(s) };
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
    dragStart: () => set((s) => ({ dragFrom: snap(s), overrides: held(s) })),
    dragMove: (id, x, y) =>
      set((s) => ({
        overrides: { ...s.overrides, [id]: { ...s.overrides[id], x, y } },
      })),
    turnMove: (id, rotation) =>
      set((s) => ({
        overrides: { ...s.overrides, [id]: { ...s.overrides[id], rotation } },
      })),
    nudgeAll: (dx, dy, roomId, firstId) =>
      set((s) => {
        const overrides = { ...held(s) };
        if (!dx && !dy) return { overrides };
        for (const g of s.groups)
          for (const n of g.items) {
            const o = overrides[n.id];
            if (
              n.kind === "fixed" ||
              o?.x === undefined ||
              o?.y === undefined ||
              !inRoom(o, roomId, firstId)
            )
              continue;
            overrides[n.id] = { ...o, x: o.x + dx, y: o.y + dy };
          }
        return { overrides };
      }),
    removeRoomPieces: (roomId, firstId) =>
      set((s) => {
        const gone = new Set(
          s.groups
            .flatMap((g) => g.items)
            .filter(
              (n) =>
                n.kind !== "fixed" &&
                inRoom(s.overrides[n.id] ?? {}, roomId, firstId),
            )
            .map((n) => n.id),
        );
        if (gone.size === 0) return {};
        const overrides = { ...s.overrides };
        for (const id of gone) delete overrides[id];
        return {
          groups: s.groups
            .map((g) => ({
              ...g,
              items: g.items.filter((n) => !gone.has(n.id)),
            }))
            .filter((g) => g.items.length > 0),
          cart: s.cart.filter((x) => !gone.has(x)),
          labels: s.labels.filter((x) => !gone.has(x)),
          overrides,
          selectedId:
            s.selectedId && gone.has(s.selectedId) ? null : s.selectedId,
          ...remember(s),
        };
      }),
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
