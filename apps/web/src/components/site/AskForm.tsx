"use client";

import { usePathname } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSession } from "@/lib/auth-client";
import { EMAIL } from "@/lib/email";
import {
  HELP_KINDS,
  HELP_MAX,
  HELP_MIN,
  helpMailto,
  sendHelp,
  type HelpCategory,
} from "@/lib/help-client";
import { SITE } from "@/lib/site";
import { ONE_MOMENT } from "./copy";

/**
 * Ask us, on the help page: the same word to the studio as the gear's
 * Feedback, in the home page's language, sent from the help page with
 * the account's email or one typed here.
 */
export function AskForm() {
  const { data: session } = useSession();
  const email = session?.user.email;
  const [category, setCategory] = useState<HelpCategory>("question");
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const address = email ?? from.trim();
  const ready = message.trim().length >= HELP_MIN && EMAIL.test(address);
  const word = {
    category,
    message,
    context: usePathname(),
    ...(email ? {} : { email: address }),
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setFailed(null);
    const problem = await sendHelp(word);
    if (problem) setFailed(problem);
    else setSent(true);
    setBusy(false);
  };
  return (
    <section className="home-ask" id="ask" aria-labelledby="home-ask-h">
      <h2 className="home-eye" id="home-ask-h">
        Ask us
      </h2>
      {sent ? (
        <p className="home-sub" role="status">
          Thank you. We read every one, and answer to {address}.
        </p>
      ) : (
        <form className="home-form" onSubmit={submit} noValidate>
          <div className="home-modes" role="radiogroup" aria-label="What it is">
            {HELP_KINDS.map((k, i) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                className="home-mode"
                aria-checked={category === k.id}
                onClick={() => setCategory(k.id)}
              >
                <span>{k.label}</span>
                <span className="home-ix">[0{i + 1}]</span>
              </button>
            ))}
          </div>
          <div className="home-rows">
            <label className="home-row">
              <span className="home-row-l">
                Your words
                <span className="home-row-hint">
                  the spot, the problem, the question
                </span>
              </span>
              <textarea
                className="home-input home-textarea"
                rows={4}
                maxLength={HELP_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            {!email && (
              <label className="home-row">
                <span className="home-row-l">Your email</span>
                <input
                  className="home-input"
                  type="email"
                  autoComplete="email"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
            )}
          </div>
          {failed && (
            <p className="home-error" role="alert">
              {failed} <a href={helpMailto(word)}>Mail {SITE.contact}</a>
            </p>
          )}
          <div className="home-acts">
            <button
              type="submit"
              className="home-btn home-btn-primary"
              disabled={!ready || busy}
              aria-busy={busy}
            >
              {busy ? ONE_MOMENT : "Send"}
              <span aria-hidden="true"> →</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
