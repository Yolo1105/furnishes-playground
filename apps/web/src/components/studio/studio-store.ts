import { create } from "zustand";
import type { Product } from "./catalogue";
import type { WheelMode } from "./input";

/**
 * What the toolbar holds and the surfaces follow: the mode, the tool
 * (Select picks and moves; Inspect picks and offers a piece's details or
 * a label for Eva; Wall draws, from the Room tab; Measure reads a
 * distance off the plan), which view is on the main surface, how far
 * the plan is zoomed and panned, whether the panels are hidden to look at the room, a
 * piece in focus on its own, the project panel's tab, the loading line,
 * and the Preview run. Preview walks
 * a fixed path: generating (the line on the toolbar's edge), revealing
 * (the divider sweeps left to right between the rails, the render filling
 * in behind it), done (the render stands alone), compare (with the panels
 * hidden, the divider comes in from the left to the middle and can be
 * dragged: the sketch is left of it, the render right).
 */
export type Mode = "edit" | "preview";
export type Tool = "select" | "inspect" | "wall" | "measure";
/** how far the plan can be zoomed, and by how much a step zooms */
export const ZOOM = { min: 0.5, max: 4, step: 1.15 };
/** the project panel's tabs */
type PanelTab = "assets" | "products" | "room" | "detail";
/** Eva's tabs */
type EvaTab = "agent" | "history" | "preference";
/** the shelf's tabs */
export type ShelfTab = "saved" | "cart";
export type View = "3d" | "2d";
type PreviewStatus = "idle" | "generating" | "revealing" | "done" | "compare";
/** the ways to look at each view: a perspective and the straight-on
    sides in 3D, the plan and the elevations in 2D, as a CAD drawing has */
export const ANGLES: Record<View, readonly string[]> = {
  "3d": ["Perspective", "Front", "Back", "Left", "Right", "Top"],
  "2d": ["Plan", "Front", "Back", "Left", "Right"],
};
export type Angle = (typeof ANGLES)[View][number];

/** what the line under the toolbar is waiting for: a view swap is quick,
    a render takes its time */
type Loading = "view" | "render" | null;

type StudioState = {
  mode: Mode;
  tool: Tool;
  view: View;
  /** how the view is looked at, one of ANGLES[view] */
  angle: Angle;
  uiHidden: boolean;
  /** walking the room in 3D at eye height */
  walk: boolean;
  /** where the toolbar's eye was when the panels were hidden, so the peek
      bar's eye stands in the same place */
  peekAt: { top: number; left: number } | null;
  /** a piece shown on its own, on a blank ground */
  focusId: string | null;
  panelTab: PanelTab;
  evaTab: EvaTab;
  shelfTab: ShelfTab;
  loading: Loading;
  /** counts each start, so a repeat of the same kind restarts the line */
  loadingAt: number;
  preview: PreviewStatus;
  /** where the divider stands, as a percent of the stage's width */
  split: number;
  /** the plan's zoom (1 is the sheet fitted) and pan, px */
  planZoom: number;
  planPan: { x: number; y: number };
  /** what a plain wheel does on the plan: see input.ts */
  wheelMode: WheelMode;
  /** a product being dragged towards the room, from a tile or a card */
  carrying: Product | null;
  setMode: (mode: Mode) => void;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setAngle: (angle: Angle) => void;
  setWalk: (walk: boolean) => void;
  setUiHidden: (hidden: boolean, at?: { top: number; left: number }) => void;
  setFocus: (id: string | null) => void;
  setPanelTab: (tab: PanelTab) => void;
  setEvaTab: (tab: EvaTab) => void;
  setShelfTab: (tab: ShelfTab) => void;
  /** the line reached the end */
  endLoading: () => void;
  /** the sweep reached the end */
  revealed: () => void;
  /** bring the divider to the middle and let it be dragged */
  compare: () => void;
  setSplit: (split: number) => void;
  /** zoom the plan by a factor, about a point (px from the sheet's
      middle) so what is under the pointer stays put */
  zoomPlan: (factor: number, about?: { x: number; y: number }) => void;
  panPlan: (dx: number, dy: number) => void;
  /** the sheet fitted again */
  fitPlan: () => void;
  setWheelMode: (wheelMode: WheelMode) => void;
  setCarrying: (carrying: Product | null) => void;
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export const other = (v: View): View => (v === "3d" ? "2d" : "3d");
export const viewName = (v: View) => (v === "3d" ? "3D view" : "2D plan");

export const useStudio = create<StudioState>((set, get) => ({
  mode: "edit",
  tool: "select",
  view: "3d",
  angle: "Perspective",
  uiHidden: false,
  walk: false,
  peekAt: null,
  focusId: null,
  panelTab: "assets",
  evaTab: "agent",
  shelfTab: "saved",
  loading: null,
  loadingAt: 0,
  preview: "idle",
  split: 0,
  planZoom: 1,
  planPan: { x: 0, y: 0 },
  wheelMode: "auto",
  carrying: null,
  setMode: (mode) =>
    set((s) =>
      mode === "preview"
        ? {
            mode,
            preview: "generating",
            split: 0,
            loading: "render",
            loadingAt: s.loadingAt + 1,
          }
        : { mode, preview: "idle", split: 0, loading: null },
    ),
  // measuring is done on the plan: the tool brings the plan up, and
  // leaving the plan puts the tool down
  setTool: (tool) =>
    set((s) =>
      tool === "measure" && s.view !== "2d"
        ? {
            tool,
            view: "2d",
            angle: ANGLES["2d"][0]!,
            walk: false,
            loading: "view",
            loadingAt: s.loadingAt + 1,
          }
        : { tool },
    ),
  setView: (view) =>
    set((s) =>
      s.view === view
        ? {}
        : {
            view,
            angle: ANGLES[view][0]!,
            walk: false,
            loading: "view",
            loadingAt: s.loadingAt + 1,
            ...(view === "3d" && s.tool === "measure"
              ? { tool: "select" as const }
              : {}),
          },
    ),
  setAngle: (angle) => set({ angle, walk: false }),
  setWalk: (walk) => set({ walk }),
  setUiHidden: (uiHidden, at) =>
    set((s) => ({
      uiHidden,
      peekAt: uiHidden ? (at ?? null) : null,
      // comparing belongs to looking: with the panels back, the render
      // stands whole again
      ...(!uiHidden && s.preview === "compare"
        ? { preview: "done" as const, split: 100 }
        : {}),
    })),
  setFocus: (focusId) => set({ focusId }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setEvaTab: (evaTab) => set({ evaTab }),
  setShelfTab: (shelfTab) => set({ shelfTab }),
  endLoading: () => {
    const s = get();
    set(
      s.loading === "render" && s.preview === "generating"
        ? { loading: null, preview: "revealing", split: 100 }
        : { loading: null },
    );
  },
  revealed: () => {
    if (get().preview === "revealing") set({ preview: "done" });
  },
  compare: () => {
    // the render is already everywhere: the sketch slides in from the
    // left once that frame has painted
    set({ preview: "compare", split: 0 });
    window.setTimeout(() => {
      if (get().preview === "compare") set({ split: 50 });
    }, 40);
  },
  setSplit: (split) => set({ split: clamp(split) }),
  zoomPlan: (factor, about = { x: 0, y: 0 }) =>
    set((s) => {
      const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, s.planZoom * factor));
      const k = zoom / s.planZoom;
      return {
        planZoom: zoom,
        planPan: {
          x: about.x - (about.x - s.planPan.x) * k,
          y: about.y - (about.y - s.planPan.y) * k,
        },
      };
    }),
  panPlan: (dx, dy) =>
    set((s) => ({ planPan: { x: s.planPan.x + dx, y: s.planPan.y + dy } })),
  fitPlan: () => set({ planZoom: 1, planPan: { x: 0, y: 0 } }),
  setWheelMode: (wheelMode) => set({ wheelMode }),
  setCarrying: (carrying) => set({ carrying }),
}));
