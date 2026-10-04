import { useEffect } from "react";
import { ANGLES, useStudio, type Angle, type View } from "./studio-store";

const KEY = "furnishes.view";

/**
 * Coming into the studio: the view and angle last used come back from the
 * browser, then the panels and the stage arrive with their transitions
 * (the root gains data-arrived a frame after mount; the CSS does the
 * rest). Later changes of view and angle are kept for next time.
 */
export function useArrival() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { view?: View; angle?: Angle };
        const view = saved.view === "2d" ? "2d" : "3d";
        const angle =
          saved.angle && ANGLES[view].includes(saved.angle)
            ? saved.angle
            : ANGLES[view][0]!;
        useStudio.setState({ view, angle });
      }
    } catch {
      /* nothing remembered, or storage blocked: the defaults stand */
    }
    const id = requestAnimationFrame(() => {
      document.documentElement.dataset.arrived = "true";
    });
    const unsub = useStudio.subscribe((s, prev) => {
      if (s.view === prev.view && s.angle === prev.angle) return;
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ view: s.view, angle: s.angle }),
        );
      } catch {
        /* the choice lasts the session */
      }
    });
    return () => {
      cancelAnimationFrame(id);
      unsub();
    };
  }, []);
}
