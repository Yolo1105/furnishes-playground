import { useEffect } from "react";
import { create } from "zustand";
import { useEva } from "./eva-store";
import { newId } from "./ids";
import {
  type FlatType,
  fromLegacyOpenings,
  openingsFor,
  rulesFor,
} from "./room-data";
import type { Point } from "./room-templates";
import { type RoomSpec, useRoom } from "./room-store";
import { useScene } from "./scene-store";
import {
  ARRANGEMENTS,
  arrangementOf,
  ASSET_KINDS,
  type AssetNode,
} from "./assets-data";
import { products } from "./catalogue";

/**
 * The projects: each holds a room (its walls, size and finishes), what
 * stands in it (the pieces, the cart, the labels, every edit) and Eva's
 * side of it (the conversations and the preferences). One is open; the
 * stores hold its contents, and every change is kept into it a moment
 * later. The projects live in the browser; signed in, the account
 * mirrors them (account-sync), so a deleted one is remembered as gone
 * with the time, and a merged list can be adopted whole. The studio
 * opens the project a link names (?project=id, from the account page)
 * once what was kept is back. A room is shared as a snapshot without
 * Eva's side, shown read-only on the share page, and taken in from
 * there as a project of one's own. A snapshot carries the version of
 * its shape; one kept by an earlier studio is brought up to the current
 * shape as it is read, so nothing kept is ever stale.
 */
const KEY = "furnishes.projects";
/** the shape of a snapshot: raised when the shape changes, with a step
    in `upgrade` that brings the older shape up */
const SNAPSHOT_VERSION = 2;
const SAVE_AFTER = 600; // ms after the last change
/** the studio's own flat, the one a new project opens on, by version:
    raised when the flat changes. A browser given an earlier one has
    each showcase project it was given and has not touched since made
    over to the new flat in place; a project the visitor made or
    changed is never touched, and nothing is noted gone (an account's
    copies stay too). 3: the HDB 5-room flat; 4: re-laid after a family
    planner; 5: the planner's three arrangements, a project each; 6:
    lived-in rooms; 7: the parents' bathroom at the head of their room */
const SHOWCASE_KEY = "furnishes.showcase";
const SHOWCASE = { version: 7, name: "HDB 5-room" };

type RoomData = ReturnType<typeof useRoom.getState>;
type SceneData = ReturnType<typeof useScene.getState>;
type EvaData = ReturnType<typeof useEva.getState>;

export type Snapshot = {
  /** the shape it was saved in; none before the shape was versioned */
  v?: number;
  room: Omit<RoomData, keyof FunctionsOf<RoomData>>;
  scene: Pick<SceneData, "groups" | "cart" | "labels" | "overrides">;
  eva: Pick<
    EvaData,
    | "conversations"
    | "messages"
    | "activeId"
    | "preferences"
    | "custom"
    | "exploration"
    | "persona"
  >;
};
type FunctionsOf<T> = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

export type Project = {
  id: string;
  name: string;
  /** when it was last changed, epoch ms */
  at: number;
  /** its contents; none until it is first left or saved */
  data: Snapshot | null;
};

type ProjectState = {
  projects: Project[];
  activeId: string;
  /** the ids deleted here, with when: a mirror does not bring them back */
  gone: Record<string, number>;
  /** read the stores into the open project */
  save: () => void;
  create: () => void;
  rename: (id: string, name: string) => void;
  /** the last project cannot go */
  remove: (id: string) => void;
  open: (id: string) => void;
  /** take a merged list as the projects; the open one reloads if the
      list's copy is newer, and that is said back */
  adopt: (merged: {
    projects: Project[];
    gone: Record<string, number>;
  }) => boolean;
};

const dataOnly = <T extends object>(s: T) =>
  Object.fromEntries(
    Object.entries(s).filter(([, v]) => typeof v !== "function"),
  ) as Omit<T, keyof FunctionsOf<T>>;

/** what the stores hold right now */
const snapshot = (): Snapshot => {
  const sc = useScene.getState();
  const ev = useEva.getState();
  return {
    v: SNAPSHOT_VERSION,
    room: dataOnly(useRoom.getState()),
    scene: {
      groups: sc.groups,
      cart: sc.cart,
      labels: sc.labels,
      overrides: sc.overrides,
    },
    eva: {
      conversations: ev.conversations,
      messages: ev.messages,
      activeId: ev.activeId,
      preferences: ev.preferences,
      custom: ev.custom,
      exploration: ev.exploration,
      persona: ev.persona,
    },
  };
};

/** the flat in one of its arrangements: its things and places, and
    its rooms' paint and floors */
const arranged = (id: (typeof ARRANGEMENTS)[number]["id"]): Snapshot => {
  const base = fresh();
  const a = arrangementOf(id);
  return {
    ...base,
    room: {
      ...base.room,
      rooms: base.room.rooms.map((r) => ({ ...r, ...a.rooms[r.id] })),
    },
    scene: { ...base.scene, groups: a.groups, overrides: a.overrides },
    // the studio's own flat comes with Eva's lean, as the studio opens
    eva: { ...base.eva, preferences: useEva.getInitialState().preferences },
  };
};
/** the studio's own projects: the flat in each of its arrangements,
    the first the one that opens */
type Arrangement = (typeof ARRANGEMENTS)[number]["id"];
const showcaseProjects = (): Project[] => {
  const at = Date.now();
  return ARRANGEMENTS.map((a, i) => ({
    id: newId("p"),
    name: `${SHOWCASE.name} · ${a.name}`,
    // the first the latest, so a list by time keeps their order
    at: at - i,
    data: arranged(a.id),
  }));
};
/** the arrangement each showcase project was made from, in order */
const arrangementOrder = (): Arrangement[] => ARRANGEMENTS.map((a) => a.id);

/** a fresh project's contents: the stores' defaults, Eva's slate clean */
const fresh = (): Snapshot => {
  const sc = useScene.getInitialState();
  const ev = useEva.getInitialState();
  return {
    v: SNAPSHOT_VERSION,
    room: dataOnly(useRoom.getInitialState()),
    scene: {
      groups: sc.groups,
      cart: sc.cart,
      labels: sc.labels,
      overrides: sc.overrides,
    },
    eva: {
      conversations: [],
      messages: {},
      activeId: null,
      preferences: {},
      custom: {},
      exploration: ev.exploration,
      persona: ev.persona,
    },
  };
};

/** a project's rooms as saved, or the one room a project saved before
    the flat had several: it stands at the sheet's corner. A room saved
    before openings were a list brings its door and window; one saved
    before a rule existed takes that rule's typical value */
const roomsOf = (data: Snapshot["room"]): Snapshot["room"] => {
  const base = dataOnly(useRoom.getInitialState());
  const { id: _id, pos: _pos, ...defaults } = base.rooms[0]!;
  const fill = (r: Partial<RoomSpec>): RoomSpec => {
    const room = r.room ?? defaults.room;
    const legacy = fromLegacyOpenings(
      r as Parameters<typeof fromLegacyOpenings>[0],
      r.width ?? defaults.width,
      r.depth ?? defaults.depth,
    );
    return {
      ...defaults,
      id: newId("room"),
      pos: [0, 0],
      ...r,
      openings:
        r.openings ??
        legacy ??
        openingsFor(room, defaults.width, defaults.depth),
      rules: { ...rulesFor(room), ...r.rules },
    };
  };
  if (Array.isArray(data.rooms) && data.rooms.length > 0) {
    const rooms = data.rooms.map(fill);
    return {
      ...base,
      ...data,
      rooms,
      activeId: rooms.some((r) => r.id === data.activeId)
        ? data.activeId
        : rooms[0]!.id,
    };
  }
  const one = fill(data as unknown as Partial<RoomSpec>);
  const old = data as unknown as { flat?: FlatType; stops?: Point[] };
  return {
    ...base,
    flat: old.flat ?? base.flat,
    stops: old.stops ?? [],
    rooms: [one],
    activeId: one.id,
  };
};

/* ---------- the shape's history ---------- */

const recipesByName = new Map(
  products.filter((p) => p.recipe).map((p) => [p.name.toLowerCase(), p]),
);
/** "Three-bay sideboard 2" is a three-bay sideboard */
const plainName = (name: string) => name.replace(/\s+\d+$/, "").toLowerCase();

/** to 1: a piece saved before the catalogue was real takes the recipe
    its name says, with the recipe's price; its parts share that price */
const toV1 = (node: AssetNode): AssetNode => {
  if (node.kind !== "piece" || node.productId) return node;
  const p = recipesByName.get(plainName(node.name));
  if (!p) return node;
  const children = node.children?.map((c) => ({
    ...c,
    price: Math.round(p.price / node.children!.length),
  }));
  return {
    ...node,
    productId: p.id,
    price: p.price,
    ...(children ? { children } : {}),
  };
};

/** to 2: parts modelled in the studio came in (kind "part", with the
    part's sketches and history); a node of a kind this studio does
    not know stands as a room item, and a part says its units */
const toV2 = (node: AssetNode): AssetNode => {
  if (!(ASSET_KINDS as readonly string[]).includes(node.kind))
    return { ...node, kind: "decor" };
  if (node.kind === "part" && node.part && !node.part.units)
    return { ...node, part: { ...node.part, units: "mm" } };
  return node;
};

/** a snapshot brought up to the current shape, step by step */
export const upgrade = (data: Snapshot): Snapshot => {
  const v = data.v ?? 0;
  if (v >= SNAPSHOT_VERSION) return data;
  let out = data;
  if (v < 1)
    out = {
      ...out,
      scene: {
        ...out.scene,
        groups: out.scene.groups.map((g) => ({
          ...g,
          items: g.items.map(toV1),
        })),
      },
    };
  if (v < 2)
    out = {
      ...out,
      scene: {
        ...out.scene,
        groups: out.scene.groups.map((g) => ({
          ...g,
          items: g.items.map(toV2),
        })),
      },
    };
  return { ...out, v: SNAPSHOT_VERSION };
};

/** put a project's contents into the stores, brought up to shape */
const load = (raw: Snapshot) => {
  const data = upgrade(raw);
  useRoom.setState(roomsOf(data.room));
  useScene.setState({
    ...data.scene,
    selectedId: null,
    past: [],
    future: [],
    dragFrom: null,
  });
  useEva.setState({ ...data.eva, draft: "" });
};

/** the open project's room and pieces, with Eva's side, the cart and
    the labels left out: what the room is, not what is being done in it */
export const shareable = (): Snapshot => {
  const s = snapshot();
  return {
    ...s,
    scene: { ...s.scene, cart: [], labels: [] },
    eva: fresh().eva,
  };
};
/** put a shared room into the stores to look at */
export const showSnapshot = (data: Snapshot) => load(data);

/** what the browser kept of the projects, read and written whole */
const readKept = () => {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    return raw
      ? (JSON.parse(raw) as Partial<
          Pick<ProjectState, "projects" | "activeId" | "gone">
        >)
      : {};
  } catch {
    // a save that will not read is set aside, never written over: the
    // studio opens fresh and the visitor's work can still be recovered
    try {
      if (raw) localStorage.setItem(`${KEY}.unread-${Date.now()}`, raw);
    } catch {
      /* no room to set it aside */
    }
    return {};
  }
};
const writeKept = (
  kept: Pick<ProjectState, "projects" | "activeId" | "gone">,
) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    /* the projects last the session */
  }
};

/** which of the studio's flats this browser has been given, and the
    showcase projects it was given: each by id, with its arrangement and
    the time it was given, so one the visitor has since changed is told
    from one they have not (an earlier studio kept the version alone) */
type ShowcaseGiven = {
  v: number;
  given: Record<string, { arrangement: Arrangement; at: number }>;
};
const showcaseGiven = (): ShowcaseGiven => {
  try {
    const raw = localStorage.getItem(SHOWCASE_KEY);
    if (!raw) return { v: 0, given: {} };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "number") return { v: parsed, given: {} };
    const g = parsed as Partial<ShowcaseGiven>;
    return { v: Number(g.v) || 0, given: g.given ?? {} };
  } catch {
    return { v: SHOWCASE.version, given: {} };
  }
};
const showcaseShown = (
  given: ShowcaseGiven["given"] = showcaseGiven().given,
) => {
  try {
    localStorage.setItem(
      SHOWCASE_KEY,
      JSON.stringify({ v: SHOWCASE.version, given }),
    );
  } catch {
    /* given again next time */
  }
};
/** the showcase projects as given now, noted by id */
const givenOf = (ps: readonly Project[]): ShowcaseGiven["given"] => {
  const order = arrangementOrder();
  return Object.fromEntries(
    ps.map((p, i) => [p.id, { arrangement: order[i]!, at: p.at }]),
  );
};
/**
 * The kept projects brought to the current flat without losing work:
 * each showcase project given earlier and untouched since is made over
 * in place (its id kept, so an account's copy is updated, not
 * duplicated); one the visitor changed, and every project they made,
 * stays as it is. A browser with no record of what it was given (an
 * earlier studio) keeps all it had and is given the flat beside it.
 */
export const refreshShowcase = (
  kept: readonly Project[],
  was: ShowcaseGiven,
): { projects: Project[]; given: ShowcaseGiven["given"] } => {
  const at = Date.now();
  const given: ShowcaseGiven["given"] = {};
  let refreshed = 0;
  const projects = kept.map((p) => {
    const g = was.given[p.id];
    if (!g || g.at !== p.at) return p;
    refreshed += 1;
    const made = { ...p, at, data: arranged(g.arrangement) };
    given[p.id] = { arrangement: g.arrangement, at };
    return made;
  });
  if (refreshed > 0) return { projects, given };
  const fresh = showcaseProjects();
  return {
    projects: [...fresh, ...projects],
    given: { ...given, ...givenOf(fresh) },
  };
};

/** a shared room taken in as a new project, kept and made the open
    one; the studio opens it on arrival */
export const importProject = (name: string, data: Snapshot) => {
  const kept = readKept();
  const at = Date.now();
  // the flat brought up to date first, as arrival would, so arrival
  // finds nothing left to do and the shared room stays the open one
  const was = showcaseGiven();
  const { projects: earlier, given } = !kept.projects?.length
    ? (() => {
        const ps = showcaseProjects();
        return { projects: ps, given: givenOf(ps) };
      })()
    : was.v < SHOWCASE.version
      ? refreshShowcase(kept.projects, was)
      : { projects: kept.projects, given: was.given };
  const p: Project = { id: newId("p"), name: `${name} (shared)`, at, data };
  writeKept({
    projects: [...earlier, p],
    activeId: p.id,
    gone: kept.gone ?? {},
  });
  showcaseShown(given);
  return p.id;
};

const FIRST: Project = {
  id: "p-first",
  name: "First project",
  at: 0,
  data: null,
};

export const useProjects = create<ProjectState>((set, get) => ({
  projects: [FIRST],
  activeId: FIRST.id,
  gone: {},
  save: () => {
    const { projects, activeId } = get();
    const data = snapshot();
    const open = projects.find((p) => p.id === activeId);
    // nothing changed: no new copy, no new time (a save is itself a
    // change to the list, and would otherwise call the next save)
    if (open?.data && JSON.stringify(open.data) === JSON.stringify(data))
      return;
    set({
      projects: projects.map((p) =>
        p.id === activeId ? { ...p, at: Date.now(), data } : p,
      ),
    });
  },
  create: () => {
    get().save();
    const n = get().projects.length + 1;
    const p: Project = {
      id: newId("p"),
      name: `Project ${n}`,
      at: Date.now(),
      data: fresh(),
    };
    load(p.data!);
    set((s) => ({ projects: [...s.projects, p], activeId: p.id }));
  },
  rename: (id, name) => {
    const t = name.trim();
    if (!t) return;
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, name: t } : p)),
    }));
  },
  remove: (id) => {
    const { projects, activeId } = get();
    if (projects.length <= 1) return;
    const rest = projects.filter((p) => p.id !== id);
    const gone = { ...get().gone, [id]: Date.now() };
    if (id === activeId) {
      const next = rest[0]!;
      load(next.data ?? fresh());
      set({ projects: rest, activeId: next.id, gone });
    } else set({ projects: rest, gone });
  },
  open: (id) => {
    const { projects, activeId } = get();
    if (id === activeId) return;
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    get().save();
    load(target.data ?? fresh());
    set({ activeId: id });
  },
  adopt: ({ projects, gone }) => {
    const { activeId } = get();
    const before = get().projects.find((p) => p.id === activeId);
    const active = projects.find((p) => p.id === activeId) ?? projects[0]!;
    set({ projects, gone, activeId: active.id });
    const reload = !before || active.id !== activeId || active.at > before.at;
    if (reload) load(active.data ?? fresh());
    return reload;
  },
}));

/**
 * Keep the projects in the browser: on arrival, what was kept comes back
 * and the open project fills the stores; then every change in the room,
 * the scene or Eva is saved into the open project a moment later.
 */
export function useProjectSync(wanted: string | null = null) {
  useEffect(() => {
    const kept = readKept();
    const was = showcaseGiven();
    if (!kept.projects?.length) {
      // a first visit: the flat opens in each of its arrangements, a
      // project each
      const ps = showcaseProjects();
      const gone = kept.gone ?? {};
      useProjects.setState({ projects: ps, activeId: ps[0]!.id, gone });
      load(ps[0]!.data!);
      writeKept({ projects: ps, activeId: ps[0]!.id, gone });
      showcaseShown(givenOf(ps));
    } else if (was.v < SHOWCASE.version) {
      // the flat changed since: brought over without losing a thing
      const { projects: ps, given } = refreshShowcase(kept.projects, was);
      const gone = kept.gone ?? {};
      const activeId = ps.some((p) => p.id === kept.activeId)
        ? kept.activeId!
        : ps[0]!.id;
      useProjects.setState({ projects: ps, activeId, gone });
      const open = ps.find((p) => p.id === activeId);
      if (open?.data) load(open.data);
      writeKept({ projects: ps, activeId, gone });
      showcaseShown(given);
    } else {
      useProjects.setState({
        projects: kept.projects,
        gone: kept.gone ?? {},
        activeId: kept.projects.some((p) => p.id === kept.activeId)
          ? kept.activeId!
          : kept.projects[0]!.id,
      });
      const open = useProjects
        .getState()
        .projects.find((p) => p.id === useProjects.getState().activeId);
      if (open?.data) load(open.data);
    }
    if (wanted) useProjects.getState().open(wanted);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const now = () => {
      clearTimeout(timer);
      timer = undefined;
      useProjects.getState().save();
      const { projects, activeId, gone } = useProjects.getState();
      writeKept({ projects, activeId, gone });
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(now, SAVE_AFTER);
    };
    // a change still waiting its moment is saved before the page goes
    const flush = () => {
      if (timer !== undefined) now();
    };
    window.addEventListener("pagehide", flush);
    const unsubs = [
      useRoom.subscribe(soon),
      useScene.subscribe((s, prev) => {
        if (
          s.groups !== prev.groups ||
          s.cart !== prev.cart ||
          s.labels !== prev.labels ||
          s.overrides !== prev.overrides
        )
          soon();
      }),
      useEva.subscribe((s, prev) => {
        if (s.draft === prev.draft) soon();
      }),
      useProjects.subscribe((s, prev) => {
        if (
          s.projects !== prev.projects ||
          s.activeId !== prev.activeId ||
          s.gone !== prev.gone
        )
          soon();
      }),
    ];
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the link is read with what was kept, once
  }, []);
}
