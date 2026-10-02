"use client";

import { useState, type ReactNode } from "react";

export type ShellCorners = "square" | "rounded";

type Drawer = "left" | "right" | null;

/**
 * The studio's three panes on one fixed viewport: a left rail, the main
 * surface, a right inspector. Layout and breakpoints live in
 * styles/shell.css; this component only owns which drawer is open on
 * narrow screens.
 */
export function StudioShell({
  corners,
  left,
  right,
  children,
  leftTitle = "Tools",
  rightTitle = "Properties",
}: {
  corners: ShellCorners;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  leftTitle?: string;
  rightTitle?: string;
}) {
  const [open, setOpen] = useState<Drawer>(null);
  const toggle = (d: Exclude<Drawer, null>) =>
    setOpen((cur) => (cur === d ? null : d));

  return (
    <div
      className="shell"
      data-corners={corners}
      {...(open ? { "data-open": open } : {})}
    >
      <aside className="shell-panel shell-panel-left" aria-label={leftTitle}>
        <div className="shell-panel-head">
          <span className="shell-panel-title">{leftTitle}</span>
          <button
            type="button"
            className="shell-close"
            aria-label={`Close ${leftTitle}`}
            onClick={() => setOpen(null)}
          >
            ×
          </button>
        </div>
        <div className="shell-panel-body">{left}</div>
      </aside>

      <main className="shell-main" aria-label="Studio">
        {children}
      </main>

      <aside className="shell-panel shell-panel-right" aria-label={rightTitle}>
        <div className="shell-panel-head">
          <span className="shell-panel-title">{rightTitle}</span>
          <button
            type="button"
            className="shell-close"
            aria-label={`Close ${rightTitle}`}
            onClick={() => setOpen(null)}
          >
            ×
          </button>
        </div>
        <div className="shell-panel-body">{right}</div>
      </aside>

      {/* narrow screens: the panels are drawers, this opens them */}
      <div className="shell-scrim" onClick={() => setOpen(null)} />
      <nav className="shell-tabs" aria-label="Panels">
        <button
          type="button"
          className="shell-tab shell-tab-left"
          aria-pressed={open === "left"}
          onClick={() => toggle("left")}
        >
          {leftTitle}
        </button>
        <button
          type="button"
          className="shell-tab"
          aria-pressed={open === "right"}
          onClick={() => toggle("right")}
        >
          {rightTitle}
        </button>
      </nav>
    </div>
  );
}

/** Ghost rows standing in for the controls each panel will hold. */
export function GhostRows({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="shell-row" aria-hidden="true" />
      ))}
    </>
  );
}
