import type { Instrumentation } from "next";
import { log } from "@/lib/log";

/**
 * Every error the server catches while it answers (a page's render, a
 * route, an action), as one line in the server's log with where it
 * happened and React's digest, the id the error page shows; so a
 * failure a visitor saw can be found by the host's log search.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  log.error("request.failed", {
    reason: error instanceof Error ? error.message : String(error),
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String(error.digest)
        : undefined,
    method: request.method,
    // the path without its query: a reset's token or an order's key
    // never reach the log
    path: request.path.split("?")[0],
    route: context.routePath,
    kind: context.routeType,
  });
};
