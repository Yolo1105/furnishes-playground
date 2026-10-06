import { SITE } from "./site";

/**
 * A word to the studio, from wherever it is written (the gear's
 * Feedback in the studio, Ask us on the help page): what kind of word,
 * the words, where they were written and, for a guest, an email for the
 * reply. It goes to the studio's own table (api/help); when that fails
 * the same words can go by mail, and the failure is said in the page's
 * language.
 */
export const HELP_KINDS = [
  { id: "problem", label: "Something is wrong" },
  { id: "idea", label: "An idea" },
  { id: "question", label: "A question" },
] as const;
export type HelpKind = (typeof HELP_KINDS)[number]["id"];

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** the fewest characters a message needs, as the route has it */
export const MESSAGE_MIN = 5;

export type HelpWord = {
  kind: HelpKind;
  message: string;
  /** the page, and the project, it was written from */
  context: string;
  /** a guest's email; a signed-in sender is known by the session */
  email?: string;
};

/** null when it went through; otherwise what to say about it */
export async function sendHelp(w: HelpWord): Promise<string | null> {
  try {
    const res = await fetch("/api/help", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: w.kind,
        message: w.message.trim(),
        context: w.context,
        ...(w.email ? { email: w.email } : {}),
      }),
    });
    if (res.ok) return null;
    return res.status === 429
      ? "That is the day's share of messages from here; send it by mail instead."
      : "It did not go through; send it by mail instead.";
  } catch {
    return "The studio could not be reached; send it by mail instead.";
  }
}

/** the same words as a mail to the studio */
export const helpMailto = (w: Pick<HelpWord, "kind" | "message" | "context">) =>
  `mailto:${SITE.contact}?subject=${encodeURIComponent(
    `${SITE.name}: ${HELP_KINDS.find((k) => k.id === w.kind)!.label.toLowerCase()}`,
  )}&body=${encodeURIComponent(`${w.message.trim()}\n\n(${w.context})`)}`;
