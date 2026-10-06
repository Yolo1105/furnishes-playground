"use client";

import { useState, type FormEvent } from "react";
import { PASSWORD_MIN } from "@/lib/account-rules";
import { authClient } from "@/lib/auth-client";

/**
 * Signing in, or making an account, wherever the form stands (the
 * studio's dialog, the home page's stage): a name for a new account,
 * an email and a password of PASSWORD_MIN or more. What is missing or
 * too short is said here, in the page's words, before anything is sent;
 * what the server refuses is said in the library's words; what goes
 * right calls `onDone`. A forgotten password asks for a link by mail;
 * Google is a way in when the site has it (NEXT_PUBLIC_AUTH_GOOGLE).
 */
export type AccountMode = "in" | "up";
export const ACCOUNT_MODES: { id: AccountMode; label: string }[] = [
  { id: "in", label: "Sign in" },
  { id: "up", label: "Create account" },
];
export const GOOGLE_SIGN_IN = process.env.NEXT_PUBLIC_AUTH_GOOGLE === "1";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useAccountForm(onDone?: () => void) {
  const [mode, setModeRaw] = useState<AccountMode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** what was done that is not an error: a link on its way */
  const [note, setNote] = useState<string | null>(null);
  const setMode = (m: AccountMode) => {
    setModeRaw(m);
    setError(null);
    setNote(null);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem =
      mode === "up" && !name.trim()
        ? "A name, so Eva knows what to call you."
        : !EMAIL.test(email)
          ? "That email does not look right."
          : password.length < PASSWORD_MIN
            ? `A password needs ${PASSWORD_MIN} characters or more.`
            : null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const r =
      mode === "up"
        ? await authClient.signUp.email({
            name: name.trim(),
            email,
            password,
            callbackURL: "/rounded",
          })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (r.error) {
      setError(r.error.message ?? "That did not work; try again.");
      return;
    }
    onDone?.();
  };
  /** a link to set a new password, to the email in the box */
  const forgot = async () => {
    if (busy) return;
    if (!EMAIL.test(email)) {
      setError("Put your email in first, and the link goes there.");
      return;
    }
    setBusy(true);
    setError(null);
    await authClient.requestPasswordReset({ email, redirectTo: "/reset" });
    setBusy(false);
    // said the same whether or not the address has an account
    setNote(
      "If that address has an account, a link to set a new password is on its way.",
    );
  };
  const google = () =>
    void authClient.signIn.social({
      provider: "google",
      callbackURL: "/rounded",
    });
  return {
    mode,
    setMode,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    busy,
    error,
    note,
    submit,
    forgot,
    google,
  };
}
