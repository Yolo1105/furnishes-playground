"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { useGuide } from "./guide-store";
import { CartIcon, GearIcon, HelpIcon, KeyboardIcon } from "./icons";
import { OrdersDialog } from "./OrdersDialog";
import { SHORTCUTS } from "./shortcuts";
import { useDismiss } from "./useDismiss";

/**
 * The foot of the project rail: who is in the studio, and one gear that
 * opens settings (the panels' corners), the keyboard shortcuts, and help
 * (the tour again). The name is a placeholder until accounts land, so
 * there is nothing to sign out of yet.
 */
type Sheet = "settings" | "keys" | "orders" | null;

export function UserBar({
  name = "Studio User",
  line = "Free plan",
}: {
  name?: string;
  line?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const startTour = useGuide((s) => s.startTour);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useDismiss(wrap, open, () => setOpen(false));
  const pick = (go: () => void) => {
    setOpen(false);
    go();
  };

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
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(() => setSheet("settings"))}
          >
            <GearIcon /> Settings
          </button>
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(() => setSheet("orders"))}
          >
            <CartIcon /> Orders
          </button>
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(() => setSheet("keys"))}
          >
            <KeyboardIcon /> Keyboard shortcuts
          </button>
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(startTour)}
          >
            <HelpIcon /> Help
          </button>
        </div>
      )}
      {sheet === "settings" && (
        <SettingsDialog onClose={() => setSheet(null)} />
      )}
      {sheet === "keys" && <ShortcutsDialog onClose={() => setSheet(null)} />}
      {sheet === "orders" && <OrdersDialog onClose={() => setSheet(null)} />}
    </div>
  );
}

/** the one setting the studio has: how the panels are cut */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  const path = usePathname();
  const rounded = path === "/rounded";
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="shell-settings-row">
        <span className="shell-settings-label">
          Panel corners
          <small>How the panels and menus are cut</small>
        </span>
        <span className="shell-choice" role="group" aria-label="Panel corners">
          <Link href="/" aria-current={rounded ? undefined : "page"}>
            Square
          </Link>
          <Link href="/rounded" aria-current={rounded ? "page" : undefined}>
            Rounded
          </Link>
        </span>
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
      <ul className="shell-dialog-list">
        {SHORTCUTS.map((s) => (
          <li key={s.does}>
            <span>{s.does}</span>
            <span>
              {s.keys.map((k) => (
                <kbd key={k} className="shell-key">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
