import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SITE } from "./site";

/**
 * Mail from the studio: the link that confirms an email, the link that
 * resets a password. With RESEND_API_KEY set it goes through Resend's
 * REST API, from MAIL_FROM (or the site's contact); without a key, on a
 * development server, it is kept under .data/mail.json and said in the
 * log, where the tests read it (api/dev/mail). A hosted run without a
 * key sends nothing and says so, rather than pretend.
 */
export type Mail = { to: string; subject: string; text: string };

const KEEP = 50;
const file = () =>
  path.join(
    process.env.DATA_DIR ?? path.join(process.cwd(), ".data"),
    "mail.json",
  );

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
  const key = process.env.RESEND_API_KEY?.trim();
  if (key) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM?.trim() || `${SITE.name} <${SITE.contact}>`,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!res.ok) throw new Error(`mail ${res.status}`);
    return "sent";
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("[mail] no RESEND_API_KEY: not sent", mail.subject, mail.to);
    return "unsent";
  }
  const kept = [{ ...mail, at: Date.now() }, ...keptMail()].slice(0, KEEP);
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(kept, null, 2));
  console.info("[mail] kept", mail.subject, mail.to);
  return "kept";
}
