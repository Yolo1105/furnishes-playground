import { googleOn } from "./auth";
import { HOSTED, str } from "./env";
import { mailMode } from "./mail";
import { adminEmails } from "./ops";
import { SITE } from "./site";

/**
 * Which services stand behind this server, read from the environment
 * and said without a secret in sight: the database, mail, the model,
 * pictures and meshes, payments and its webhook, Google as a way in,
 * the operations area and the nightly retention.
 * api/health says it to whoever asks; docs/DEPLOY.md says what each
 * needs. "off" means the studio does without: Eva
 * answers from the rules, items stand as shapes, an order waits
 * offline, mail is kept on a development server and not sent on a
 * hosted one.
 */
const has = (name: string) => Boolean(str(name));

export type Services = {
  /** where this runs: a hosted deployment or a local server */
  host: "vercel" | "local";
  database: "neon" | "pglite";
  auth: { secret: "set" | "default"; url: string; google: "on" | "off" };
  mail: "resend" | "kept" | "off";
  model: "on" | "off";
  images: "on" | "off";
  payments: { checkout: "on" | "off"; webhook: "on" | "off" };
  /** who may open /ops (ADMIN_EMAILS), and whether the retention cron
      has its secret */
  ops: "on" | "off";
  cron: "on" | "off";
  site: string;
  /** the commit this build came from, when the host says */
  commit: string | null;
};

export const services = (): Services => {
  return {
    host: HOSTED ? "vercel" : "local",
    database: has("DATABASE_URL") ? "neon" : "pglite",
    auth: {
      secret: has("BETTER_AUTH_SECRET") ? "set" : "default",
      url: str("BETTER_AUTH_URL") || SITE.url,
      google: googleOn() ? "on" : "off",
    },
    mail: mailMode(),
    model: has("ANTHROPIC_API_KEY") ? "on" : "off",
    images: has("FAL_KEY") ? "on" : "off",
    payments: {
      checkout: has("STRIPE_SECRET_KEY") ? "on" : "off",
      webhook: has("STRIPE_WEBHOOK_SECRET") ? "on" : "off",
    },
    ops: adminEmails().length > 0 ? "on" : "off",
    cron: has("CRON_SECRET") ? "on" : "off",
    site: SITE.url,
    commit: str("VERCEL_GIT_COMMIT_SHA").slice(0, 7) || null,
  };
};

/** what a hosted deployment cannot run without, by name: the database,
    the two auth settings, someone to run operations and the token the
    nightly sweep is sent */
export const missingForHosting = (s: Services = services()) =>
  [
    s.database === "pglite" ? "DATABASE_URL" : null,
    s.auth.secret === "default" ? "BETTER_AUTH_SECRET" : null,
    !has("BETTER_AUTH_URL") ? "BETTER_AUTH_URL" : null,
    s.ops === "off" ? "ADMIN_EMAILS" : null,
    s.cron === "off" ? "CRON_SECRET" : null,
  ].filter((x): x is string => x !== null);
