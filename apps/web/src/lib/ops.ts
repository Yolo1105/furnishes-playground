import { userOf } from "./auth";
import { str } from "./env";
import { SITE } from "./site";

/**
 * Who may open the studio's operations: the accounts whose email is in
 * ADMIN_EMAILS (a comma-separated list). Everyone else gets what a
 * page that does not exist gives, 404, so the area is not announced.
 * Without the variable nobody is an admin, on purpose.
 */
export const adminEmails = () =>
  str("ADMIN_EMAILS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

const isAdminEmail = (email: string | null | undefined) =>
  !!email && adminEmails().includes(email.toLowerCase());

/** the admin behind a request, or null */
export const adminOf = async (req: Request) => {
  const who = await userOf(req);
  return who && isAdminEmail(who.email) ? who : null;
};

/** the same, for a page: the request's headers as a server component
    reads them */
export const adminOfHeaders = (headers: Headers) =>
  adminOf(new Request(SITE.url, { headers }));
