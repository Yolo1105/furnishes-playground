import { useSyncExternalStore } from "react";

/**
 * What is driving the studio. The same pointer events carry a mouse, a
 * trackpad, a finger and a pen; what differs is read here: whether the
 * pointer is coarse (a finger, so targets grow and hover means nothing),
 * and what a wheel event means. A mouse notch is a zoom; a trackpad's
 * two-finger scroll is a pan and its pinch a zoom; Firefox counts lines
 * where the others count pixels. A guess decides between mouse and
 * trackpad, and the Settings choice settles it.
 */
export type WheelMode = "auto" | "zoom" | "scroll";
export const WHEEL_MODES: { id: WheelMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "a mouse zooms, a trackpad scrolls" },
  { id: "zoom", label: "Zoom", hint: "the wheel always zooms" },
  { id: "scroll", label: "Scroll", hint: "the wheel always moves the sheet" },
];

/** a wheel event's deltas in pixels, whatever unit the browser counts in */
const pixels = (e: WheelEvent) => {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
};

/** what a wheel event asks for: a pinch (always a zoom), a zoom or a scroll */
export const readWheel = (
  e: WheelEvent,
  mode: WheelMode,
):
  | { kind: "zoom"; factor: number }
  | { kind: "scroll"; dx: number; dy: number } => {
  const { dx, dy } = pixels(e);
  // a trackpad pinch arrives as a wheel with Control held, in Chrome, Edge
  // and Firefox alike; it is finer than a notch
  if (e.ctrlKey) return { kind: "zoom", factor: Math.exp(-dy * 0.01) };
  const trackpad =
    mode === "scroll" ||
    (mode === "auto" &&
      e.deltaMode === 0 &&
      (dx !== 0 || (Math.abs(dy) < 50 && !Number.isInteger(dy / 10))));
  if (trackpad) return { kind: "scroll", dx: -dx, dy: -dy };
  return { kind: "zoom", factor: Math.exp(-dy * 0.0025) };
};

/* a coarse pointer (a finger): read after hydration, so the server and
   the client render the same */
const query = () =>
  typeof window === "undefined" ? null : window.matchMedia("(pointer: coarse)");
const subscribe = (cb: () => void) => {
  const q = query();
  q?.addEventListener("change", cb);
  return () => q?.removeEventListener("change", cb);
};
export const useCoarse = () =>
  useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? false,
    () => false,
  );

/** how long a finger holds before it counts as a long press, ms */
export const LONG_PRESS = 450;
/** a press that travels less than this is a click, not a drag, px */
export const DRAG_FROM = 3;

/** Safari's own pinch events on a trackpad; the others send a wheel */
export type GestureEvent = Event & {
  scale: number;
  clientX: number;
  clientY: number;
};

/** two pointers on one surface: the pinch between them and their middle */
export const pinchOf = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => ({
  span: Math.hypot(b.x - a.x, b.y - a.y),
  mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
});
