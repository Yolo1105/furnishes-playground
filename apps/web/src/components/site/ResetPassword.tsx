"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { HomeRail } from "./HomeRail";
import { PASSWORD_MIN } from "@/lib/account-rules";
import { authClient } from "@/lib/auth-client";

/**
 * A new password, from the link in the mail: the page the link opens
 * (/reset?token=…), in the home page's language. A link that has
 * lapsed says so and offers another.
 */
export function ResetPassword() {
  const params = useSearchParams();
  const token = params.get("token");
  const lapsed = params.get("error") !== null;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !token) return;
    if (password.length < PASSWORD_MIN) {
      setError(`A password needs ${PASSWORD_MIN} characters or more.`);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (r.error) setError(r.error.message ?? "That did not work; try again.");
    else setDone(true);
  };
  return (
    <div className="home">
      <HomeRail current="account" studio="/rounded" />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Account</p>
            <h1 className="home-title">
              {done
                ? "Password changed."
                : lapsed || !token
                  ? "That link has lapsed."
                  : "A new password."}
            </h1>
            <p className="home-sub">
              {done
                ? "Sign in with it, and everything is where you left it."
                : lapsed || !token
                  ? "A link to set a new password is good for an hour. Ask for another from the sign-in page."
                  : `${PASSWORD_MIN} characters or more. The other devices signed in stay signed in.`}
            </p>
          </header>
          {!done && token && !lapsed ? (
            <form className="home-form" onSubmit={submit} noValidate>
              <div className="home-rows">
                <label className="home-row">
                  <span className="home-row-l">New password</span>
                  <input
                    className="home-input"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </div>
              {error && (
                <p className="home-error" role="alert">
                  {error}
                </p>
              )}
              <div className="home-acts">
                <button
                  type="submit"
                  className="home-btn home-btn-primary"
                  disabled={busy}
                >
                  {busy ? "One moment" : "Set the password"}
                  <span aria-hidden="true"> →</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="home-acts">
              <Link className="home-btn home-btn-primary" href="/account">
                {done ? "Sign in" : "Back to sign in"}
                <span aria-hidden="true"> →</span>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
