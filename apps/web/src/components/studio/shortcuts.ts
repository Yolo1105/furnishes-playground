import { useEffect } from "react";
import { turned } from "./piece-detail";
import { propsOf, topLevelOf, useScene } from "./scene-store";
import { useStudio, ZOOM } from "./studio-store";

/**
 * The keyboard: one key per tool and view, the eye, and undo and redo
 * with the modifier. The list is what the Keyboard shortcuts dialog
 * shows, and what `useShortcuts` listens for. Keys do nothing while
 * typing in a field.
 */
export const SHORTCUTS = [
  { keys: ["V"], does: "Select tool" },
  { keys: ["I"], does: "Inspect tool" },
  { keys: ["W"], does: "Wall tool" },
  { keys: ["M"], does: "Measure tool, on the plan" },
  { keys: ["3"], does: "3D view" },
  { keys: ["2"], does: "2D plan" },
  { keys: ["H"], does: "Hide or show the panels" },
  { keys: ["G"], does: "Walk the room in 3D (W A S D to move, drag to look)" },
  { keys: ["P"], does: "Preview, or back to Edit" },
  { keys: ["+"], does: "Zoom the plan in" },
  { keys: ["-"], does: "Zoom the plan out" },
  { keys: ["0"], does: "Fit the plan" },
  {
    keys: ["R"],
    does: "Turn the picked piece a quarter (drag its handle to turn freely)",
  },
  { keys: ["⌫"], does: "Remove the picked piece from the room" },
  { keys: ["⌘", "Z"], does: "Undo" },
  { keys: ["⌘", "⇧", "Z"], does: "Redo" },
  { keys: ["?"], does: "This list" },
  {
    keys: ["Esc"],
    does: "Close a menu, stop drawing or measuring, leave focus",
  },
] as const;

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));

export function useShortcuts(onHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.altKey) return;
      const st = useStudio.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useScene.getState().redo();
        else useScene.getState().undo();
        return;
      }
      if (mod) return;
      switch (e.key) {
        case "v":
          return st.setTool("select");
        case "i":
          return st.setTool("inspect");
        case "w":
          return st.setTool("wall");
        case "m":
          return st.setTool("measure");
        case "+":
        case "=":
          if (st.view === "2d") st.zoomPlan(ZOOM.step);
          return;
        case "-":
          if (st.view === "2d") st.zoomPlan(1 / ZOOM.step);
          return;
        case "0":
          if (st.view === "2d") st.fitPlan();
          return;
        case "3":
          return st.setView("3d");
        case "2":
          return st.setView("2d");
        case "h":
          return st.setUiHidden(!st.uiHidden);
        case "g":
          if (st.view === "3d") st.setWalk(!st.walk);
          return;
        case "p":
          return st.setMode(st.mode === "preview" ? "edit" : "preview");
        case "r": {
          const sc = useScene.getState();
          const id = topLevelOf(sc.groups, sc.selectedId);
          const n =
            id && sc.groups.flatMap((g) => g.items).find((x) => x.id === id);
          if (!n || n.kind === "fixed") return;
          const p = propsOf(n, sc.overrides);
          if (!p.locked) sc.setProps(id, { rotation: turned(p.rotation) });
          return;
        }
        case "Backspace":
        case "Delete": {
          const sc = useScene.getState();
          const id = topLevelOf(sc.groups, sc.selectedId);
          const n =
            id && sc.groups.flatMap((g) => g.items).find((x) => x.id === id);
          if (n && n.kind !== "fixed") sc.removeNode(id);
          return;
        }
        case "?":
          return onHelp();
        case "Escape":
          if (st.walk) st.setWalk(false);
          else if (st.focusId) st.setFocus(null);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHelp]);
}
