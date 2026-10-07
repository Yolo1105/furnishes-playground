"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { LANDING } from "./copy";

/**
 * The one line about the one cookie: shown once you have left the hero,
 * until it is read; Understood is remembered in the browser's own
 * storage. There are no toggles, because there is nothing to toggle:
 * the session cookie is the only one, and it is set when you sign in.
 */
const COOKIE_NOTE_KEY = "furnishes.cookies";

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const isRead = () => {
  try {
    return localStorage.getItem(COOKIE_NOTE_KEY) === "1";
  } catch {
    return false;
  }
};

export function CookieNote({ past }: { past: boolean }) {
  // the server, and the first paint, take it as read; the browser says
  const read = useSyncExternalStore(subscribe, isRead, () => true);
  if (read) return null;
  const ok = () => {
    try {
      localStorage.setItem(COOKIE_NOTE_KEY, "1");
    } catch {
      // storage refused: the note stays, and says the same next time
    }
    listeners.forEach((l) => l());
  };
  return (
    <div
      className={`ld-cookie${past ? " is-in" : ""}`}
      role="status"
      aria-hidden={!past}
      inert={!past}
    >
      <p>
        {LANDING.cookie.text}{" "}
        <Link href="/privacy#cookies" className="ld-cookie-link">
          Privacy
        </Link>
      </p>
      <button type="button" className="ld-btn ld-btn-small" onClick={ok}>
        {LANDING.cookie.ok}
      </button>
    </div>
  );
}
