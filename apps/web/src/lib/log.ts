/**
 * The server's log: one JSON line an event, so a host's log search
 * finds every order, event or failure by its fields. `event` names
 * what happened (route.what), the fields say about what; an error's
 * message rides along, never a secret. Nothing here throws, so a
 * line that cannot be written never fails the request it is about.
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

const line = (level: "info" | "warn" | "error", event: string, f: Fields) => {
  const out: Record<string, unknown> = { at: new Date().toISOString(), event };
  for (const [k, v] of Object.entries(f)) if (v !== undefined) out[k] = v;
  const text = JSON.stringify(out);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.info(text);
};

export const log = {
  info: (event: string, fields: Fields = {}) => line("info", event, fields),
  warn: (event: string, fields: Fields = {}) => line("warn", event, fields),
  error: (event: string, fields: Fields = {}) => line("error", event, fields),
};

/** an error's words, for a log line */
export const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
