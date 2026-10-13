import { userOf } from "./auth";
import { isAdminEmail } from "./admins";
import { SITE } from "./site";

/**
 * Who may open the studio's operations: the accounts whose email is in
 * ADMIN_EMAILS (lib/admins), once the email is verified: an account
 * made with someone else's address is not them. Everyone else gets
 * what a page that does not exist gives, 404, so the area is not
 * announced. The admin behind a request, or null.
 */
export const adminOf = async (req: Request) => {
  const who = await userOf(req);
  return who?.emailVerified && isAdminEmail(who.email) ? who : null;
};

/** the same, for a page: the request's headers as a server component
    reads them */
export const adminOfHeaders = (headers: Headers) =>
  adminOf(new Request(SITE.url, { headers }));
