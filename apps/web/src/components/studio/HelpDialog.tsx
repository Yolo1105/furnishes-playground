"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { HELP_TABS, type HelpTab } from "./help-data";
import { KeyboardIcon, MouseIcon, TouchIcon } from "./icons";
import { useCoarse } from "./input";
import { SHORTCUTS } from "./shortcuts";

/**
 * Help: what the hand and the keyboard do, in three tabs. It opens on
 * the tab for what is driving the studio (Touch under a finger, Mouse &
 * trackpad otherwise) unless asked for one, as the ? key asks for the
 * keyboard.
 */
type HelpTabId = HelpTab["id"] | "keyboard";
const ICONS = {
  mouse: MouseIcon,
  touch: TouchIcon,
  keyboard: KeyboardIcon,
} as const;

export function HelpDialog({
  onClose,
  tab,
}: {
  onClose: () => void;
  tab?: HelpTabId;
}) {
  const coarse = useCoarse();
  const [picked, setPicked] = useState<HelpTabId | null>(tab ?? null);
  const current: HelpTabId = picked ?? (coarse ? "touch" : "mouse");
  const tabs: { id: HelpTabId; label: string }[] = [
    ...HELP_TABS.map((t) => ({ id: t.id, label: t.label })),
    { id: "keyboard", label: "Keyboard" },
  ];
  const pointer = HELP_TABS.find((t) => t.id === current);
  return (
    <Dialog title="Help" onClose={onClose} wide>
      <div
        className="shell-tabs-inline help-tabs"
        role="tablist"
        aria-label="Help"
      >
        {tabs.map((t) => {
          const Icon = ICONS[t.id];
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="shell-tabbtn help-tab"
              aria-selected={t.id === current}
              onClick={() => setPicked(t.id)}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
      {pointer ? (
        <div role="tabpanel" aria-label={pointer.label}>
          {pointer.groups.map((g) => (
            <section key={g.where} className="help-group">
              <h3 className="help-where">{g.where}</h3>
              <ul className="shell-dialog-list help-list">
                {g.rows.map((r) => (
                  <li key={r.does}>
                    <span className="help-does">{r.does}</span>
                    <span className="help-how">{r.how}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Keyboard">
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
        </div>
      )}
    </Dialog>
  );
}
