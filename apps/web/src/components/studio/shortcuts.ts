import { useEffect } from "react";
import { normTurn, turnAbout } from "./piece-detail";
import { propsOf, standingOf, topLevelOf, useScene } from "./scene-store";
import { useStudio, ZOOM } from "./studio-store";

/**
 * The keyboard: one key per tool and view, the eye, and undo and redo
 * with the modifier. The list is what Help's Keyboard tab shows, and
 * what `useShortcuts` listens for. Keys do nothing while
 * typing in a field.
 */
export const SHORTCUTS = [
  { keys: ["V"], does: "Select tool" },
  { keys: ["I"], does: "Inspect tool" },
  { keys: ["W"], does: "Wall tool" },
  { keys: ["M"], does: "Measure tool, on the plan" },
  { keys: ["T"], does: "Tour tool: stops on the plan, then Play" },
  { keys: ["3"], does: "3D view" },
  { keys: ["2"], does: "2D plan" },
  { keys: ["H"], does: "Hide or show the panels" },
  { keys: ["G"], does: "Walk the room in 3D (W A S D to move, drag to look)" },
  { keys: ["P"], does: "Render, or back to Edit" },
  { keys: ["+"], does: "Zoom the plan in" },
  { keys: ["-"], does: "Zoom the plan out" },
  { keys: ["0"], does: "Fit the plan" },
  { keys: ["R"], does: "Turn the picked piece a quarter, clockwise" },
  { keys: ["⇧", "R"], does: "Turn it a quarter the other way" },
  { keys: ["[", "]"], does: "Turn it 15° either way (with ⇧, 1°)" },
  { keys: ["←", "→", "↑", "↓"], does: "Move it 50 mm (with ⇧, 10 mm)" },
  { keys: ["⌫"], does: "Remove the picked piece from the room" },
  { keys: ["⌘ / Ctrl", "Z"], does: "Undo" },
  { keys: ["⌘ / Ctrl", "⇧", "Z"], does: "Redo" },
  { keys: ["?"], does: "Help, on this list" },
  {
    keys: ["Esc"],
    does: "Close a menu, stop a tour, drawing or measuring, leave focus",
  },
] as const;

/** a nudge on the arrows, mm; with Shift, the fine one */
const NUDGE = 50;
const NUDGE_FINE = 10;
/** a turn on the brackets, degrees; with Shift, the fine one */
const TURN_STEP = 15;
const TURN_FINE = 1;
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** the picked piece, where it stands and as it is, when it may move */
const picked = () => {
  const sc = useScene.getState();
  const id = topLevelOf(sc.groups, sc.selectedId);
  const n = id && sc.groups.flatMap((g) => g.items).find((x) => x.id === id);
  if (!id || !n || n.kind === "fixed") return null;
  const p = propsOf(n, sc.overrides);
  const at = standingOf(id) ?? { x: p.x ?? 0, y: p.y ?? 0 };
  return p.locked ? null : { id, p, at, sc };
};
/** the picked piece turned by `by` degrees about its middle */
const turnBy = (by: number) => {
  const k = picked();
  if (k) k.sc.setProps(k.id, turnAbout(k.at, k.p, normTurn(k.p.rotation + by)));
};

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
      // on a walk W steers (with A, S, D and the arrows, which are the
      // walker's own), so it is not the wall tool's key there
      if (st.walk && e.key === "w") return;
      switch (e.key) {
        case "v":
          return st.setTool("select");
        case "i":
          return st.setTool("inspect");
        case "w":
          return st.setTool("wall");
        case "m":
          return st.setTool("measure");
        case "t":
          return st.setTool("tour");
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
        case "r":
          return turnBy(90);
        case "R":
          return turnBy(-90);
        case "]":
        case "}":
          return turnBy(e.shiftKey ? TURN_FINE : TURN_STEP);
        case "[":
        case "{":
          return turnBy(-(e.shiftKey ? TURN_FINE : TURN_STEP));
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          // on a walk the arrows are the walker's
          if (st.walk) return;
          const k = picked();
          if (!k) return;
          e.preventDefault();
          const [dx, dy] = ARROWS[e.key]!;
          const step = e.shiftKey ? NUDGE_FINE : NUDGE;
          k.sc.setProps(k.id, { x: k.at.x + dx * step, y: k.at.y + dy * step });
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
          if (useScene.getState().panelId)
            useScene.getState().selectPanel(null);
          else if (st.touring) st.stopTour();
          else if (st.walk) st.setWalk(false);
          else if (st.focusId) st.setFocus(null);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHelp]);
}
