import { create } from "zustand";

/**
 * What the toolbar holds and the surfaces follow: the mode, the tool,
 * which view is on the main surface, whether the panels are hidden to
 * look at the room, the loading line, and the Preview run. Preview walks
 * a fixed path: generating (the line on the toolbar's edge), revealing
 * (the divider sweeps from the right edge to the left, the render filling
 * in behind it), done (the render stands alone), compare (with the panels
 * hidden, the divider sits in the middle and can be dragged: the sketch
 * stays left of it, the render right).
 */
export type Mode = "edit" | "preview";
export type Tool = "select" | "wall";
export type View = "3d" | "2d";
export type PreviewStatus =
  | "idle"
  | "generating"
  | "revealing"
  | "done"
  | "compare";
/** what the line under the toolbar is waiting for: a view swap is quick,
    a render takes its time */
export type Loading = "view" | "render" | null;

type StudioState = {
  mode: Mode;
  tool: Tool;
  view: View;
  uiHidden: boolean;
  loading: Loading;
  /** counts each start, so a repeat of the same kind restarts the line */
  loadingAt: number;
  preview: PreviewStatus;
  /** where the divider stands, 0 (all render) to 100 (all sketch) */
  split: number;
  setMode: (mode: Mode) => void;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setUiHidden: (hidden: boolean) => void;
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
  uiHidden: false,
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
            split: 100,
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
        : { view, loading: "view", loadingAt: s.loadingAt + 1 },
    ),
  setUiHidden: (uiHidden) => set({ uiHidden }),
  endLoading: () => {
    const s = get();
    set(
      s.loading === "render" && s.preview === "generating"
        ? { loading: null, preview: "revealing", split: 0 }
        : { loading: null },
    );
  },
  revealed: () => {
    if (get().preview === "revealing") set({ preview: "done" });
  },
  compare: () => set({ preview: "compare", split: 50 }),
  setSplit: (split) => set({ split: clamp(split) }),
}));
