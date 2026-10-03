import { create } from "zustand";

/**
 * What the toolbar holds and the surfaces follow: the mode, the tool
 * (Select picks and moves; Inspect picks and offers a piece's details or
 * a label for Eva; Wall draws, from the Room tab), which view is on the
 * main surface, whether the panels are hidden to look at the room, a
 * piece in focus on its own, the project panel's tab, the loading line,
 * and the Preview run. Preview walks
 * a fixed path: generating (the line on the toolbar's edge), revealing
 * (the divider sweeps left to right between the rails, the render filling
 * in behind it), done (the render stands alone), compare (with the panels
 * hidden, the divider comes in from the left to the middle and can be
 * dragged: the sketch is left of it, the render right).
 */
export type Mode = "edit" | "preview";
export type Tool = "select" | "inspect" | "wall";
/** the project panel's tabs */
export type PanelTab = "assets" | "products" | "room" | "detail";
export type View = "3d" | "2d";
export type PreviewStatus =
  | "idle"
  | "generating"
  | "revealing"
  | "done"
  | "compare";
/** the ways to look at each view: a perspective and the straight-on
    sides in 3D, the plan and the elevations in 2D, as a CAD drawing has */
export const ANGLES: Record<View, readonly string[]> = {
  "3d": ["Perspective", "Front", "Back", "Left", "Right", "Top"],
  "2d": ["Plan", "Front", "Back", "Left", "Right"],
};
export type Angle = (typeof ANGLES)[View][number];

/** what the line under the toolbar is waiting for: a view swap is quick,
    a render takes its time */
export type Loading = "view" | "render" | null;

type StudioState = {
  mode: Mode;
  tool: Tool;
  view: View;
  /** how the view is looked at, one of ANGLES[view] */
  angle: Angle;
  uiHidden: boolean;
  /** where the toolbar's eye was when the panels were hidden, so the peek
      bar's eye stands in the same place */
  peekAt: { top: number; left: number } | null;
  /** a piece shown on its own, on a blank ground */
  focusId: string | null;
  panelTab: PanelTab;
  loading: Loading;
  /** counts each start, so a repeat of the same kind restarts the line */
  loadingAt: number;
  preview: PreviewStatus;
  /** where the divider stands, as a percent of the stage's width */
  split: number;
  setMode: (mode: Mode) => void;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setAngle: (angle: Angle) => void;
  setUiHidden: (hidden: boolean, at?: { top: number; left: number }) => void;
  setFocus: (id: string | null) => void;
  setPanelTab: (tab: PanelTab) => void;
  /** the line reached the end */
  endLoading: () => void;
  /** the sweep reached the end */
  revealed: () => void;
  /** bring the divider to the middle and let it be dragged */
  compare: () => void;
  setSplit: (split: number) => void;
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
  peekAt: null,
  focusId: null,
  panelTab: "assets",
  loading: null,
  loadingAt: 0,
  preview: "idle",
  split: 0,
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
  setTool: (tool) => set({ tool }),
  setView: (view) =>
    set((s) =>
      s.view === view
        ? {}
        : {
            view,
            angle: ANGLES[view][0]!,
            loading: "view",
            loadingAt: s.loadingAt + 1,
          },
    ),
  setAngle: (angle) => set({ angle }),
  setUiHidden: (uiHidden, at) =>
    set({ uiHidden, peekAt: uiHidden ? (at ?? null) : null }),
  setFocus: (focusId) => set({ focusId }),
  setPanelTab: (panelTab) => set({ panelTab }),
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
}));
