/**
 * The environment, read one way: a string trimmed and empty when unset
 * (so a `KEY=` line copied from the example is the same as no line), a
 * number with its default when the value is missing, not a number or
 * negative. The shares, the caps, the rates and every key read this
 * way, so a deployment can tune any of them without a release and a
 * development server runs with the numbers the tests know.
 */
export const str = (name: string) => process.env[name]?.trim() ?? "";

export const num = (name: string, fallback: number) => {
  const raw = str(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const HOSTED = Boolean(process.env.VERCEL);
