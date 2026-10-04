import { useEffect } from "react";
import { create } from "zustand";
import { useEva } from "./eva-store";
import { useRoom } from "./room-store";
import { useScene } from "./scene-store";

/**
 * The projects: each holds a room (its walls, size and finishes), what
 * stands in it (the pieces, the cart, the labels, every edit) and Eva's
 * side of it (the conversations and the preferences). One is open; the
 * stores hold its contents, and every change is kept into it a moment
 * later. The projects live in the browser until accounts land.
 */
const KEY = "furnishes.projects";
const SAVE_AFTER = 600; // ms after the last change

type RoomData = ReturnType<typeof useRoom.getState>;
type SceneData = ReturnType<typeof useScene.getState>;
type EvaData = ReturnType<typeof useEva.getState>;

type Snapshot = {
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
  /** read the stores into the open project */
  save: () => void;
  create: () => void;
  rename: (id: string, name: string) => void;
  /** the last project cannot go */
  remove: (id: string) => void;
  open: (id: string) => void;
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
    },
  };
};

/** a fresh project's contents: the stores' defaults, Eva's slate clean */
const fresh = (): Snapshot => {
  const sc = useScene.getInitialState();
  const ev = useEva.getInitialState();
  return {
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
    },
  };
};

/** put a project's contents into the stores */
const load = (data: Snapshot) => {
  useRoom.setState({ ...dataOnly(useRoom.getInitialState()), ...data.room });
  useScene.setState({
    ...data.scene,
    selectedId: null,
    past: [],
    future: [],
    dragFrom: null,
  });
  useEva.setState({ ...data.eva, draft: "" });
};

const nextId = () => `p-${Date.now().toString(36)}`;
const FIRST: Project = {
  id: "p-first",
  name: "First project",
  at: 0,
  data: null,
};

export const useProjects = create<ProjectState>((set, get) => ({
  projects: [FIRST],
  activeId: FIRST.id,
  save: () =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === s.activeId ? { ...p, at: Date.now(), data: snapshot() } : p,
      ),
    })),
  create: () => {
    get().save();
    const n = get().projects.length + 1;
    const p: Project = {
      id: nextId(),
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
    if (id === activeId) {
      const next = rest[0]!;
      load(next.data ?? fresh());
      set({ projects: rest, activeId: next.id });
    } else set({ projects: rest });
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
}));

/**
 * Keep the projects in the browser: on arrival, what was kept comes back
 * and the open project fills the stores; then every change in the room,
 * the scene or Eva is saved into the open project a moment later.
 */
export function useProjectSync() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const kept = JSON.parse(raw) as Pick<
          ProjectState,
          "projects" | "activeId"
        >;
        if (kept.projects?.length) {
          useProjects.setState({
            projects: kept.projects,
            activeId: kept.projects.some((p) => p.id === kept.activeId)
              ? kept.activeId
              : kept.projects[0]!.id,
          });
          const open = useProjects
            .getState()
            .projects.find((p) => p.id === useProjects.getState().activeId);
          if (open?.data) load(open.data);
        }
      }
    } catch {
      /* nothing kept, or storage blocked: the first project stands */
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        useProjects.getState().save();
        try {
          const { projects, activeId } = useProjects.getState();
          localStorage.setItem(KEY, JSON.stringify({ projects, activeId }));
        } catch {
          /* the project lasts the session */
        }
      }, SAVE_AFTER);
    };
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
        if (s.projects !== prev.projects || s.activeId !== prev.activeId)
          soon();
      }),
    ];
    return () => {
      clearTimeout(timer);
      unsubs.forEach((u) => u());
    };
  }, []);
}
