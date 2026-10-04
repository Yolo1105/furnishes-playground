import { useEffect } from "react";
import { create } from "zustand";
import { useGenerations, type Generation } from "./generation-store";
import { useGuide, type Dismissed } from "./guide-store";
import { useOrders, type Order } from "./order-store";
import { useProjects, type Project } from "./project-store";

/**
 * The browser stays the truth; the account mirrors it. Signed in, what
 * the account holds is pulled once and merged with what is here, the
 * merged whole is pushed back, and every change after that is pushed a
 * moment later. The merge is by id: a project goes to the newer copy
 * and stays gone where either side deleted it later than it changed;
 * an order keeps the state that moved on from "awaiting payment"; a
 * generation stays gone where either side removed it, and is otherwise
 * this browser's; the guide's record is the union of what was seen.
 * The view and the wheel are the device's own and are not mirrored.
 */
type Gone = Record<string, number>;
type SyncBody = {
  projects: { projects: Project[]; gone: Gone };
  orders: Order[];
  generations: { generations: Generation[]; gone: Gone };
  guides: Dismissed;
};
const PUSH_AFTER = 1500; // ms after the last change

type SyncState = {
  state: "idle" | "syncing" | "synced" | "failed";
  /** when the account last took the mirror, epoch ms */
  at: number | null;
};
export const useSyncState = create<SyncState>(() => ({
  state: "idle",
  at: null,
}));

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

const mergeGuides = (mine: Dismissed, theirs: Dismissed): Dismissed => {
  const out: Dismissed = { ...mine };
  for (const [id, seen] of Object.entries(theirs))
    if (seen) out[id as keyof Dismissed] = true;
  return out;
};

/** what the browser holds, in the mirror's shape */
const collect = (): SyncBody => {
  const p = useProjects.getState();
  const g = useGenerations.getState();
  return {
    projects: { projects: p.projects, gone: p.gone },
    orders: useOrders.getState().orders,
    generations: { generations: g.generations, gone: g.gone },
    guides: useGuide.getState().dismissed,
  };
};

const push = async (body: SyncBody) => {
  useSyncState.setState({ state: "syncing" });
  const r = await fetch("/api/sync", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`sync ${r.status}`);
  const { at } = (await r.json()) as { at: number };
  useSyncState.setState({ state: "synced", at });
};

/** the account's copy, merged into the stores; false when not signed in */
const pull = async () => {
  const r = await fetch("/api/sync");
  if (r.status === 401) return false;
  if (!r.ok) throw new Error(`sync ${r.status}`);
  const { data } = (await r.json()) as { data: Partial<SyncBody> };
  const mine = collect();
  if (data.projects)
    useProjects.getState().adopt(mergeProjects(mine.projects, data.projects));
  if (data.orders)
    useOrders.setState({ orders: mergeOrders(mine.orders, data.orders) });
  if (data.generations)
    useGenerations.setState(
      mergeGenerations(mine.generations, data.generations),
    );
  if (data.guides)
    useGuide.getState().adoptDismissed(mergeGuides(mine.guides, data.guides));
  return true;
};

/** pull, merge and push, now */
export const syncNow = async () => {
  try {
    if (await pull()) await push(collect());
  } catch {
    useSyncState.setState({ state: "failed" });
  }
};

/** mirror the browser to the account while someone is signed in */
export function useAccountSync(userId: string | null) {
  useEffect(() => {
    if (!userId) {
      useSyncState.setState({ state: "idle", at: null });
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubs: (() => void)[] = [];
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        push(collect()).catch(() => useSyncState.setState({ state: "failed" }));
      }, PUSH_AFTER);
    };
    void syncNow().then(() => {
      if (stopped) return;
      unsubs.push(
        useProjects.subscribe((s, prev) => {
          if (s.projects !== prev.projects || s.gone !== prev.gone) soon();
        }),
        useOrders.subscribe((s, prev) => {
          if (s.orders !== prev.orders) soon();
        }),
        useGenerations.subscribe((s, prev) => {
          if (s.generations !== prev.generations || s.gone !== prev.gone)
            soon();
        }),
        useGuide.subscribe((s, prev) => {
          if (s.dismissed !== prev.dismissed) soon();
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
