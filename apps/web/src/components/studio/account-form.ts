"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Signing in, or making an account, wherever the form stands (the
 * studio's dialog, the home page's stage): a name for a new account,
 * an email and a password of eight or more. What goes wrong is said in
 * the library's words; what goes right calls `onDone`.
 */
export type AccountMode = "in" | "up";
export const ACCOUNT_MODES: { id: AccountMode; label: string }[] = [
  { id: "in", label: "Sign in" },
  { id: "up", label: "Create account" },
];

export function useAccountForm(onDone?: () => void) {
  const [mode, setModeRaw] = useState<AccountMode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setMode = (m: AccountMode) => {
    setModeRaw(m);
    setError(null);
  };
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
    onDone?.();
  };
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
    submit,
  };
}
