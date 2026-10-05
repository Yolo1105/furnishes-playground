"use client";

import Link from "next/link";
import { ACCOUNT_MODES, useAccountForm } from "./account-form";

/**
 * The home page's stage for anyone not signed in: the account form in
 * the page's own language (the mode switch with its indices, rows with
 * a label and a field, one outlined button), and beside it what an
 * account keeps. The studio stays a link away for a look without one.
 */
const KEEPS = [
  ["Projects", "Every room you make, on every device you sign in on."],
  ["Orders", "What you ordered from the studio and where each order stands."],
  [
    "Shared rooms",
    "A room shared by link, listed, and taken down when you like.",
  ],
] as const;

export function HomeSignIn({ studio }: { studio: string }) {
  const f = useAccountForm();
  const up = f.mode === "up";
  return (
    <div className="home-canvas">
      <header className="home-head">
        <p className="home-eye">Account</p>
        <h1 className="home-title">
          {up ? "Make an account." : "Welcome back."}
        </h1>
        <p className="home-sub">
          Sign in to keep your projects, orders and room items with you on every
          device, and to share a room by link. Without an account they stay in
          this browser.
        </p>
      </header>
      <div className="home-signin">
        <form className="home-form" onSubmit={f.submit}>
          <div className="home-modes" role="tablist" aria-label="Account">
            {ACCOUNT_MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                className="home-mode"
                aria-selected={f.mode === m.id}
                onClick={() => f.setMode(m.id)}
              >
                <span>{m.label}</span>
                <span className="home-ix">[0{i + 1}]</span>
              </button>
            ))}
          </div>
          <div className="home-rows">
            {up && (
              <label className="home-row">
                <span className="home-row-l">Name</span>
                <input
                  className="home-input"
                  type="text"
                  autoComplete="name"
                  required
                  value={f.name}
                  onChange={(e) => f.setName(e.target.value)}
                />
              </label>
            )}
            <label className="home-row">
              <span className="home-row-l">Email</span>
              <input
                className="home-input"
                type="email"
                autoComplete="email"
                required
                value={f.email}
                onChange={(e) => f.setEmail(e.target.value)}
              />
            </label>
            <label className="home-row">
              <span className="home-row-l">Password</span>
              <input
                className="home-input"
                type="password"
                autoComplete={up ? "new-password" : "current-password"}
                required
                minLength={8}
                value={f.password}
                onChange={(e) => f.setPassword(e.target.value)}
              />
            </label>
          </div>
          {f.error && (
            <p className="home-error" role="alert">
              {f.error}
            </p>
          )}
          <div className="home-acts">
            <button
              type="submit"
              className="home-btn home-btn-primary"
              disabled={f.busy}
            >
              {f.busy ? "One moment" : up ? "Create account" : "Sign in"}
              <span aria-hidden="true"> →</span>
            </button>
            <Link className="home-quiet" href={studio}>
              Look around without an account →
            </Link>
          </div>
        </form>
        <aside className="home-keeps" aria-label="What an account keeps">
          {KEEPS.map(([name, text]) => (
            <div key={name} className="home-door home-door-still">
              <span className="home-door-name">{name}</span>
              <span className="home-door-prev">{text}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
