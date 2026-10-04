"use client";

import Link from "next/link";
import { WHEEL_MODES } from "./input";
import { useStudio } from "./studio-store";
import { useSyncState } from "./account-sync";
import { authClient, useSession } from "@/lib/auth-client";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { AccountDialog } from "./AccountDialog";
import { Dialog } from "./Dialog";
import { HelpDialog } from "./HelpDialog";
import { useGuide } from "./guide-store";
import { CartIcon, CompassIcon, GearIcon, HelpIcon, UserIcon } from "./icons";
import { OrdersDialog } from "./OrdersDialog";
import { useDismiss } from "./useDismiss";

/**
 * The foot of the project rail: who is in the studio (the account's
 * name and email, or a guest), and one gear that opens settings (the
 * panels' corners, the wheel), the orders, Help (mouse, touch and
 * keyboard), the guide again, and signing in or out.
 */
type Sheet = "settings" | "help" | "orders" | "account" | null;

export function UserBar() {
  const { data: session } = useSession();
  const path = usePathname();
  const note = useSyncState((s) => s.note);
  const name = session?.user.name ?? "Guest";
  const line = note ?? session?.user.email ?? "Not signed in";
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
            onClick={() => pick(() => setSheet("help"))}
          >
            <HelpIcon /> Help
          </button>
          <button
            type="button"
            role="menuitem"
            className="shell-menu-row"
            onClick={() => pick(startTour)}
          >
            <CompassIcon /> Guide
          </button>
          <span className="shell-menu-sep" aria-hidden="true" />
          {session ? (
            <>
              <Link
                role="menuitem"
                className="shell-menu-row"
                href={
                  path === "/rounded" ? "/account?from=rounded" : "/account"
                }
                onClick={() => setOpen(false)}
              >
                <UserIcon /> Account
              </Link>
              <button
                type="button"
                role="menuitem"
                className="shell-menu-row"
                onClick={() => pick(() => void authClient.signOut())}
              >
                <UserIcon /> Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="shell-menu-row"
              onClick={() => pick(() => setSheet("account"))}
            >
              <UserIcon /> Sign in
            </button>
          )}
        </div>
      )}
      {sheet === "settings" && (
        <SettingsDialog onClose={() => setSheet(null)} />
      )}
      {sheet === "help" && <HelpDialog onClose={() => setSheet(null)} />}
      {sheet === "account" && <AccountDialog onClose={() => setSheet(null)} />}
      {sheet === "orders" && <OrdersDialog onClose={() => setSheet(null)} />}
    </div>
  );
}

/** the studio's settings: how the panels are cut, what the wheel does */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  const path = usePathname();
  const rounded = path === "/rounded";
  const wheelMode = useStudio((s) => s.wheelMode);
  const magnet = useStudio((s) => s.magnet);
  const { setWheelMode, setMagnet } = useStudio.getState();
  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="shell-settings-row">
        <span className="shell-settings-label">
          Magnet to the walls
          <small>
            A piece moved near a wall goes flush to it, inside or out
          </small>
        </span>
        <span
          className="shell-choice"
          role="radiogroup"
          aria-label="Magnet to the walls"
        >
          {(
            [
              [true, "On"],
              [false, "Off"],
            ] as const
          ).map(([on, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={magnet === on}
              onClick={() => setMagnet(on)}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <div className="shell-settings-row">
        <span className="shell-settings-label">
          Scroll wheel on the plan
          <small>{WHEEL_MODES.find((m) => m.id === wheelMode)?.hint}</small>
        </span>
        <span
          className="shell-choice"
          role="radiogroup"
          aria-label="Scroll wheel on the plan"
        >
          {WHEEL_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={wheelMode === m.id}
              onClick={() => setWheelMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </span>
      </div>
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
