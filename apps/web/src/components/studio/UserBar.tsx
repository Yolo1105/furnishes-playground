"use client";

import { useEffect, useRef, useState } from "react";
import {
  GearIcon,
  HelpIcon,
  KeyboardIcon,
  MoreIcon,
  SignOutIcon,
} from "./icons";

/**
 * The foot of the project rail: who is signed in, and the handful of
 * things every studio keeps there — settings, shortcuts, help, sign out.
 * The name is a placeholder until auth lands.
 */
export function UserBar({
  name = "Studio User",
  line = "Free plan",
}: {
  name?: string;
  line?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="user-bar">
      <span className="user-avatar" aria-hidden="true">
        {initials}
      </span>
      <span className="user-text">
        <span className="user-name">{name}</span>
        <span className="user-line">{line}</span>
      </span>
      <button
        type="button"
        className="shell-iconbtn shell-tip"
        data-tooltip="Settings"
        aria-label="Settings"
      >
        <GearIcon />
      </button>
      <button
        type="button"
        className="shell-iconbtn"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="shell-menu user-menu" role="menu">
          <button type="button" role="menuitem" className="shell-menu-row">
            <KeyboardIcon /> Keyboard shortcuts
          </button>
          <button type="button" role="menuitem" className="shell-menu-row">
            <HelpIcon /> Help
          </button>
          <div className="shell-menu-sep" role="separator" />
          <button type="button" role="menuitem" className="shell-menu-row">
            <SignOutIcon /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
