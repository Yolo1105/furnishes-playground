"use client";

import { useRef, useState, type ReactNode } from "react";
import type React from "react";
import { ChatInput } from "./ChatInput";
import { useEva } from "./eva-store";
import { HistoryTab } from "./HistoryTab";
import { PreferenceTab } from "./PreferenceTab";
import { GuideCard } from "./GuideCard";
import { MainTopBar } from "./MainOverlays";
import { PeekBar } from "./PeekBar";
import { PreviewStage } from "./PreviewStage";
import { Tour } from "./Tour";
import { ViewCube } from "./ViewCube";
import { other, useStudio } from "./studio-store";
import { useGenerationsSync } from "./generation-store";
import { useOrdersSync } from "./order-store";
import { useProjectSync } from "./project-store";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { useShortcuts } from "./shortcuts";
import { useArrival } from "./useArrival";
import { useInputMode } from "./useInputMode";
import { ShortcutsDialog, UserBar } from "./UserBar";
import { MainView, ViewPanel } from "./ViewPanel";
import { PanelLeftIcon, PlusIcon } from "./icons";

export type ShellCorners = "square" | "rounded";

type Drawer = "left" | "right" | null;

/** the view panel can be dragged down to this: its head alone */
const VIEW_MIN = 44;

/**
 * The studio's three panes on one fixed viewport: a left rail (the project),
 * the main surface, a right rail (Eva). The room itself is the stage
 * behind all three, full screen, so a view or a render is seen as it is;
 * the eye in the toolbar hides every panel to look at it. Layout and
 * breakpoints live in styles/shell.css; this component owns whether the
 * left rail is collapsed on wide screens, which drawer is open on narrow
 * ones, the project switcher and Eva's tabs.
 */
export function StudioShell({
  corners,
  left,
  right,
  children,
}: {
  corners: ShellCorners;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  useInputMode();
  useArrival();
  useProjectSync();
  useOrdersSync();
  useGenerationsSync();
  const [keys, setKeys] = useState(false);
  useShortcuts(() => setKeys(true));
  const [open, setOpen] = useState<Drawer>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const tab = useStudio((s) => s.evaTab);
  const setTab = useStudio((s) => s.setEvaTab);
  // the view panel's height, dragged; null is the default third, which
  // is also the most it can be
  const [viewH, setViewH] = useState<number | null>(null);
  const rail = useRef<HTMLElement>(null);
  const viewPanel = useRef<HTMLElement>(null);
  const resizeFrom = useRef<{ y: number; h: number; max: number } | null>(null);
  const viewMax = () => {
    const r = rail.current;
    if (!r) return 0;
    const gap = parseFloat(getComputedStyle(r).gap) || 0;
    return (r.clientHeight - gap) / 3;
  };
  const clampView = (h: number, max: number) =>
    Math.round(Math.min(max, Math.max(VIEW_MIN, h)));
  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = viewPanel.current?.offsetHeight ?? 0;
    resizeFrom.current = { y: e.clientY, h, max: viewMax() };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const f = resizeFrom.current;
    if (!f) return;
    setViewH(clampView(f.h + (e.clientY - f.y), f.max));
  };
  const onResizeUp = () => {
    resizeFrom.current = null;
  };
  const onResizeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowUp" ? -24 : e.key === "ArrowDown" ? 24 : 0;
    if (!step) return;
    e.preventDefault();
    const h = viewPanel.current?.offsetHeight ?? 0;
    setViewH(clampView(h + step, viewMax()));
  };
  const view = useStudio((s) => s.view);
  const uiHidden = useStudio((s) => s.uiHidden);
  const focusId = useStudio((s) => s.focusId);
  const setView = useStudio((s) => s.setView);
  // a product dragged from the + strip or the Products tab lands on the
  // stage: the drag itself is in dnd.ts; here the stage only lights
  const dropping = useStudio((s) => s.carrying !== null);

  const toggleDrawer = (d: Exclude<Drawer, null>) =>
    setOpen((cur) => (cur === d ? null : d));

  const restoreLeft = leftCollapsed ? (
    <button
      type="button"
      className="main-icon shell-tip"
      data-tooltip="Show project panel"
      aria-label="Show project panel"
      onClick={() => setLeftCollapsed(false)}
    >
      <PanelLeftIcon />
    </button>
  ) : null;

  return (
    <div
      className="shell"
      data-corners={corners}
      data-left={leftCollapsed ? "collapsed" : "open"}
      data-ui={uiHidden ? "hidden" : "shown"}
      {...(open ? { "data-open": open } : {})}
    >
      {/* ---- the stage: the room, behind everything ---- */}
      <div
        className="shell-stage"
        aria-label="Room"
        data-focus={focusId !== null}
        data-dropping={dropping}
      >
        <MainView view={view} />
        <PreviewStage />
      </div>
      <PeekBar />
      <Tour />
      {keys && <ShortcutsDialog onClose={() => setKeys(false)} />}

      {/* ---- left: the project ---- */}
      <aside className="shell-rail shell-rail-left" aria-label="Project">
        <div className="glass shell-panel shell-panel-inner">
          <div className="shell-panel-head">
            <ProjectSwitcher />
            <div className="shell-head-acts">
              <button
                type="button"
                className="shell-iconbtn shell-collapse"
                aria-label="Collapse project panel"
                title="Collapse"
                onClick={() => setLeftCollapsed(true)}
              >
                <PanelLeftIcon />
              </button>
              <button
                type="button"
                className="shell-iconbtn shell-close"
                aria-label="Close project panel"
                onClick={() => setOpen(null)}
              >
                ×
              </button>
            </div>
          </div>
          <div className="shell-panel-body">{left}</div>
          <div className="shell-panel-foot">
            <UserBar />
          </div>
        </div>
      </aside>

      {/* ---- main ---- */}
      <main className="shell-main" aria-label="Studio">
        <MainTopBar leading={restoreLeft} />
        {dropping && (
          <div className="shell-drop" aria-hidden="true">
            <span>Drop to place</span>
          </div>
        )}
        {children}
        <ViewCube />
        <GuideCard />
      </main>

      {/* ---- right: Eva ---- */}
      <aside
        ref={rail}
        className="shell-rail shell-rail-right"
        aria-label="Eva and views"
        style={
          viewH !== null ? { ["--view-h" as string]: `${viewH}px` } : undefined
        }
      >
        <section
          ref={viewPanel}
          className="glass shell-panel shell-panel-view"
          aria-label="Other view"
        >
          <ViewPanel main={view} onSwap={() => setView(other(view))} />
        </section>
        {/* drag down to give the view less and Eva more; up to the third */}
        <div
          className="shell-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the view panel"
          aria-valuenow={viewH ?? undefined}
          tabIndex={0}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onKeyDown={onResizeKey}
        />
        <section
          className="glass shell-panel shell-panel-inner shell-panel-eva"
          aria-label="EVA Chatbot"
        >
          <div className="shell-panel-head">
            <span className="shell-panel-title">EVA Chatbot</span>
            <div className="shell-head-acts">
              <button
                type="button"
                className="shell-iconbtn shell-close"
                aria-label="Close Eva panel"
                onClick={() => setOpen(null)}
              >
                ×
              </button>
            </div>
          </div>
          <div className="shell-subbar">
            <div className="shell-tabs-inline" role="tablist" aria-label="Eva">
              {(
                [
                  ["agent", "Agent"],
                  ["history", "History"],
                  ["preference", "Preference"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className="shell-tabbtn"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="shell-iconbtn shell-tip shell-primary"
              data-tooltip="New chat"
              aria-label="New chat"
              onClick={() => {
                useEva.getState().newConversation();
                setTab("agent");
              }}
            >
              <PlusIcon />
            </button>
          </div>
          <div className="shell-panel-body" data-tab={tab}>
            {tab === "agent" && right}
            {tab === "history" && <HistoryTab onOpen={() => setTab("agent")} />}
            {tab === "preference" && <PreferenceTab />}
          </div>
          {/* only the conversation takes input; History and Preference do not */}
          {tab === "agent" && (
            <div className="shell-panel-foot shell-panel-foot-chat">
              <ChatInput />
            </div>
          )}
        </section>
      </aside>

      {/* narrow screens: the panels are drawers, this opens them */}
      <div className="shell-scrim" onClick={() => setOpen(null)} />
      <nav className="glass shell-tabs" aria-label="Panels">
        <button
          type="button"
          className="shell-tab shell-tab-left"
          aria-pressed={open === "left"}
          onClick={() => toggleDrawer("left")}
        >
          Project
        </button>
        <button
          type="button"
          className="shell-tab"
          aria-pressed={open === "right"}
          onClick={() => toggleDrawer("right")}
        >
          Eva
        </button>
      </nav>
    </div>
  );
}
