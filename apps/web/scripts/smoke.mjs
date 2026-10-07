#!/usr/bin/env node
/**
 * The checks after a deploy, run against a site's address:
 *
 *   pnpm smoke https://furnish-es.com
 *
 * Reads /api/health (the database reached and migrated, nothing a
 * hosted deployment still lacks), opens the landing and the inner
 * pages, reads the security headers, robots and the sitemap, joins the
 * waitlist once (and sees the same address refused the second time),
 * and asks Eva one thing to see which brain answers; sees the
 * operations area kept from a guest and the nightly sweep kept from a
 * caller without the token. Says each check
 * as it passes or fails and exits 1 on any failure, so a workflow can
 * run it. Needs no key: a provider that is off is reported, not failed,
 * except the ones a hosted site cannot do without.
 */
const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("usage: smoke <https://site>");
  process.exit(2);
}
let failed = 0;
const say = (ok, what, detail = "") => {
  console.log(`${ok ? "ok " : "FAIL"} ${what}${detail ? ` · ${detail}` : ""}`);
  if (!ok) failed += 1;
};
const get = (path, init) =>
  fetch(`${base}${path}`, { redirect: "manual", ...init });

// the backend, as it says it is
const health = await get("/api/health");
const up = await health.json().catch(() => null);
say(
  health.status === 200 && up?.ok === true,
  "health answers",
  `${health.status}`,
);
if (up) {
  say(
    up.database.migrations > 0,
    "database migrated",
    `${up.database.kind}, ${up.database.migrations} migrations`,
  );
  const hosted = up.services.host === "vercel";
  say(
    !hosted || up.missingForHosting.length === 0,
    "hosting has what it needs",
    hosted ? up.missingForHosting.join(", ") || "all set" : "a local server",
  );
  for (const [name, state] of [
    ["mail", up.services.mail],
    ["model", up.services.model],
    ["pictures", up.services.images],
    ["payments", up.services.payments.checkout],
    ["webhook", up.services.payments.webhook],
    ["google", up.services.auth.google],
    ["ops", up.services.ops],
    ["cron", up.services.cron],
  ])
    console.log(`     ${name}: ${state}`);
}

// the pages
for (const path of ["/", "/account", "/help", "/privacy", "/terms"]) {
  const r = await get(path);
  say(r.status === 200, `page ${path}`, `${r.status}`);
}
const page = await get("/privacy");
say(
  page.headers.get("x-content-type-options") === "nosniff",
  "header X-Content-Type-Options",
);
say(
  (page.headers.get("referrer-policy") ?? "").includes("strict-origin"),
  "header Referrer-Policy",
);
say(
  (page.headers.get("permissions-policy") ?? "").includes("microphone"),
  "header Permissions-Policy",
);
if (base.startsWith("https://"))
  say(
    (page.headers.get("strict-transport-security") ?? "").includes("max-age"),
    "header Strict-Transport-Security",
  );
say((await get("/ops")).status === 404, "operations are not here for a guest");
say(
  (await get("/api/ops/waitlist")).status === 404,
  "the ops routes are not here for a guest",
);
const sweep = (await get("/api/cron/retention")).status;
say(
  sweep === 401 || sweep === 503,
  "the nightly sweep wants its token",
  sweep === 503 ? "CRON_SECRET not set" : `${sweep}`,
);
const robots = await (await get("/robots.txt")).text();
say(robots.includes("Disallow: /api/"), "robots keeps crawlers off the API");
const sitemap = await (await get("/sitemap.xml")).text();
say(
  ["/account", "/help", "/privacy", "/terms"].every((p) => sitemap.includes(p)),
  "sitemap lists the pages",
);

// the waitlist, once
const email = `smoke-${Date.now()}@example.com`;
const join = (e) =>
  get("/api/waitlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: e }),
  });
say((await join(email)).status === 200, "waitlist takes an address");
say((await join(email)).status === 409, "waitlist refuses it twice");

// Eva: the model, or the rules
const chat = await get("/api/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    message: "Where should the sofa go?",
    thread: [],
    context: {
      room: {
        id: "living",
        flat: "4-room",
        width: 6500,
        depth: 4000,
        height: 2600,
        sized: true,
      },
      pieces: [],
      cart: [],
      prefs: {},
      exploration: false,
      rules: {
        walkway: 600,
        doorClear: true,
        windowClear: true,
        bedWall: "prefer",
        mustHave: [],
        spacing: 0,
      },
      persona: "eva",
    },
  }),
});
say(
  [200, 503].includes(chat.status),
  "Eva answers",
  chat.status === 200 ? "from the model" : "from the rules (no key)",
);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
