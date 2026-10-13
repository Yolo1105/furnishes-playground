import { str } from "./env";

/** the studio's admins: the emails in ADMIN_EMAILS (a comma-separated
    list), lower-cased; without the variable there are none, on purpose */
export const adminEmails = () =>
  str("ADMIN_EMAILS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export const isAdminEmail = (email: string | null | undefined) =>
  !!email && adminEmails().includes(email.toLowerCase());
