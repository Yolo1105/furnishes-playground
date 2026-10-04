import { createAuthClient } from "better-auth/react";

/** the browser's side of the account: sign in, sign up, sign out, and
    the session as a hook; same origin, so no URL to give */
export const authClient = createAuthClient();
export const useSession = authClient.useSession;
