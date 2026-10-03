"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { ChatInput } from "./ChatInput";
import { HistoryTab } from "./HistoryTab";
import { PreferenceTab } from "./PreferenceTab";
import { GuideCard } from "./GuideCard";
import { MainTopBar } from "./MainOverlays";
import { PeekBar } from "./PeekBar";
import { PreviewStage } from "./PreviewStage";
import { carriesProduct, readProductDrag } from "./dnd";
import { useScene } from "./scene-store";
import { other, useStudio } from "./studio-store";
import { RadioMenu } from "./RadioMenu";
import { useDismiss } from "./useDismiss";
import { UserBar } from "./UserBar";
import { MainView, ViewPanel } from "./ViewPanel";
import { ChevronDownIcon, PanelLeftIcon, PlusIcon } from "./icons";

export type ShellCorners = "square" | "rounded";

type Drawer = "left" | "right" | null;

/** Placeholder projects until the project store exists. */
const PROJECTS = ["Project 0", "Project 1", "Project 2"] as const;
type Project = (typeof PROJECTS)[number];

export type EvaTab = "agent" | "history" | "preference";

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
  topBar = false,
}: {
  corners: ShellCorners;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  /** draw the thin toolbar over the main surface (collapse icons dock in it) */
  topBar?: boolean;
}) {
  const [open, setOpen] = useState<Drawer>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [project, setProject] = useState<Project>(PROJECTS[0]);
  const [tab, setTab] = useState<EvaTab>("agent");
  const view = useStudio((s) => s.view);
  const uiHidden = useStudio((s) => s.uiHidden);
  const focusId = useStudio((s) => s.focusId);
  const setView = useStudio((s) => s.setView);
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);

  // a product dragged from the + strip or the Products tab lands here
  const onDragEnter = (e: DragEvent) => {
    if (!carriesProduct(e)) return;
    dragDepth.current += 1;
    setDropping(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!carriesProduct(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };
  const onDragOver = (e: DragEvent) => {
    if (!carriesProduct(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent) => {
    const p = readProductDrag(e);
    dragDepth.current = 0;
    setDropping(false);
    if (!p) return;
    e.preventDefault();
    const { addProduct, select } = useScene.getState();
    select(addProduct(p), false);
  };

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
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <MainView view={view} />
        <PreviewStage />
      </div>
      <PeekBar />

      {/* ---- left: the project ---- */}
      <aside className="shell-rail shell-rail-left" aria-label="Project">
        <div className="glass shell-panel shell-panel-inner">
          <div className="shell-panel-head">
            <ProjectSwitcher value={project} onChange={setProject} />
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
        {topBar ? (
          <MainTopBar leading={restoreLeft} />
        ) : (
          restoreLeft && (
            <div className="glass main-restore main-restore-left">
              {restoreLeft}
            </div>
          )
        )}
        {dropping && (
          <div className="shell-drop" aria-hidden="true">
            <span>Drop to place</span>
          </div>
        )}
        {children}
        <GuideCard />
      </main>

      {/* ---- right: Eva ---- */}
      <aside className="shell-rail shell-rail-right" aria-label="Eva and views">
        <section
          className="glass shell-panel shell-panel-view"
          aria-label="Other view"
        >
          <ViewPanel main={view} onSwap={() => setView(other(view))} />
        </section>
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

/** "Furnishes / Project 0" with a menu of the other projects. */
function ProjectSwitcher({
  value,
  onChange,
}: {
  value: Project;
  onChange: (v: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));
  return (
    <div ref={wrap} className="shell-project">
      <button
        type="button"
        className="shell-project-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="shell-project-brand">Furnishes</span>
        <span className="shell-project-sep" aria-hidden="true">
          /
        </span>
        <span className="shell-project-name">{value}</span>
        <span className="shell-project-caret">
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <RadioMenu
          options={PROJECTS}
          value={value}
          onChange={(p) => {
            onChange(p);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
