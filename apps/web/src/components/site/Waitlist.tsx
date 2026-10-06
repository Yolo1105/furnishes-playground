"use client";

import { useState, type FormEvent } from "react";
import { EMAIL } from "@/lib/help-client";
import { LANDING } from "./copy";

/**
 * Be first through the door: an email, kept once by api/waitlist, for
 * the one note the day ordering opens. The same email again is said to
 * be there already; what is not an address is said before anything is
 * sent.
 */
type Status =
  "idle" | "invalid" | "pending" | "on" | "already" | "unavailable" | "error";

export function Waitlist() {
  const w = LANDING.waitlist;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const done = status === "on" || status === "already";
  const wrong =
    status === "invalid" || status === "error" || status === "unavailable";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "pending") return;
    const v = email.trim().toLowerCase();
    if (!EMAIL.test(v)) {
      setStatus("invalid");
      return;
    }
    setStatus("pending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: v }),
      });
      if (res.ok) setStatus("on");
      else if (res.status === 409) setStatus("already");
      else if (res.status === 429) setStatus("unavailable");
      else setStatus("error");
    } catch {
      setStatus("unavailable");
    }
  };
  const note =
    status === "invalid"
      ? "That does not look like an email address."
      : status === "unavailable"
        ? "The list cannot be reached just now; try again in a while."
        : status === "error"
          ? "That did not work; try again."
          : status === "pending"
            ? "Adding you…"
            : w.note;
  return (
    <section className="ld-wl" id="waitlist" aria-labelledby="ld-wl-h">
      <div className="ld-wl-in">
        <div>
          <p className="ld-eye ld-reveal">[ {w.tag} ]</p>
          <h2 className="ld-h2 ld-reveal" id="ld-wl-h">
            {w.head[0]} <i className="ld-hi">{w.head[1]}</i> {w.head[2]}
          </h2>
          <p className="ld-lede ld-reveal">{w.lede}</p>
        </div>
        <div className="ld-reveal">
          {done ? (
            <p className="ld-wl-done" role="status">
              {status === "already" ? w.already[0] : w.on[0]}{" "}
              <i className="ld-hi">
                {status === "already" ? w.already[1] : w.on[1]}
              </i>
            </p>
          ) : (
            <form className="ld-wl-form" onSubmit={submit} noValidate>
              <label className="ld-eye" htmlFor="ld-wl-email">
                Email address
              </label>
              <div className={`ld-wl-field${wrong ? " is-wrong" : ""}`}>
                <input
                  id="ld-wl-email"
                  className="ld-wl-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={w.placeholder}
                  value={email}
                  disabled={status === "pending"}
                  aria-invalid={wrong}
                  aria-describedby="ld-wl-note"
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (wrong) setStatus("idle");
                  }}
                />
                <button
                  className="ld-wl-go"
                  type="submit"
                  disabled={status === "pending"}
                  aria-label="Join the list"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
              <p
                id="ld-wl-note"
                className={`ld-wl-note${wrong ? " is-wrong" : ""}`}
                role={wrong ? "alert" : "status"}
              >
                {note}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
