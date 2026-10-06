/**
 * What may go to the model and what may come back. A message is refused
 * when it is empty, too long, carries control characters, or reads as
 * an attempt to talk the model out of its rules; the studio's own rules
 * answer such a message instead, and they take no instructions. What
 * the model says is read without any line that pretends to be a role or
 * a special token, and no longer than a screen can hold.
 */
export const MESSAGE_MAX = 2000;
const ANSWER_MAX = 10_000;

/** the shapes an attempt to override the rules takes */
const INJECTION: RegExp[] = [
  /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|above|prior)\s+instructions/i,
  /you\s+are\s+now\s+(a\s+)?(dan|unrestricted|unfiltered|evil|jailbr)/i,
  /new\s+instructions\s*:/i,
  /^\s*system\s*:\s*/im,
  /\[system\]/i,
  /<\|(im_start|system)\|>/i,
  /\bjailbreak\b/i,
  /override\s+(your\s+)?(instructions|rules|programming|guidelines)/i,
  /act\s+as\s+if\s+you\s+(are|were)\s+(a\s+)?(different|new|unrestricted|unfiltered)/i,
  /pretend\s+you\s+(are|have)\s+(no|a\s+different|new)\s+(rules|restrictions|guidelines|instructions|persona)/i,
];

export type Refusal = "empty" | "too-long" | "control-chars" | "injection";

/** why a message may not go to the model, or null when it may */
export function refuse(message: string): Refusal | null {
  if (!message.trim()) return "empty";
  if (message.length > MESSAGE_MAX) return "too-long";
  for (let i = 0; i < message.length; i++) {
    const c = message.charCodeAt(i);
    if (
      c <= 0x08 ||
      c === 0x0b ||
      c === 0x0c ||
      (c >= 0x0e && c <= 0x1f) ||
      c === 0x7f
    )
      return "control-chars";
  }
  return INJECTION.some((re) => re.test(message)) ? "injection" : null;
}

const ROLE_LINE =
  /^\s*(?:\[?\s*system\s*\]?\s*:|<\|im_(?:start|end)\|>|human\s*:|assistant\s*:)/i;
const TOKENS = /<\|im_(?:start|end)\|>/gi;

/** the model's words, without a line that plays a role or a token that
    is not words; a screenful at most */
export function sanitize(text: string): string {
  const kept = text
    .replace(TOKENS, "")
    .split(/\r?\n/)
    .filter((line) => !ROLE_LINE.test(line))
    .join("\n")
    .trim();
  return kept.length <= ANSWER_MAX ? kept : `${kept.slice(0, ANSWER_MAX)}…`;
}
