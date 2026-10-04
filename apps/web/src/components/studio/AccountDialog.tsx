"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "./Dialog";
import { authClient } from "@/lib/auth-client";

/**
 * Signing in, or making an account: a name (for a new one), an email
 * and a password of eight or more. What goes wrong is said under the
 * form in the library's words; what goes right closes the dialog, and
 * the user bar reads the name.
 */
type Mode = "in" | "up";
const MODES: { id: Mode; label: string }[] = [
  { id: "in", label: "Sign in" },
  { id: "up", label: "Create account" },
];

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r =
      mode === "up"
        ? await authClient.signUp.email({ name: name.trim(), email, password })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (r.error) {
      setError(r.error.message ?? "That did not work; try again.");
      return;
    }
    onClose();
  };

  return (
    <Dialog title="Account" onClose={onClose}>
      <div
        className="shell-tabs-inline help-tabs"
        role="tablist"
        aria-label="Account"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            className="shell-tabbtn help-tab"
            aria-selected={mode === m.id}
            onClick={() => {
              setMode(m.id);
              setError(null);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <form className="account-form" onSubmit={submit}>
        {mode === "up" && (
          <label className="order-field">
            <span className="room-dim-label">Name</span>
            <input
              className="room-dim-input"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className="order-field">
          <span className="room-dim-label">Email</span>
          <input
            className="room-dim-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="order-field">
          <span className="room-dim-label">Password</span>
          <input
            className="room-dim-input"
            type="password"
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        <div className="shell-dialog-acts">
          <button
            type="submit"
            className="main-btn main-btn-primary"
            disabled={busy}
          >
            {busy ? "One moment" : mode === "up" ? "Create account" : "Sign in"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
