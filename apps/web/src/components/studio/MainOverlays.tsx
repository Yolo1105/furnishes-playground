"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccountDialog } from "./AccountDialog";
import { AddStrip } from "./AddStrip";
import { CheckoutDialog } from "./CheckoutDialog";
import { ShareDialog } from "./ShareDialog";
import { shareable, useProjects } from "./project-store";
import { useSession } from "@/lib/auth-client";
import { Floating } from "./Floating";
import { ProgressLine } from "./ProgressLine";
import { pieceTotals, sgd, type AssetNode } from "./assets-data";
import { useEva } from "./eva-store";
import { exportPlanSvg, exportRoomJson, exportScenePng } from "./export";
import { useGuide } from "./guide-store";
import {
  CartIcon,
  CheckIcon,
  ChevronUpDownIcon,
  CloseIcon,
  CursorIcon,
  ExportIcon,
  CompassIcon,
  EyeIcon,
  FitIcon,
  HelpIcon,
  InspectIcon,
  PlusIcon,
  RedoIcon,
  PlayIcon,
  RouteIcon,
  RulerIcon,
  SlidersIcon,
  StopIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ShareIcon,
} from "./icons";
import { orderedIds, useOrders } from "./order-store";
import { useRoom } from "./room-store";
import { topLevelOf, useScene, useTopLevel } from "./scene-store";
import {
  type ShelfTab,
  type Tool,
  useStudio,
  viewName,
  ZOOM,
} from "./studio-store";
import { useDismiss } from "./useDismiss";
import { useFixedMenu } from "./useFixedMenu";

/**
 * What floats over the main surface: a thin toolbar across the top and a
 * shelf of cards along the bottom. Both are glass.
 */

/**
 * The toolbar, read left to right: the mode (Edit or Preview), the tools
 * (Select, which also moves and turns a piece by its handles; Inspect,
 * which offers a clicked piece's details or a label for Eva; Add, which
 * opens the strip of parts and pieces), the eye that hides
 * every panel to look at the room, undo and redo, the Guide mark, and
 * Export as the one primary button. Every icon is the same quiet button;
 * only Export is filled. `leading` is the slot the collapsed left rail's
 * restore icon docks into. Preview starts the render run and rests the
 * tools.
 */

export function MainTopBar({ leading }: { leading?: ReactNode }) {
  const mode = useStudio((s) => s.mode);
  const tool = useStudio((s) => s.tool);
  const { setMode, setTool, setUiHidden } = useStudio.getState();
  const startTour = useGuide((s) => s.startTour);
  const [adding, setAdding] = useState(false);
  // sharing: a link to a copy of the room, for anyone; needs an account
  const { data: session } = useSession();
  const [sharing, setSharing] = useState<"sign-in" | "busy" | string | null>(
    null,
  );
  const shareRoom = async (signedIn = Boolean(session)) => {
    if (!signedIn) return setSharing("sign-in");
    setSharing("busy");
    const name = useProjects
      .getState()
      .projects.find((p) => p.id === useProjects.getState().activeId)?.name;
    const r = await fetch("/api/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name ?? "A room", data: shareable() }),
    });
    if (!r.ok) return setSharing(null);
    const { id } = (await r.json()) as { id: string };
    setSharing(`${location.origin}/s/${id}`);
  };
  const addWrap = useRef<HTMLDivElement>(null);
  useDismiss(addWrap, adding, () => setAdding(false));
  const exploration = useEva((s) => s.exploration);
  const setExploration = useEva((s) => s.setExploration);
  // the toolbar clips what overflows it, so its menus are placed on screen
  // from their buttons, like the project panel's filter
  const prefs = useFixedMenu();
  const exporting = useFixedMenu();
  const { wrap: prefsWrap, menu: prefsMenu } = prefs;
  const { wrap: exportWrap, menu: exportMenu } = exporting;
  const view = useStudio((s) => s.view);
  const touring = useStudio((s) => s.touring);
  const tourAt = useStudio((s) => s.tourAt);
  const tourStop = useStudio((s) => s.tourStop);
  const tourOf = useStudio((s) => s.tourOf);
  const stops = useRoom((s) => s.stops);
  const { startTour: playTour, stopTour } = useStudio.getState();
  const { clearStops } = useRoom.getState();
  const scene = useStudio((s) => s.scene);
  const { setScene } = useStudio.getState();
  const looking = useFixedMenu();
  const { wrap: lookWrap, menu: lookMenu } = looking;
  const planZoom = useStudio((s) => s.planZoom);
  const planPan = useStudio((s) => s.planPan);
  const planFitted = planZoom === 1 && planPan.x === 0 && planPan.y === 0;
  const { zoomPlan, fitPlan } = useStudio.getState();
  const canUndo = useScene((s) => s.past.length > 0);
  const canRedo = useScene((s) => s.future.length > 0);
  const { undo, redo } = useScene.getState();
  const { setEvaTab } = useStudio.getState();
  const resting = mode === "preview";
  const pick = (go: () => unknown) => {
    exporting.close();
    go();
  };
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

        <div className="main-top-mid">
          <div
            className="main-top-group"
            role="group"
            aria-label="Tools"
            data-resting={resting}
          >
            <ToolButton
              id="select"
              label="Select"
              icon={<CursorIcon />}
              tool={tool}
              resting={resting}
              onPick={setTool}
            />
            <ToolButton
              id="inspect"
              label="Inspect"
              icon={<InspectIcon />}
              tool={tool}
              resting={resting}
              onPick={setTool}
            />
            <ToolButton
              id="measure"
              label="Measure"
              icon={<RulerIcon />}
              tool={tool}
              resting={resting}
              onPick={setTool}
            />
            <ToolButton
              id="tour"
              label="Tour"
              icon={<RouteIcon />}
              tool={tool}
              resting={resting}
              onPick={setTool}
            />
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
          </div>
          {view === "3d" && (
            <>
              <span className="main-sep" aria-hidden="true" />
              <div ref={lookWrap} className="main-prefs">
                <button
                  type="button"
                  className="main-icon shell-tip"
                  data-tooltip="View settings"
                  aria-label="View settings"
                  aria-haspopup="menu"
                  aria-expanded={looking.open}
                  disabled={resting}
                  onClick={(e) => looking.toggle(e.currentTarget)}
                >
                  <SlidersIcon />
                </button>
                {looking.open && (
                  <Floating>
                    <div
                      ref={lookMenu}
                      className="shell-menu main-prefs-menu"
                      role="menu"
                      aria-label="View settings"
                      style={looking.style}
                    >
                      <p className="main-prefs-title">View settings</p>
                      {(
                        [
                          ["edges", "Edges on every piece"],
                          ["labels", "Names under the pieces"],
                          ["grid", "Floor grid, 500 mm"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={scene[key]}
                          className="shell-menu-row"
                          onClick={() => setScene({ [key]: !scene[key] })}
                        >
                          <span
                            className="main-prefs-check"
                            aria-hidden="true"
                          />
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={scene.shadows !== "off"}
                        className="shell-menu-row"
                        onClick={() =>
                          setScene({
                            shadows: scene.shadows === "off" ? "on" : "off",
                          })
                        }
                      >
                        <span className="main-prefs-check" aria-hidden="true" />
                        Shadows
                        <span className="main-prefs-sub">
                          {scene.shadows === "auto" ? "auto" : scene.shadows}
                        </span>
                      </button>
                      <div className="shell-menu-sep" role="separator" />
                      {(
                        [
                          ["day", "Daylight"],
                          ["evening", "Evening"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={scene.light === id}
                          className="shell-menu-row"
                          onClick={() => setScene({ light: id })}
                        >
                          <span
                            className="main-prefs-check"
                            aria-hidden="true"
                          />
                          {label}
                        </button>
                      ))}
                    </div>
                  </Floating>
                )}
              </div>
            </>
          )}
          {view === "2d" && (
            <>
              <span className="main-sep" aria-hidden="true" />
              <div
                className="main-top-group"
                role="group"
                aria-label="Plan zoom"
                data-resting={resting}
              >
                <button
                  type="button"
                  className="main-icon shell-tip"
                  data-tooltip="Zoom out"
                  aria-label="Zoom out"
                  disabled={resting}
                  onClick={() => zoomPlan(1 / ZOOM.step)}
                >
                  <ZoomOutIcon />
                </button>
                <button
                  type="button"
                  className="main-zoom shell-tip f-num"
                  data-tooltip="Fit the plan"
                  aria-label={`Zoom ${Math.round(planZoom * 100)} percent; fit the plan`}
                  disabled={resting}
                  onClick={fitPlan}
                >
                  {Math.round(planZoom * 100)}%
                </button>
                <button
                  type="button"
                  className="main-icon shell-tip"
                  data-tooltip="Zoom in"
                  aria-label="Zoom in"
                  disabled={resting}
                  onClick={() => zoomPlan(ZOOM.step)}
                >
                  <ZoomInIcon />
                </button>
                <button
                  type="button"
                  className="main-icon shell-tip"
                  data-tooltip="Fit"
                  aria-label="Fit the plan"
                  disabled={resting || planFitted}
                  onClick={fitPlan}
                >
                  <FitIcon />
                </button>
              </div>
            </>
          )}
          <span className="main-sep" aria-hidden="true" />
          <button
            type="button"
            className="main-icon main-eye shell-tip"
            data-tooltip="Hide panels"
            aria-label="Hide panels"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setUiHidden(true, { top: r.top, left: r.left });
            }}
          >
            <EyeIcon size={16} />
          </button>
        </div>

        <div className="main-top-side main-top-right">
          <div className="main-top-group" role="group" aria-label="History">
            <button
              type="button"
              className="main-icon shell-tip"
              data-tooltip="Undo"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
            >
              <UndoIcon />
            </button>
            <button
              type="button"
              className="main-icon shell-tip"
              data-tooltip="Redo"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
            >
              <RedoIcon />
            </button>
          </div>
          <span className="main-sep" aria-hidden="true" />
          <div ref={prefsWrap} className="main-prefs">
            <button
              type="button"
              className="main-icon shell-tip"
              data-tooltip="Eva's preferences"
              aria-label="Eva's preferences"
              aria-haspopup="menu"
              aria-expanded={prefs.open}
              onClick={(e) => prefs.toggle(e.currentTarget)}
            >
              <CompassIcon />
            </button>
            {prefs.open && (
              <Floating>
                <div
                  ref={prefsMenu}
                  className="shell-menu main-prefs-menu"
                  role="menu"
                  aria-label="Eva's preferences"
                  style={prefs.style}
                >
                  <p className="main-prefs-title">Eva&apos;s preferences</p>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={exploration}
                    className="shell-menu-row"
                    onClick={() => setExploration(!exploration)}
                  >
                    <span className="main-prefs-check" aria-hidden="true" />
                    Exploration
                    <span className="main-prefs-sub">
                      {exploration ? "on" : "off"}
                    </span>
                  </button>
                  <div className="shell-menu-sep" role="separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="shell-menu-row"
                    onClick={() => {
                      setEvaTab("preference");
                      prefs.close();
                    }}
                  >
                    Set preferences by hand
                  </button>
                </div>
              </Floating>
            )}
          </div>
          <button
            type="button"
            className="main-icon main-guide shell-tip"
            data-tooltip="Guide"
            aria-label="Guide"
            onClick={startTour}
          >
            <HelpIcon />
          </button>
          <div ref={exportWrap} className="main-prefs">
            <button
              type="button"
              className="main-btn main-btn-primary"
              aria-label="Export"
              aria-haspopup="menu"
              aria-expanded={exporting.open}
              onClick={(e) => exporting.toggle(e.currentTarget)}
            >
              <ExportIcon size={14} />
              <span>Export</span>
            </button>
            {exporting.open && (
              <Floating>
                <div
                  ref={exportMenu}
                  className="shell-menu main-prefs-menu"
                  role="menu"
                  aria-label="Export"
                  style={exporting.style}
                >
                  <p className="main-prefs-title">Export</p>
                  <button
                    type="button"
                    role="menuitem"
                    className="shell-menu-row main-menu-row"
                    onClick={() =>
                      pick(view === "2d" ? exportPlanSvg : exportScenePng)
                    }
                  >
                    <ExportIcon size={14} />
                    <span className="main-menu-row-text">
                      {viewName(view)} as {view === "2d" ? "SVG" : "PNG"}
                      <span className="main-menu-row-sub">
                        {view === "2d"
                          ? "The drawing, to scale in millimetres"
                          : "The view as it stands on the stage"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="shell-menu-row main-menu-row"
                    onClick={() => pick(exportRoomJson)}
                  >
                    <ExportIcon size={14} />
                    <span className="main-menu-row-text">
                      Room and pieces as JSON
                      <span className="main-menu-row-sub">
                        Sizes, finishes, every piece and its settings
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="shell-menu-row main-menu-row"
                    onClick={() => pick(() => shareRoom())}
                  >
                    <ShareIcon size={14} />
                    <span className="main-menu-row-text">
                      Share a link
                      <span className="main-menu-row-sub">
                        {session
                          ? "A read-only room for anyone with the link"
                          : "Sign in first; the link is kept with your account"}
                      </span>
                    </span>
                  </button>
                </div>
              </Floating>
            )}
            {sharing === "sign-in" && (
              <AccountDialog
                onClose={() => setSharing(null)}
                onSignedIn={() => void shareRoom(true)}
              />
            )}
            {sharing && sharing !== "sign-in" && sharing !== "busy" && (
              <ShareDialog url={sharing} onClose={() => setSharing(null)} />
            )}
          </div>
        </div>
        <ProgressLine />
      </div>
      {adding && (
        <div ref={addWrap} className="main-add-strip">
          <AddStrip onAdded={() => setAdding(false)} />
        </div>
      )}
      {tool === "tour" && !touring && (
        <div className="main-add-strip">
          <div
            className="glass shell-menu tour-strip"
            role="group"
            aria-label="Tour"
          >
            <span className="tour-strip-count f-num">
              {stops.length === 0
                ? "No stops yet: a round of the room"
                : `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`}
            </span>
            <span className="tour-strip-hint">
              Click the plan to set a stop; click a stop to take it away.
            </span>
            <button
              type="button"
              className="main-btn"
              disabled={stops.length === 0}
              onClick={clearStops}
            >
              <span>Clear</span>
            </button>
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={playTour}
            >
              <PlayIcon size={14} />
              <span>Play</span>
            </button>
          </div>
        </div>
      )}
      {touring && (
        <div className="main-add-strip">
          <div className="glass shell-menu tour-run" role="status">
            <span className="tour-strip-count f-num">
              Tour · stop {Math.min(Math.max(tourStop, 1), Math.max(tourOf, 1))}{" "}
              of {Math.max(tourOf, 1)}
            </span>
            <span
              className="agent-bar tour-bar"
              role="progressbar"
              aria-label="Tour"
              aria-valuenow={Math.round(tourAt * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${Math.round(tourAt * 100)}%` }} />
            </span>
            <button
              type="button"
              className="main-btn"
              aria-label="Stop the tour"
              onClick={stopTour}
            >
              <StopIcon size={14} />
              <span>Stop</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ToolButton({
  id,
  label,
  icon,
  tool,
  resting,
  onPick,
}: {
  id: Tool;
  label: string;
  icon: ReactNode;
  tool: Tool;
  resting: boolean;
  onPick: (t: Tool) => void;
}) {
  return (
    <button
      type="button"
      className="main-icon shell-tip"
      data-tooltip={label}
      aria-label={label}
      aria-pressed={tool === id}
      disabled={resting}
      onClick={() => onPick(id)}
    >
      {icon}
    </button>
  );
}

/**
 * The shelf: two tabs along its top, the same tabs as the panels have.
 * Saved is the Furnishes pieces in the room, what can be bought, as cards
 * that scroll sideways, each with its price and, on hover, a cart button.
 * Cart holds the pieces put there, each with a remove on hover. Each tab carries its count; the
 * sum of the open tab reads at the right, before the chevron that folds
 * the cards away. Picking a card picks the same thing in the outliner,
 * and the other way round.
 */
export function MainShelf() {
  const items = useTopLevel();
  const groups = useScene((s) => s.groups);
  const cart = useScene((s) => s.cart);
  const selectedId = useScene((s) => s.selectedId);
  const selectedAt = useScene((s) => s.selectedAt);
  const { select, toggleCart } = useScene.getState();
  const tab = useStudio((s) => s.shelfTab);
  const { setShelfTab: setTab } = useStudio.getState();
  const [collapsed, setCollapsed] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const ordered = orderedIds(useOrders((s) => s.orders));
  const scroller = useRef<HTMLDivElement>(null);
  const selected = topLevelOf(groups, selectedId);
  const pieces = items.filter((n) => n.kind === "piece");
  const t = pieceTotals(pieces);
  const inCart = pieces.filter((n) => cart.includes(n.id));
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
    const el = scroller.current;
    const card = selected
      ? el?.querySelector<HTMLElement>(`[data-id="${CSS.escape(selected)}"]`)
      : null;
    if (!el || !card) return;
    // after the next layout, so an unfolding shelf has its width back
    const id = requestAnimationFrame(() => {
      const left = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
      el.scrollTo({ left: Math.max(0, left) });
    });
    return () => cancelAnimationFrame(id);
  }, [selected, selectedAt, tab, collapsed]);

  const shown = tab === "saved" ? pieces : inCart;
  return (
    <div
      className="glass main-shelf"
      aria-label="Pieces"
      data-collapsed={collapsed}
    >
      <div className="main-shelf-head">
        <div className="shell-tabs-inline" role="tablist" aria-label="Shelf">
          {(
            [
              ["saved", "Saved", t.pieces],
              ["cart", "Cart", c.pieces],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="shell-tabbtn main-shelf-tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
              <span className="main-shelf-n f-num">{n}</span>
            </button>
          ))}
        </div>
        <div className="main-shelf-acts">
          <span className="main-shelf-sum f-num">
            {tab === "saved"
              ? `${sgd(t.total)} · ${t.pieces} pieces`
              : `${sgd(c.total)} · ${c.pieces} ${c.pieces === 1 ? "piece" : "pieces"}`}
          </span>
          {tab === "cart" && inCart.length > 0 && (
            <button
              type="button"
              className="main-btn main-btn-primary"
              aria-haspopup="dialog"
              onClick={() => setCheckout(true)}
            >
              <CartIcon size={14} />
              <span>Checkout</span>
            </button>
          )}
          <button
            type="button"
            className="main-icon shell-tip main-shelf-toggle"
            data-tooltip={collapsed ? "Show pieces" : "Hide pieces"}
            aria-label={collapsed ? "Show pieces" : "Hide pieces"}
            aria-expanded={!collapsed}
            // a mouse press must not leave the button focused (and ringed);
            // keyboard users still reach it with Tab
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCollapsed((v) => !v)}
          >
            <ChevronUpDownIcon size={16} up={collapsed} />
          </button>
        </div>
      </div>
      <div className="main-shelf-body">
        <div ref={scroller} className="main-shelf-scroll no-scrollbar">
          {tab === "cart" && inCart.length === 0 && (
            <p className="assets-empty main-shelf-empty">
              Nothing in the cart yet. Press the cart on a saved piece.
            </p>
          )}
          {checkout && (
            <CheckoutDialog
              pieces={inCart}
              total={c.total}
              onClose={() => setCheckout(false)}
            />
          )}
          {shown.map((n) => (
            <ShelfCard
              key={n.id}
              node={n}
              tab={tab}
              selected={selected === n.id}
              inCart={cart.includes(n.id)}
              ordered={ordered.has(n.id)}
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
  ordered,
  onSelect,
  onCart,
}: {
  node: AssetNode;
  tab: ShelfTab;
  selected: boolean;
  inCart: boolean;
  /** in an order that stands: nothing more to put in the cart */
  ordered: boolean;
  onSelect: () => void;
  onCart: () => void;
}) {
  const piece = n.kind === "piece";
  const cartLabel = ordered
    ? `${n.name} is ordered`
    : tab === "cart"
      ? `Remove ${n.name} from the cart`
      : inCart
        ? `${n.name} is in the cart; remove it`
        : `Add ${n.name} to the cart`;
  return (
    <article
      className="shelf-card"
      data-kind={n.kind}
      data-id={n.id}
      data-tab={tab}
      data-selected={selected}
      data-in-cart={inCart}
      data-ordered={ordered}
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
          disabled={ordered}
          onClick={onCart}
        >
          {ordered ? (
            <CheckIcon size={14} />
          ) : tab === "cart" ? (
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
