import { SITE } from "./site";

/**
 * Which services stand behind this server, read from the environment
 * and said without a secret in sight: the database, mail, the model,
 * pictures and meshes, payments and its webhook, Google as a way in.
 * api/health says it to whoever asks; the README's deployment notes
 * say what each needs. "off" means the studio does without: Eva
 * answers from the rules, items stand as shapes, an order waits
 * offline, mail is kept on a development server and not sent on a
 * hosted one.
 */
const has = (name: string) => Boolean(process.env[name]?.trim());

export type Services = {
  /** where this runs: a hosted deployment or a local server */
  host: "vercel" | "local";
  database: "neon" | "pglite";
  auth: { secret: "set" | "default"; url: string; google: "on" | "off" };
  mail: "resend" | "kept" | "off";
  model: "on" | "off";
  images: "on" | "off";
  payments: { checkout: "on" | "off"; webhook: "on" | "off" };
  site: string;
  /** the commit this build came from, when the host says */
  commit: string | null;
};

export const services = (): Services => {
  const hosted = Boolean(process.env.VERCEL);
  const production = process.env.NODE_ENV === "production";
  return {
    host: hosted ? "vercel" : "local",
    database: has("DATABASE_URL") ? "neon" : "pglite",
    auth: {
      secret: has("BETTER_AUTH_SECRET") ? "set" : "default",
      url: process.env.BETTER_AUTH_URL?.trim() || SITE.url,
      google:
        has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET") ? "on" : "off",
    },
    mail: has("RESEND_API_KEY") ? "resend" : production ? "off" : "kept",
    model: has("ANTHROPIC_API_KEY") ? "on" : "off",
    images: has("FAL_KEY") ? "on" : "off",
    payments: {
      checkout: has("STRIPE_SECRET_KEY") ? "on" : "off",
      webhook: has("STRIPE_WEBHOOK_SECRET") ? "on" : "off",
    },
    site: SITE.url,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
};

/** what a hosted deployment cannot run without, by name */
export const missingForHosting = (s: Services = services()) =>
  [
    s.database === "pglite" ? "DATABASE_URL" : null,
    s.auth.secret === "default" ? "BETTER_AUTH_SECRET" : null,
    !process.env.BETTER_AUTH_URL?.trim() ? "BETTER_AUTH_URL" : null,
  ].filter((x): x is string => x !== null);
