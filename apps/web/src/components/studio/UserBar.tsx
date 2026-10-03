"use client";

import { useRef, useState } from "react";
import { GearIcon, HelpIcon, KeyboardIcon, SignOutIcon } from "./icons";
import { useDismiss } from "./useDismiss";

/**
 * The foot of the project rail: who is signed in, and one gear that opens
 * settings, shortcuts, help and sign out. The name is a placeholder until
 * auth lands.
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

  useDismiss(wrap, open, () => setOpen(false));

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
        className="shell-iconbtn"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <GearIcon />
      </button>
      {open && (
        <div className="shell-menu user-menu" role="menu">
          <button type="button" role="menuitem" className="shell-menu-row">
            <GearIcon /> Settings
          </button>
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
