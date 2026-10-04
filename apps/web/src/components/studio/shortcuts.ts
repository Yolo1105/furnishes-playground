import { useEffect } from "react";
import { useScene } from "./scene-store";
import { useStudio } from "./studio-store";

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
  { keys: ["3"], does: "3D view" },
  { keys: ["2"], does: "2D plan" },
  { keys: ["H"], does: "Hide or show the panels" },
  { keys: ["P"], does: "Preview, or back to Edit" },
  { keys: ["⌘", "Z"], does: "Undo" },
  { keys: ["⌘", "⇧", "Z"], does: "Redo" },
  { keys: ["?"], does: "This list" },
  { keys: ["Esc"], does: "Close a menu, stop drawing, leave focus" },
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
        case "3":
          return st.setView("3d");
        case "2":
          return st.setView("2d");
        case "h":
          return st.setUiHidden(!st.uiHidden);
        case "p":
          return st.setMode(st.mode === "preview" ? "edit" : "preview");
        case "?":
          return onHelp();
        case "Escape":
          if (st.focusId) st.setFocus(null);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHelp]);
}
