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
const TAB_KEY = "furnishes.view.tab";

/**
 * Coming into the studio: the view and angle last used in this tab come
 * back (a new visit opens on the room in 3D), and the wheel's meaning,
 * the magnet and the view settings come back from the last visit; then
 * the panels and the stage arrive with their transitions (the root gains
 * data-arrived a frame after mount; the CSS does the rest). Later
 * changes are kept the same two ways.
 */
export function useArrival() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const tab = sessionStorage.getItem(TAB_KEY);
      if (raw || tab) {
        const saved = JSON.parse(raw ?? "{}") as {
          wheelMode?: WheelMode;
          magnet?: boolean;
          scene?: Partial<SceneLook>;
        };
        const kept = JSON.parse(tab ?? "{}") as {
          view?: View;
          angle?: Angle;
        };
        const view = kept.view === "2d" ? "2d" : "3d";
        const angle =
          kept.angle && ANGLES[view].includes(kept.angle)
            ? kept.angle
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
        useStudio.setState({
          view,
          angle,
          wheelMode,
          magnet: saved.magnet !== false,
          scene,
        });
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
        s.magnet === prev.magnet &&
        s.scene === prev.scene
      )
        return;
      try {
        sessionStorage.setItem(
          TAB_KEY,
          JSON.stringify({ view: s.view, angle: s.angle }),
        );
        localStorage.setItem(
          KEY,
          JSON.stringify({
            wheelMode: s.wheelMode,
            magnet: s.magnet,
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
