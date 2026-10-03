import { create } from "zustand";

/**
 * What the toolbar holds and the main surface follows: the mode, the
 * tool, and the Preview run. Preview walks a fixed path: generating
 * (the line along the top), revealing (the divider sweeps the render in
 * over the sketch), done (the render stands alone, the compare button
 * shows), compare (the divider sits in the middle and can be dragged).
 */
export type Mode = "edit" | "preview";
export type Tool =
  | "select"
  | "move"
  | "rotate"
  | "measure"
  | "add"
  | "wall"
  | "note";
export type PreviewStatus =
  | "idle"
  | "generating"
  | "revealing"
  | "done"
  | "compare";

type StudioState = {
  mode: Mode;
  tool: Tool;
  preview: PreviewStatus;
  /** where the divider stands, 0 (all sketch) to 100 (all render) */
  split: number;
  setMode: (mode: Mode) => void;
  setTool: (tool: Tool) => void;
  /** the next step of the Preview run */
  advance: () => void;
  /** bring the divider to the middle and let it be dragged */
  compare: () => void;
  setSplit: (split: number) => void;
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export const useStudio = create<StudioState>((set, get) => ({
  mode: "edit",
  tool: "select",
  preview: "idle",
  split: 0,
  setMode: (mode) =>
    set(
      mode === "preview"
        ? { mode, preview: "generating", split: 0 }
        : { mode, preview: "idle", split: 0 },
    ),
  setTool: (tool) => set({ tool }),
  advance: () => {
    const p = get().preview;
    if (p === "generating") set({ preview: "revealing", split: 100 });
    else if (p === "revealing") set({ preview: "done" });
  },
  compare: () => set({ preview: "compare", split: 50 }),
  setSplit: (split) => set({ split: clamp(split) }),
}));
