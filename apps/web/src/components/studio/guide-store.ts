import { create } from "zustand";

/**
 * The guides. The tour is the first-visit welcome, a large card in the
 * middle, and then a walk through the studio: each step puts a focus
 * border on a panel and says what it does; Skip ends it at any step,
 * and the Guide mark in the toolbar runs the same tour again. The wall
 * how-to is a small card of its own. Whether each was seen is kept in
 * the browser.
 */
type GuideId = "intro" | "walls";

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
      "Plan a room with Furnishes pieces: pick or draw the room, put pieces in, see it rendered, and buy what you keep.",
      "Eva plans with you on the right; the project and its pieces live on the left; the room is the stage behind everything.",
      "Take the short tour to see where each thing is, or skip it and start.",
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

/** where a tour step's card stands against its target */
export type TourSide = "center" | "right" | "left" | "below" | "above";

type TourStep = {
  id: string;
  title: string;
  body: string;
  /** a selector for the panel to put the focus border on; none for the welcome */
  target: string | null;
  side: TourSide;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    title: GUIDES.intro.title,
    body: GUIDES.intro.lines.join(" "),
    target: null,
    side: "center",
  },
  {
    id: "project",
    title: "The project panel",
    body: "Assets lists everything in the room, grouped the way furniture relates. Products is the catalogue. Room sets the flat, its shape and finish. Detail changes a piece or one of its components.",
    target: ".shell-rail-left",
    side: "right",
  },
  {
    id: "toolbar",
    title: "The toolbar",
    body: "Edit or Preview. Select picks and moves; Inspect offers a piece's details or a label for Eva; Add opens the parts and pieces. The eye hides every panel to look at the room. Then undo, redo, Eva's preferences, this guide, and Export.",
    target: ".main-top",
    side: "below",
  },
  {
    id: "room",
    title: "The room",
    body: "The room is the stage behind the panels. Click a piece to pick it everywhere; drag a product from the catalogue and drop it here. Preview renders it and sweeps the render in over the sketch.",
    target: ".shell-main",
    side: "center",
  },
  {
    id: "shelf",
    title: "Saved and Cart",
    body: "Saved holds the Furnishes pieces in the room, what can be bought. Hover one and press its cart; the Cart tab counts and sums what you will buy.",
    target: ".main-shelf",
    side: "above",
  },
  {
    id: "view",
    title: "The other view",
    body: "The plan while the 3D view is in the main, or the other way round; the swap trades them. Drag the handle under it to give Eva more room.",
    target: ".shell-panel-view",
    side: "left",
  },
  {
    id: "eva",
    title: "Eva",
    body: "Ask Eva to plan, price and fit the room. History keeps the conversations; Preference holds what she keeps to, and Exploration sets that aside when you want her open to anything.",
    target: ".shell-panel-eva",
    side: "left",
  },
];

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
  /** the small card that is open, if any */
  open: GuideId | null;
  /** the tour's step, or null while it is not running */
  tour: number | null;
  dismissed: Dismissed;
  hydrated: boolean;
  /** read the browser's record once, on the client; a first visit starts the tour */
  hydrate: () => void;
  /** show a small guide; `force` ignores "don't show next time" */
  show: (id: GuideId, force?: boolean) => void;
  close: () => void;
  setDismissed: (id: GuideId, value: boolean) => void;
  startTour: () => void;
  tourTo: (step: number) => void;
  /** finish or skip: the tour is then seen, and not shown on its own again */
  endTour: () => void;
};

export const useGuide = create<GuideState>((set, get) => ({
  open: null,
  tour: null,
  dismissed: {},
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return;
    const dismissed = read();
    set({ dismissed, hydrated: true, tour: dismissed.intro ? null : 0 });
  },
  show: (id, force = false) => {
    if (id === "intro") {
      get().startTour();
      return;
    }
    if (!force && get().dismissed[id]) return;
    set({ open: id });
  },
  close: () => set({ open: null }),
  setDismissed: (id, value) => {
    const dismissed = { ...get().dismissed, [id]: value };
    write(dismissed);
    set({ dismissed });
  },
  startTour: () => set({ tour: 0, open: null }),
  tourTo: (step) =>
    set({ tour: Math.max(0, Math.min(TOUR_STEPS.length - 1, step)) }),
  endTour: () => {
    get().setDismissed("intro", true);
    set({ tour: null });
  },
}));
