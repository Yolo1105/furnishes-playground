import { useEffect, type RefObject } from "react";

/**
 * Close a popover on Escape, or on a pointer press outside `ref` (and
 * outside `also`, for a popover placed away from its button).
 * Listens only while `open` is true.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  also?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const inside = [ref, also].some((r) => r?.current?.contains(t));
      if (!inside) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [ref, also, open, onClose]);
}
