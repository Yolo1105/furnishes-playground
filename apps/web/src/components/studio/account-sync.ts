import { useEffect } from "react";
import { create } from "zustand";
import { useBoard, type Picture } from "./board-store";
import { useGenerations, type Generation } from "./generation-store";
import { useGuide, type Dismissed } from "./guide-store";
import { useOrders, type Order } from "./order-store";
import { useProjects, type Project } from "./project-store";

/**
 * The browser stays the truth; the account mirrors it. Signed in, what
 * the account holds is pulled and merged with what is here, the
 * merged whole is pushed back, and every change after that is pushed a
 * moment later, saying the time the mirror was last seen at; when
 * another device has pushed since, the account's copy comes back
 * instead, is merged the same way, and the merged whole goes up, so
 * two devices never write over each other. A change is pushed as the
 * document it is in alone (a renamed project is the projects, a
 * starred picture the board), so no push weighs more than one
 * document; the first push after a pull, and the push after a merge,
 * carry the whole. Coming back to the tab pulls again. The merge is
 * by id: a project goes to the newer copy
 * and stays gone where either side deleted it later than it changed;
 * an order keeps the state that moved on from "awaiting payment"; a
 * generation stays gone where either side removed it, and is otherwise
 * this browser's, as a picture on the board is (the newer copy of its
 * words wins); the guide's record is the union of what was seen.
 * The view and the wheel are the device's own and are not mirrored.
 */
type Gone = Record<string, number>;
type SyncBody = {
  projects: { projects: Project[]; gone: Gone };
  orders: Order[];
  generations: { generations: Generation[]; gone: Gone };
  guides: Dismissed;
  board: { pictures: Picture[]; gone: Gone };
};
const PUSH_AFTER = 1500; // ms after the last change

type SyncState = {
  state: "idle" | "syncing" | "synced" | "failed";
  /** when the account last took the mirror, epoch ms */
  at: number | null;
  /** a word for the user bar when the account changed what is open */
  note: string | null;
};
export const useSyncState = create<SyncState>(() => ({
  state: "idle",
  at: null,
  note: null,
}));
const NOTE_FOR = 6000; // ms
let noteTimer: ReturnType<typeof setTimeout> | undefined;
/** a line said at the foot of the studio for a moment */
export const toast = (note: string) => {
  useSyncState.setState({ note });
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => useSyncState.setState({ note: null }), NOTE_FOR);
};

const laterGone = (a: Gone, b: Gone): Gone => {
  const out: Gone = { ...a };
  for (const [id, at] of Object.entries(b))
    if ((out[id] ?? 0) < at) out[id] = at;
  return out;
};

const mergeProjects = (
  mine: SyncBody["projects"],
  theirs: SyncBody["projects"],
): SyncBody["projects"] => {
  const gone = laterGone(mine.gone, theirs.gone);
  const byId = new Map<string, Project>();
  for (const p of [...theirs.projects, ...mine.projects]) {
    const cur = byId.get(p.id);
    if (!cur || p.at > cur.at) byId.set(p.id, p);
  }
  const projects = [...byId.values()].filter((p) => (gone[p.id] ?? -1) < p.at);
  return {
    projects: projects.length ? projects : mine.projects.slice(0, 1),
    gone,
  };
};

const mergeOrders = (mine: Order[], theirs: Order[]): Order[] => {
  const byId = new Map(theirs.map((o) => [o.id, o]));
  for (const o of mine) {
    const t = byId.get(o.id);
    if (!t || (t.status === "pending_payment" && o.status !== t.status))
      byId.set(o.id, o);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at);
};

const mergeGenerations = (
  mine: SyncBody["generations"],
  theirs: SyncBody["generations"],
): SyncBody["generations"] => {
  const gone = laterGone(mine.gone, theirs.gone);
  const byId = new Map<string, Generation>();
  for (const g of [...theirs.generations, ...mine.generations])
    byId.set(g.id, g);
  return {
    generations: [...byId.values()]
      .filter((g) => (gone[g.id] ?? -1) < g.at)
      .sort((a, b) => b.at - a.at),
    gone,
  };
};

const mergeBoard = (
  mine: SyncBody["board"],
  theirs: SyncBody["board"],
): SyncBody["board"] => {
  const gone = laterGone(mine.gone, theirs.gone);
  const byId = new Map<string, Picture>();
  for (const p of [...theirs.pictures, ...mine.pictures]) {
    const cur = byId.get(p.id);
    if (!cur || p.at > cur.at) byId.set(p.id, p);
  }
  return {
    pictures: [...byId.values()]
      .filter((p) => (gone[p.id] ?? -1) < p.at)
      .sort((a, b) => b.at - a.at),
    gone,
  };
};

const mergeGuides = (mine: Dismissed, theirs: Dismissed): Dismissed => {
  const out: Dismissed = { ...mine };
  for (const [id, seen] of Object.entries(theirs))
    if (seen) out[id as keyof Dismissed] = true;
  return out;
};

type Kind = keyof SyncBody;
const KINDS: Kind[] = ["projects", "orders", "generations", "guides", "board"];

/** what the browser holds, in the mirror's shape */
const collect = (): SyncBody => {
  const p = useProjects.getState();
  const g = useGenerations.getState();
  const b = useBoard.getState();
  return {
    projects: { projects: p.projects, gone: p.gone },
    orders: useOrders.getState().orders,
    generations: { generations: g.generations, gone: g.gone },
    guides: useGuide.getState().dismissed,
    board: { pictures: b.pictures, gone: b.gone },
  };
};

/** the time the mirror was last seen at, said with every push */
let seen: number | null = null;
/** the documents changed since the last push went through */
const changed = new Set<Kind>();

/** the account's copy taken into the stores, merged with what is here */
const takeIn = (data: Partial<SyncBody>) => {
  const mine = collect();
  if (
    data.projects &&
    useProjects.getState().adopt(mergeProjects(mine.projects, data.projects))
  )
    toast("The open project came up to date from your account");
  if (data.orders)
    useOrders.setState({ orders: mergeOrders(mine.orders, data.orders) });
  if (data.generations)
    useGenerations.setState(
      mergeGenerations(mine.generations, data.generations),
    );
  if (data.guides)
    useGuide.getState().adoptDismissed(mergeGuides(mine.guides, data.guides));
  if (data.board) useBoard.getState().adopt(mergeBoard(mine.board, data.board));
};

type Mirror = { data: Partial<SyncBody>; at: number | null };

const put = (body: Partial<SyncBody>) =>
  fetch("/api/sync", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, ifAt: seen }),
  });

/** the browser's copy up to the account, whole or the documents
    named; the account's copy taken in and the merged whole pushed
    when another device moved on since */
const push = async (kinds: Kind[] = KINDS) => {
  if (!kinds.length) return;
  useSyncState.setState({ state: "syncing" });
  // the marks go with the push: a change made while it is on its way
  // marks its document anew for the next one; a push that fails
  // gives its marks back
  for (const k of kinds) changed.delete(k);
  try {
    const whole = collect();
    let r = await put(
      Object.fromEntries(kinds.map((k) => [k, whole[k]])) as Partial<SyncBody>,
    );
    if (r.status === 409) {
      const theirs = (await r.json()) as Mirror;
      seen = theirs.at;
      takeIn(theirs.data);
      r = await put(collect());
    }
    if (!r.ok) throw new Error(`sync ${r.status}`);
    const { at } = (await r.json()) as { at: number };
    seen = at;
    useSyncState.setState({ state: "synced", at });
  } catch (e) {
    for (const k of kinds) changed.add(k);
    throw e;
  }
};

/** the account's copy, merged into the stores; false when not signed in */
const pull = async () => {
  const r = await fetch("/api/sync");
  if (r.status === 401) return false;
  if (!r.ok) throw new Error(`sync ${r.status}`);
  const theirs = (await r.json()) as Mirror;
  seen = theirs.at;
  takeIn(theirs.data);
  return true;
};

/** pull, merge and push, now */
export const syncNow = async () => {
  try {
    if (await pull()) await push();
  } catch {
    useSyncState.setState({ state: "failed" });
  }
};

/** mirror the browser to the account while someone is signed in */
export function useAccountSync(userId: string | null) {
  useEffect(() => {
    if (!userId) {
      // a note already said (the confirmation's word, say) stays its
      // moment: the session is not known yet on the first render
      seen = null;
      changed.clear();
      useSyncState.setState({ state: "idle", at: null });
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubs: (() => void)[] = [];
    // a change marks its document; the push a moment later carries
    // every document marked since the last one went through
    const soon = (kind: Kind) => {
      changed.add(kind);
      clearTimeout(timer);
      timer = setTimeout(() => {
        push([...changed]).catch(() =>
          useSyncState.setState({ state: "failed" }),
        );
      }, PUSH_AFTER);
    };
    // back to the tab: what another device pushed meanwhile comes in
    const onShown = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    document.addEventListener("visibilitychange", onShown);
    unsubs.push(() =>
      document.removeEventListener("visibilitychange", onShown),
    );
    void syncNow().then(() => {
      if (stopped) return;
      unsubs.push(
        useProjects.subscribe((s, prev) => {
          if (s.projects !== prev.projects || s.gone !== prev.gone)
            soon("projects");
        }),
        useOrders.subscribe((s, prev) => {
          if (s.orders !== prev.orders) soon("orders");
        }),
        useGenerations.subscribe((s, prev) => {
          if (s.generations !== prev.generations || s.gone !== prev.gone)
            soon("generations");
        }),
        useGuide.subscribe((s, prev) => {
          if (s.dismissed !== prev.dismissed) soon("guides");
        }),
        useBoard.subscribe((s, prev) => {
          if (s.pictures !== prev.pictures || s.gone !== prev.gone)
            soon("board");
        }),
      );
    });
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, [userId]);
}
