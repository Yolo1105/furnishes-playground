import { useRef, useState, type CSSProperties } from "react";
import { useDismiss } from "./useDismiss";

/**
 * A menu for a button in the toolbar: the menu is placed on screen from
 * the button's box, clear of the bar's own stacking,
 * hanging from its bottom edge and ending at its right. `toggle` opens
 * it from the button, `style` places it; it closes on Escape or a press
 * outside the button and the menu.
 */
export function useFixedMenu() {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => setAt(null);
  useDismiss(wrap, at !== null, close, menu);
  const toggle = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAt((cur) => (cur ? null : { top: r.bottom + 8, left: r.right }));
  };
  const style: CSSProperties | undefined = at
    ? {
        position: "fixed",
        top: at.top,
        left: at.left,
        transform: "translateX(-100%)",
      }
    : undefined;
  return { open: at !== null, wrap, menu, toggle, close, style };
}
