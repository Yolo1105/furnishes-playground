"use client";

import { ACCOUNT_MODES, useAccountForm } from "./account-form";
import { PASSWORD_MIN } from "@/lib/account-rules";
import { Dialog } from "./Dialog";

/**
 * The studio's way in to an account, from the gear: Sign in and Create
 * account as tabs over one form; done, the dialog closes and the user
 * bar reads the name.
 */
export function AccountDialog({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  /** what was waiting on the account goes on from here */
  onSignedIn?: () => void;
}) {
  const f = useAccountForm(() => {
    onClose();
    onSignedIn?.();
  });
  return (
    <Dialog title="Account" onClose={onClose}>
      <div
        className="shell-tabs-inline help-tabs"
        role="tablist"
        aria-label="Account"
      >
        {ACCOUNT_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            className="shell-tabbtn help-tab"
            aria-selected={f.mode === m.id}
            onClick={() => f.setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <form className="account-form" onSubmit={f.submit} noValidate>
        {f.mode === "up" && (
          <label className="order-field">
            <span className="room-dim-label">Name</span>
            <input
              className="room-dim-input"
              type="text"
              autoComplete="name"
              value={f.name}
              onChange={(e) => f.setName(e.target.value)}
            />
          </label>
        )}
        <label className="order-field">
          <span className="room-dim-label">Email</span>
          <input
            className="room-dim-input"
            type="email"
            autoComplete="email"
            value={f.email}
            onChange={(e) => f.setEmail(e.target.value)}
          />
        </label>
        <label className="order-field">
          <span className="room-dim-label">
            Password
            {f.mode === "up" && (
              <small className="account-hint">
                {" "}
                · {PASSWORD_MIN} characters or more
              </small>
            )}
          </span>
          <input
            className="room-dim-input"
            type="password"
            autoComplete={f.mode === "up" ? "new-password" : "current-password"}
            value={f.password}
            onChange={(e) => f.setPassword(e.target.value)}
          />
        </label>
        {f.error && (
          <p className="account-error" role="alert">
            {f.error}
          </p>
        )}
        <div className="shell-dialog-acts">
          <button
            type="submit"
            className="main-btn main-btn-primary"
            disabled={f.busy}
          >
            {f.busy
              ? "One moment"
              : f.mode === "up"
                ? "Create account"
                : "Sign in"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
