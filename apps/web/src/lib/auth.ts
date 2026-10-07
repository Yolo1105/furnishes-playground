import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { PASSWORD_MIN } from "./account-rules";
import { str } from "./env";
import { sendMail } from "./mail";
import { SITE, trustedOrigins } from "./site";

/**
 * Who is in the studio: Better Auth over the Drizzle tables, with an
 * email and a password, or Google when GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET are set. A session lives in a cookie and is read
 * from the database on every request, so an account that ended is gone
 * at once on every device. A new account is sent a link to confirm its
 * email (signing in does not wait on it); a forgotten password is reset
 * by a link; a password can be changed, and the other devices signed
 * out. An account can be deleted by its owner. The secret comes from
 * BETTER_AUTH_SECRET (a development run falls back to the library's own
 * and says so); BETTER_AUTH_URL names the site in production, and a
 * sign-in is trusted from the site's own addresses and Vercel's
 * previews. Built on first use, as the database is.
 */
/** Google as a way in, when both halves of the OAuth client are set */
export const googleOn = () =>
  Boolean(str("GOOGLE_CLIENT_ID") && str("GOOGLE_CLIENT_SECRET"));
const google = () =>
  googleOn()
    ? {
        google: {
          clientId: str("GOOGLE_CLIENT_ID"),
          clientSecret: str("GOOGLE_CLIENT_SECRET"),
        },
      }
    : {};

const make = () =>
  betterAuth({
    database: drizzleAdapter(getDb().db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: `Reset your ${SITE.name} password`,
          text: `Hello ${user.name},\n\nA new password for ${SITE.name} can be set here:\n${url}\n\nThe link is good for an hour. If you did not ask for it, nothing changes; this mail can be left alone.\n\n${SITE.name}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: `Confirm your email for ${SITE.name}`,
          text: `Hello ${user.name},\n\nThis confirms ${user.email} is yours:\n${url}\n\nIf you did not make an account at ${SITE.name}, this mail can be left alone.\n\n${SITE.name}`,
        });
      },
    },
    socialProviders: google(),
    trustedOrigins: trustedOrigins(),
    user: { deleteUser: { enabled: true } },
    plugins: [nextCookies()],
  });

const kept = globalThis as typeof globalThis & {
  furnishesAuth?: ReturnType<typeof make>;
};
/** the auth instance, made on the first call; `ready` resolves once the
    database behind it is migrated */
export const getAuth = () => (kept.furnishesAuth ??= make());
export const authReady = () => getDb().ready;

/** who sent a request, by their session cookie: the user's id and
    email, or null for nobody; waits for the database first */
export const userOf = async (req: Request) => {
  await authReady();
  const s = await getAuth().api.getSession({ headers: req.headers });
  return s ? { id: s.user.id, email: s.user.email } : null;
};
export const userIdOf = async (req: Request) => (await userOf(req))?.id ?? null;
