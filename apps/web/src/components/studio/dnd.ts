import type { PointerEvent as ReactPointerEvent } from "react";
import type { Product } from "./catalogue";
import { DRAG_FROM, LONG_PRESS } from "./input";
import { defaultProps, footprint } from "./piece-detail";
import { settle } from "./room-layout";
import { footprintOf, useRoom } from "./room-store";
import { useScene } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * Dragging a product onto the room, on pointer events, so a mouse, a
 * pen and a finger all carry it (the browser's own drag-and-drop never
 * fires for a finger). A tile in the + strip or a card in the Products
 * tab starts it: a mouse or a pen at once, a finger after a long press
 * (a short swipe scrolls the strip). A ghost of the name follows the
 * pointer; the stage lights while something is carried; letting go over
 * the stage adds the piece, and over the plan's sheet stands it where
 * the pointer was. A press that never travels is the tile's own click.
 */
type Carry = {
  product: Product;
  id: number;
  /** the tile or card pressed; it captures the pointer once the drag is on */
  el: Element;
  x0: number;
  y0: number;
  moved: boolean;
  ghost: HTMLDivElement | null;
  timer: number | null;
};
let carry: Carry | null = null;
/** true just after a drag ended, so the click that follows is not a pick */
let justDropped = false;

const ghostFor = (p: Product) => {
  const g = document.createElement("div");
  g.className = "drag-ghost";
  g.textContent = p.name;
  document.body.appendChild(g);
  return g;
};
const moveGhost = (g: HTMLDivElement, x: number, y: number) => {
  g.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
};

const begin = (c: Carry, x: number, y: number) => {
  c.moved = true;
  c.ghost = ghostFor(c.product);
  moveGhost(c.ghost, x, y);
  useStudio.getState().setCarrying(c.product);
};

/** where the pointer let go: the stage, the plan's sheet, or neither */
const landing = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y);
  const sheet = el?.closest<HTMLElement>(".plan-pieces") ?? null;
  const stage = el?.closest(".shell-stage") ?? null;
  return { sheet, stage };
};

export const startTileDrag = (e: ReactPointerEvent, p: Product) => {
  if (e.button !== 0 || carry) return;
  // a control inside a card (its own Add) is not a handle
  const inner = (e.target as HTMLElement).closest("button");
  if (inner && inner !== e.currentTarget) return;
  const c: Carry = {
    product: p,
    id: e.pointerId,
    el: e.currentTarget,
    x0: e.clientX,
    y0: e.clientY,
    moved: false,
    ghost: null,
    timer: null,
  };
  carry = c;
  // the tile keeps the pointer, so the moves reach it wherever it goes
  try {
    c.el.setPointerCapture(c.id);
  } catch {
    /* a pointer the browser no longer knows */
  }
  if (e.pointerType === "touch")
    c.timer = window.setTimeout(() => {
      c.timer = null;
      if (carry === c) begin(c, c.x0, c.y0);
    }, LONG_PRESS);
};

export const moveTileDrag = (e: ReactPointerEvent) => {
  const c = carry;
  if (!c || c.id !== e.pointerId) return;
  if (!c.moved) {
    if (Math.hypot(e.clientX - c.x0, e.clientY - c.y0) < DRAG_FROM) return;
    // a finger that moves before the hold is scrolling the strip
    if (e.pointerType === "touch") {
      if (c.timer !== null) window.clearTimeout(c.timer);
      carry = null;
      try {
        c.el.releasePointerCapture(c.id);
      } catch {
        /* already released */
      }
      return;
    }
    begin(c, e.clientX, e.clientY);
  }
  if (c.ghost) moveGhost(c.ghost, e.clientX, e.clientY);
};

export const endTileDrag = (e: ReactPointerEvent) => {
  const c = carry;
  if (!c || c.id !== e.pointerId) return;
  carry = null;
  if (c.timer !== null) window.clearTimeout(c.timer);
  if (!c.moved) return;
  c.ghost?.remove();
  useStudio.getState().setCarrying(null);
  justDropped = true;
  window.setTimeout(() => {
    justDropped = false;
  }, 0);
  const { sheet, stage } = landing(e.clientX, e.clientY);
  if (!stage) return;
  const { addProduct, select, setProps } = useScene.getState();
  const id = addProduct(c.product);
  if (sheet) {
    // stood where the pointer let go, its middle under the pointer
    const r = sheet.getBoundingClientRect();
    const room = useRoom.getState();
    const f = footprint(defaultProps({ ...c.product, kind: "piece" }));
    const x = ((e.clientX - r.left) / r.width) * room.width - f.w / 2;
    const y = ((e.clientY - r.top) / r.height) * room.depth - f.d / 2;
    setProps(
      id,
      settle(
        { x, y },
        f,
        { outline: footprintOf(room) },
        useStudio.getState().magnet,
      ),
    );
  }
  select(id, false);
};

/** the click that ends a drag is the drop, not a pick */
export const droppedJustNow = () => justDropped;
