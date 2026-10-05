import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { PASSWORD_MIN } from "./account-rules";
import { trustedOrigins } from "./site";

/**
 * Who is in the studio: Better Auth over the Drizzle tables, with an
 * email and a password. A session lives in a cookie and is read from
 * the database on every request, so an account that ended is gone at
 * once on every device. An account can be deleted by its owner. The secret
 * comes from BETTER_AUTH_SECRET (a development run falls back to the
 * library's own and says so); BETTER_AUTH_URL names the site in
 * production, and a sign-in is trusted from the site's own addresses
 * and Vercel's previews. Built on first use, as the database is.
 */
const make = () =>
  betterAuth({
    database: drizzleAdapter(getDb().db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN },
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

/** who sent a request, by their session cookie: the user's id, or null
    for nobody; waits for the database first */
export const userIdOf = async (req: Request) => {
  await authReady();
  const s = await getAuth().api.getSession({ headers: req.headers });
  return s?.user.id ?? null;
};
