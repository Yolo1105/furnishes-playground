import { useEffect } from "react";

/**
 * Records on the root how the last input came: "keyboard" after Tab or
 * an arrow key, "mouse" after any pointer press. The focus ring shows
 * only in keyboard mode, so closing a menu with Escape does not leave a
 * ring on every button clicked afterwards.
 */
export function useInputMode() {
  useEffect(() => {
    const root = document.documentElement;
    const onPointer = () => {
      root.dataset.input = "mouse";
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow"))
        root.dataset.input = "keyboard";
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
}
