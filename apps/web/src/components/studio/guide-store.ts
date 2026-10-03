import { create } from "zustand";

/**
 * The guides: short cards that explain a part of the studio once, and
 * again whenever asked. "Don't show next time" is kept in the browser,
 * so the card stays away on later visits until the Guide button in the
 * toolbar brings it back.
 */
export type GuideId = "intro" | "walls";

export type Guide = {
  id: GuideId;
  title: string;
  lines: string[];
};

export const GUIDES: Record<GuideId, Guide> = {
  intro: {
    id: "intro",
    title: "Welcome to the studio",
    lines: [
      "Assets, Products and Room sit on the left. Pick or draw a room, then add pieces from the catalogue.",
      "The toolbar switches between Edit and Preview. Preview renders the room and lets you compare before and after.",
      "Eva on the right plans with you: ask, look back through History, set your Preference.",
    ],
  },
  walls: {
    id: "walls",
    title: "How to draw walls",
    lines: [
      "Click on the canvas to start a wall. Move the pointer to set its length.",
      "Click again to place it, and carry on until the room closes.",
    ],
  },
};

export const GUIDE_STORAGE_KEY = "furnishes.guides";

type Dismissed = Partial<Record<GuideId, boolean>>;

const read = (): Dismissed => {
  try {
    const raw = localStorage.getItem(GUIDE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Dismissed) : {};
  } catch {
    return {};
  }
};
const write = (d: Dismissed) => {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* private mode or blocked storage: the choice lasts the session */
  }
};

type GuideState = {
  open: GuideId | null;
  dismissed: Dismissed;
  hydrated: boolean;
  /** read the browser's record once, on the client */
  hydrate: () => void;
  /** show a guide; `force` ignores "don't show next time" (the toolbar does) */
  show: (id: GuideId, force?: boolean) => void;
  close: () => void;
  setDismissed: (id: GuideId, value: boolean) => void;
};

export const useGuide = create<GuideState>((set, get) => ({
  open: null,
  dismissed: {},
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    set({ dismissed: read(), hydrated: true });
  },
  show: (id, force = false) => {
    if (!force && get().dismissed[id]) return;
    set({ open: id });
  },
  close: () => set({ open: null }),
  setDismissed: (id, value) => {
    const dismissed = { ...get().dismissed, [id]: value };
    write(dismissed);
    set({ dismissed });
  },
}));
