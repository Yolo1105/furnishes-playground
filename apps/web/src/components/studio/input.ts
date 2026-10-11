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
  {
    id: "auto",
    label: "Auto",
    hint: "a mouse wheel zooms; two fingers on a trackpad move the view",
  },
  { id: "zoom", label: "Zoom", hint: "the wheel and two fingers always zoom" },
  {
    id: "scroll",
    label: "Move",
    hint: "the wheel and two fingers always move the view",
  },
];

/** a wheel event's deltas in pixels, whatever unit the browser counts in */
const pixels = (e: WheelEvent) => {
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  return { dx: e.deltaX * k, dy: e.deltaY * k };
};

/** a run of wheel events with no gap longer than this is one gesture,
    ms: a trackpad's flick and the momentum after it arrive as one */
const GESTURE_GAP = 220;

/** what the first event of a gesture says the device is. A mouse: the
    browser counts lines or pages (Firefox), or a notch's pixels are
    a round 100 or more (Chrome, Edge, Safari on Windows), or a third of
    a hundred (Windows' "lines to scroll" at 1 or 2: 33⅓, 66⅔). A
    trackpad: any sideways part, or a small step */
export const looksLikeMouse = (e: WheelEvent) => {
  if (e.deltaMode !== 0) return true;
  if (e.deltaX !== 0) return false;
  const dy = Math.abs(e.deltaY);
  if (dy >= 100) return true;
  const thirds = dy * 3;
  return dy >= 30 && Math.abs(thirds - Math.round(thirds)) < 0.02;
};

/** the gesture under way, so every event of it is read alike: a flick's
    momentum that grows past a notch's size stays a trackpad's */
const gesture = { last: -Infinity, mouse: false };

/** the mouse's zoom per pixel of a notch, and the most a notch moves */
const NOTCH_ZOOM = 0.0018;
const NOTCH_MOST = 1.35;
/** a pinch's zoom per pixel: a trackpad's pinch reports its spread */
const PINCH_ZOOM = 0.01;
const PINCH_MOST = 1.6;

const clampZoom = (f: number, most: number) =>
  Math.min(most, Math.max(1 / most, f));

/** what a wheel event asks for: a pinch (always a zoom), a zoom or a
    scroll, the scroll in screen pixels (a sideways wheel, or Shift held
    with a mouse, scrolls across) */
export const readWheel = (
  e: WheelEvent,
  mode: WheelMode,
):
  | { kind: "zoom"; factor: number }
  | { kind: "scroll"; dx: number; dy: number } => {
  const { dx, dy } = pixels(e);
  const now = e.timeStamp || performance.now();
  if (now - gesture.last > GESTURE_GAP) gesture.mouse = looksLikeMouse(e);
  gesture.last = now;
  // a trackpad pinch arrives as a wheel with Control held, in Chrome,
  // Edge and Firefox alike (and Control with a mouse's wheel zooms too):
  // it follows the fingers, a notch no further than a step
  if (e.ctrlKey || e.metaKey)
    return {
      kind: "zoom",
      factor: clampZoom(Math.exp(-dy * PINCH_ZOOM), PINCH_MOST),
    };
  // a sideways wheel, or Shift with a mouse: across, never a zoom
  if (dx !== 0 && dy === 0) return { kind: "scroll", dx: -dx, dy: 0 };
  if (e.shiftKey && gesture.mouse) return { kind: "scroll", dx: -dy, dy: 0 };
  const scroll = mode === "scroll" || (mode === "auto" && !gesture.mouse);
  if (scroll) return { kind: "scroll", dx: -dx, dy: -dy };
  return {
    kind: "zoom",
    factor: clampZoom(Math.exp(-dy * NOTCH_ZOOM), NOTCH_MOST),
  };
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

/** the page itself never zooms from inside the studio: a pinch on a
    trackpad (a wheel with Control held, Safari's gesture events) or
    Control with the wheel is the view's or nobody's, wherever it lands
    (a panel, the view cube, the walk, a drag under way). Listeners on
    the document, as the views' own handle the zoom first */
export const guardPageZoom = (root: HTMLElement) => {
  const inside = (e: Event) =>
    e.target instanceof Node && root.contains(e.target);
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey && inside(e)) e.preventDefault();
  };
  const onGesture = (e: Event) => {
    if (inside(e)) e.preventDefault();
  };
  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("gesturestart", onGesture);
  document.addEventListener("gesturechange", onGesture);
  return () => {
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("gesturestart", onGesture);
    document.removeEventListener("gesturechange", onGesture);
  };
};
