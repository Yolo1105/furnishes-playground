"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AddStrip } from "./AddStrip";
import { pieceTotals, sgd, type AssetNode } from "./assets-data";
import { useGuide } from "./guide-store";
import {
  CartIcon,
  CheckIcon,
  ChevronUpDownIcon,
  CloseIcon,
  CursorIcon,
  ExportIcon,
  EyeIcon,
  HelpIcon,
  PlusIcon,
  RedoIcon,
  UndoIcon,
  WallIcon,
} from "./icons";
import { topLevelOf, useScene, useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";
import { useDismiss } from "./useDismiss";

/**
 * What floats over the main surface: a thin toolbar across the top and a
 * shelf of cards along the bottom. Both are glass.
 */

/**
 * The toolbar, read left to right: the mode (Edit or Preview), the three
 * tools (Select, which also moves and turns a piece by its handles; Add,
 * which opens the strip of parts and pieces; Wall), the eye that hides
 * every panel to look at the room, undo and redo, the Guide mark, and
 * Export as the one primary button. Every icon is the same quiet button;
 * only Export is filled. `leading` is the slot the collapsed left rail's
 * restore icon docks into. Preview starts the render run and rests the
 * tools.
 */
const TOOLS = [
  ["select", "Select", CursorIcon],
  ["wall", "Draw wall", WallIcon],
] as const;

export function MainTopBar({ leading }: { leading?: ReactNode }) {
  const mode = useStudio((s) => s.mode);
  const tool = useStudio((s) => s.tool);
  const { setMode, setTool, setUiHidden } = useStudio.getState();
  const showGuide = useGuide((s) => s.show);
  const [adding, setAdding] = useState(false);
  const addWrap = useRef<HTMLDivElement>(null);
  useDismiss(addWrap, adding, () => setAdding(false));
  const resting = mode === "preview";
  return (
    <>
      <div className="glass main-top" role="toolbar" aria-label="Studio tools">
        <div className="main-top-side main-top-left">
          {leading}
          <div className="main-seg" role="group" aria-label="Mode">
            {(
              [
                ["edit", "Edit"],
                ["preview", "Preview"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="main-seg-btn"
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="main-top-group"
          role="group"
          aria-label="Tools"
          data-resting={resting}
        >
          <button
            type="button"
            className="main-icon shell-tip"
            data-tooltip="Select"
            aria-label="Select"
            aria-pressed={tool === "select"}
            disabled={resting}
            onClick={() => setTool("select")}
          >
            <CursorIcon />
          </button>
          <div className="main-add">
            <button
              type="button"
              className="main-icon shell-tip"
              data-tooltip="Add"
              aria-label="Add"
              aria-haspopup="dialog"
              aria-expanded={adding}
              disabled={resting}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setAdding((v) => !v)}
            >
              <PlusIcon />
            </button>
          </div>
          {TOOLS.filter(([id]) => id !== "select").map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className="main-icon shell-tip"
              data-tooltip={label}
              aria-label={label}
              aria-pressed={tool === id}
              disabled={resting}
              onClick={() => setTool(id)}
            >
              <Icon />
            </button>
          ))}
          <span className="main-sep" aria-hidden="true" />
          <button
            type="button"
            className="main-icon shell-tip"
            data-tooltip="Hide panels"
            aria-label="Hide panels"
            onClick={() => setUiHidden(true)}
          >
            <EyeIcon />
          </button>
        </div>

        <div className="main-top-side main-top-right">
          <div className="main-top-group" role="group" aria-label="History">
            <button
              type="button"
              className="main-icon shell-tip"
              data-tooltip="Undo"
              aria-label="Undo"
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              className="main-icon shell-tip"
              data-tooltip="Redo"
              aria-label="Redo"
            >
              <RedoIcon />
            </button>
          </div>
          <span className="main-sep" aria-hidden="true" />
          <button
            type="button"
            className="main-icon shell-tip"
            data-tooltip="Guide"
            aria-label="Guide"
            onClick={() => showGuide("intro", true)}
          >
            <HelpIcon />
          </button>
          <button
            type="button"
            className="main-btn main-btn-primary"
            aria-label="Export"
          >
            <ExportIcon size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>
      {adding && (
        <div ref={addWrap} className="main-add-strip">
          <AddStrip onAdded={() => setAdding(false)} />
        </div>
      )}
    </>
  );
}

/**
 * The shelf: two tabs along its top. Saved is everything in the room as
 * cards that scroll sideways; a Furnishes piece carries the orange mark
 * and its price and, on hover, a cart button; a room item reads muted and
 * says so. Cart holds the pieces put there, each with a remove on hover.
 * Each tab counts and sums what it holds. The chevron at the right folds
 * the cards away, leaving only that row along the bottom. Picking a card
 * picks the same thing in the outliner, and the other way round.
 */
type ShelfTab = "saved" | "cart";

export function MainShelf() {
  const items = useTopLevel();
  const groups = useScene((s) => s.groups);
  const cart = useScene((s) => s.cart);
  const selectedId = useScene((s) => s.selectedId);
  const selectedAt = useScene((s) => s.selectedAt);
  const { select, toggleCart } = useScene.getState();
  const [tab, setTab] = useState<ShelfTab>("saved");
  const [collapsed, setCollapsed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const selected = topLevelOf(groups, selectedId);
  const t = pieceTotals(items);
  const inCart = items.filter((n) => cart.includes(n.id));
  const c = pieceTotals(inCart);

  // a pick anywhere brings its card into view, unfolding the shelf first
  useEffect(
    () =>
      useScene.subscribe((s, prev) => {
        if (s.selectedAt !== prev.selectedAt && s.selectedId)
          setCollapsed(false);
      }),
    [],
  );
  useLayoutEffect(() => {
    if (!selected) return;
    scroller.current
      ?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected, selectedAt, tab, collapsed]);

  const shown = tab === "saved" ? items : inCart;
  return (
    <div
      className="glass main-shelf"
      aria-label="Pieces"
      data-collapsed={collapsed}
    >
      <div className="main-shelf-head">
        <div className="main-shelf-tabs" role="tablist" aria-label="Shelf">
          <button
            type="button"
            role="tab"
            className="main-shelf-tab"
            aria-selected={tab === "saved"}
            onClick={() => setTab("saved")}
          >
            <span className="assets-dot" aria-hidden="true" />
            <b>Saved</b>
            <span className="main-shelf-sum f-num">
              {t.pieces} · {sgd(t.total)}
            </span>
            <span className="main-shelf-more f-num">
              + {t.others} room items
            </span>
          </button>
          <button
            type="button"
            role="tab"
            className="main-shelf-tab"
            aria-selected={tab === "cart"}
            onClick={() => setTab("cart")}
          >
            <CartIcon size={14} />
            <b>Cart</b>
            <span className="main-shelf-sum f-num">
              {c.pieces} · {sgd(c.total)}
            </span>
          </button>
        </div>
        <div className="main-shelf-acts">
          {tab === "cart" && inCart.length > 0 && (
            <button type="button" className="main-btn main-btn-primary">
              <CartIcon size={14} />
              <span>Checkout</span>
            </button>
          )}
          <button
            type="button"
            className="shell-iconbtn shell-tip main-shelf-toggle"
            data-tooltip={collapsed ? "Show pieces" : "Hide pieces"}
            aria-label={collapsed ? "Show pieces" : "Hide pieces"}
            aria-expanded={!collapsed}
            // a mouse press must not leave the button focused (and ringed);
            // keyboard users still reach it with Tab
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCollapsed((v) => !v)}
          >
            <ChevronUpDownIcon up={collapsed} />
          </button>
        </div>
      </div>
      <div className="main-shelf-body">
        <div ref={scroller} className="main-shelf-scroll no-scrollbar">
          {tab === "cart" && inCart.length === 0 && (
            <p className="assets-empty main-shelf-empty">
              Nothing in the cart yet. Hover a saved piece and press its cart.
            </p>
          )}
          {shown.map((n) => (
            <ShelfCard
              key={n.id}
              node={n}
              tab={tab}
              selected={selected === n.id}
              inCart={cart.includes(n.id)}
              onSelect={() => select(n.id)}
              onCart={() => toggleCart(n.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ShelfCard({
  node: n,
  tab,
  selected,
  inCart,
  onSelect,
  onCart,
}: {
  node: AssetNode;
  tab: ShelfTab;
  selected: boolean;
  inCart: boolean;
  onSelect: () => void;
  onCart: () => void;
}) {
  const piece = n.kind === "piece";
  const cartLabel =
    tab === "cart"
      ? `Remove ${n.name} from the cart`
      : inCart
        ? `${n.name} is in the cart; remove it`
        : `Add ${n.name} to the cart`;
  return (
    <article
      className="shelf-card"
      data-kind={n.kind}
      data-id={n.id}
      data-selected={selected}
      data-in-cart={inCart}
    >
      <button
        type="button"
        className="shelf-card-pic"
        aria-label={n.name}
        aria-pressed={selected}
        onClick={onSelect}
      />
      {piece && (
        <button
          type="button"
          className="shelf-card-cart"
          aria-label={cartLabel}
          onClick={onCart}
        >
          {tab === "cart" ? (
            <CloseIcon size={14} />
          ) : inCart ? (
            <CheckIcon size={14} />
          ) : (
            <CartIcon size={14} />
          )}
        </button>
      )}
      <div className="shelf-card-row">
        <span className="shelf-card-name">
          {piece && <span className="assets-dot" aria-hidden="true" />}
          {n.name}
        </span>
        <span className="shelf-card-price f-num">
          {piece && n.price !== undefined ? sgd(n.price) : "Room"}
        </span>
      </div>
    </article>
  );
}
