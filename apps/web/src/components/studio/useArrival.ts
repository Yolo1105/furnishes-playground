import { useEffect } from "react";
import { WHEEL_MODES, type WheelMode } from "./input";
import {
  ANGLES,
  SCENE_DEFAULT,
  useStudio,
  type Angle,
  type SceneLook,
  type View,
} from "./studio-store";

const KEY = "furnishes.view";

/**
 * Coming into the studio: the view and angle last used come back from the
 * browser, then the panels and the stage arrive with their transitions
 * (the root gains data-arrived a frame after mount; the CSS does the
 * rest). Later changes of view, angle and the wheel's meaning are kept
 * for next time.
 */
export function useArrival() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          view?: View;
          angle?: Angle;
          wheelMode?: WheelMode;
          scene?: Partial<SceneLook>;
        };
        const view = saved.view === "2d" ? "2d" : "3d";
        const angle =
          saved.angle && ANGLES[view].includes(saved.angle)
            ? saved.angle
            : ANGLES[view][0]!;
        const wheelMode = WHEEL_MODES.some((m) => m.id === saved.wheelMode)
          ? saved.wheelMode!
          : "auto";
        const scene: SceneLook = {
          ...SCENE_DEFAULT,
          ...Object.fromEntries(
            Object.entries(saved.scene ?? {}).filter(
              ([k, v]) =>
                k in SCENE_DEFAULT &&
                typeof v === typeof SCENE_DEFAULT[k as keyof SceneLook],
            ),
          ),
        };
        useStudio.setState({ view, angle, wheelMode, scene });
      }
    } catch {
      /* nothing remembered, or storage blocked: the defaults stand */
    }
    const id = requestAnimationFrame(() => {
      document.documentElement.dataset.arrived = "true";
    });
    const unsub = useStudio.subscribe((s, prev) => {
      if (
        s.view === prev.view &&
        s.angle === prev.angle &&
        s.wheelMode === prev.wheelMode &&
        s.scene === prev.scene
      )
        return;
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({
            view: s.view,
            angle: s.angle,
            wheelMode: s.wheelMode,
            scene: s.scene,
          }),
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
