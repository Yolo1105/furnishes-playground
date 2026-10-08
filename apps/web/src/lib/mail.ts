import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "./data-dir";
import { IS_PRODUCTION, str } from "./env";
import { log } from "./log";
import { SITE } from "./site";

/**
 * Mail from the studio: the links that confirm an email and reset a
 * password (lib/auth), and the letters about an order, a word to the
 * studio and the waitlist (lib/mails). With RESEND_API_KEY set it goes
 * through Resend's REST API, from MAIL_FROM (or the site's contact);
 * without a key, on a development server, it is kept under
 * mail.json in the data folder and said in the log, where the tests
 * read it (api/dev/mail). A hosted run without a key sends nothing and
 * says so, rather than pretend. `mailMode` says which of the three.
 * A send waits at most TIMEOUT_MS, goes once more after a 429 or a
 * 5xx, and carries its key so the provider never sends one letter
 * twice for a retried request.
 */
export type Mail = {
  to: string;
  subject: string;
  text: string;
  /** the letter's identity for the provider: one send per key */
  key?: string;
};
const TIMEOUT_MS = 10_000;
/** the most a Retry-After is waited, ms */
const RETRY_WAIT_MAX_MS = 5_000;

/** how many kept mails a development server holds */
const KEEP = 50;
const file = () => path.join(dataDir(), "mail.json");

export const mailMode = (): "resend" | "off" | "kept" =>
  str("RESEND_API_KEY") ? "resend" : IS_PRODUCTION ? "off" : "kept";

/** the mails kept on a development server, newest first */
export const keptMail = (): (Mail & { at: number })[] => {
  try {
    return JSON.parse(readFileSync(file(), "utf8")) as (Mail & {
      at: number;
    })[];
  } catch {
    return [];
  }
};

export async function sendMail(
  mail: Mail,
): Promise<"sent" | "kept" | "unsent"> {
  const mode = mailMode();
  if (mode === "resend") {
    const key = str("RESEND_API_KEY");
    const post = () =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(mail.key ? { "Idempotency-Key": mail.key.slice(0, 256) } : {}),
        },
        body: JSON.stringify({
          from: str("MAIL_FROM") || `${SITE.name} <${SITE.contact}>`,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let res = await post();
    if (res.status === 429 || res.status >= 500) {
      const after = Number(res.headers.get("retry-after") ?? 1);
      await new Promise((r) =>
        setTimeout(r, Math.min(RETRY_WAIT_MAX_MS, (after || 1) * 1000)),
      );
      res = await post();
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200);
      log.error("mail.failed", {
        status: res.status,
        subject: mail.subject,
        body,
      });
      throw new Error(`mail ${res.status}`);
    }
    return "sent";
  }
  if (mode === "off") {
    log.warn("mail.unsent", {
      subject: mail.subject,
      reason: "no RESEND_API_KEY",
    });
    return "unsent";
  }
  const kept = [{ ...mail, at: Date.now() }, ...keptMail()].slice(0, KEEP);
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(kept, null, 2));
  console.info("[mail] kept", mail.subject, mail.to);
  return "kept";
}
