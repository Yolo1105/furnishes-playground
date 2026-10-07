# Deploying the studio

The studio is a Next.js app in `apps/web` with its own Postgres behind
it. Locally it needs nothing: PGlite keeps the database under
`apps/web/.data`, mail is kept in a file, and every provider is off
(Eva answers from the rules, room items stand as shapes, an order waits
offline). Hosted, it needs a Postgres and two secrets; every provider
is one key more. `GET /api/health` on any running server says which of
this is on, what the database is, how many migrations ran, and what a
hosted deployment is still missing. Nothing in that answer is a secret.

## 1. Vercel and Neon (required)

1. On Neon, make a project and copy its pooled connection string.
2. On Vercel, import the repository with `apps/web` as the root
   directory; the build command and the output are Next's own.
3. Set these environment variables for Production (and Preview if you
   want previews to have accounts):
   - `DATABASE_URL`: the Neon connection string. A hosted run without it
     refuses to start rather than keep accounts on a disk that is wiped.
   - `BETTER_AUTH_SECRET`: 32 characters or more, from
     `openssl rand -base64 32`. Signs every session.
   - `BETTER_AUTH_URL`: the site's address, `https://furnish-es.com`.
   - `ADMIN_EMAILS` and `CRON_SECRET`: who runs operations and the token
     the nightly sweep is sent (section 3). A hosted site without them
     is reported as missing them by `/api/health`.
4. Add the domain. The site's name, address and contact default to
   furnish-es.com's (`apps/web/src/lib/site.ts`); a deployment elsewhere
   sets the three public variables in section 2.
5. Deploy. The migrations under `apps/web/drizzle` run on the first
   request; `/api/health` then reports `database.kind: "neon"` and the
   migration count, and `missingForHosting: []`.

## 2. The providers (each optional)

| Service                      | Variables                                                                                        | Without it                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Eva's model (Anthropic)      | `ANTHROPIC_API_KEY`, optional `EVA_MODEL`                                                        | Eva answers from the studio's rules; Review this room uses the rules |
| Pictures and meshes (fal.ai) | `FAL_KEY`                                                                                        | room items stand as stock meshes or shapes                           |
| Payments (Stripe)            | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                     | an order is placed and waits offline                                 |
| Mail (Resend)                | `RESEND_API_KEY`, `MAIL_FROM`                                                                    | a hosted server sends nothing and says so in its log                 |
| Google sign-in               | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_AUTH_GOOGLE=1`                          | email and password only                                              |
| Costs and shares             | `EVA_USD_PER_M_IN`, `EVA_USD_PER_M_OUT`, `FAL_USD_PER_ITEM`, `DAILY_USD_PER_CALLER`, `DAILY_USD` | the defaults in `apps/web/src/lib/cost.ts`                           |

Tuning (each optional, the defaults are the product's rules):
`CHAT_TURNS_PER_HOUR`, `ITEMS_PER_HOUR`, `REVIEWS_PER_DAY`,
`WAITLIST_PER_HOUR`, `HELP_PER_DAY` and `DOCUMENT_BYTES` set a caller's
shares and a document's weight; `/api/health` lists the values in
force. `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_SITE_URL` and
`NEXT_PUBLIC_SITE_CONTACT` put the site under another name or address
(they are baked in at build time, so a change is a rebuild);
`BETTER_AUTH_URL` stays the address sign-ins are trusted from.

Stripe: in the dashboard, add a webhook endpoint at
`https://<site>/api/webhooks/stripe` for the checkout session, payment
intent and charge events, and copy its signing secret into
`STRIPE_WEBHOOK_SECRET`. Google: in the OAuth client, allow the redirect
URI `https://<site>/api/auth/callback/google`. Resend: verify the
sending domain, and set `MAIL_FROM` to an address on it.

## 3. Operations and the nightly sweep

Two more variables run the studio's own operations:

- `ADMIN_EMAILS`: a comma-separated list of account emails. Those
  accounts, signed in, open `/ops`: every order with the moves the
  studio makes (paid another way when Stripe is off, delivered,
  cancelled, refunded) and a note on each; the words people wrote to
  the studio, with a reply by mail and a mark once answered; the
  waitlist as a CSV and the one note it is promised, sent once to
  everyone not yet written to; and what the providers cost today and
  this month against the caps, with which services are on. Anyone
  else, signed in or not, gets 404; without the variable nobody is an
  admin. Make the admin's account at `/account` as any other.
- `CRON_SECRET`: the token the host's cron sends. `apps/web/vercel.json`
  schedules `GET /api/cron/retention` nightly at 03:00 Singapore
  (19:00 UTC), and Vercel sends `Authorization: Bearer <CRON_SECRET>`
  on its own once the variable is set. The sweep deletes rate-limit
  windows older than a day and cost rows older than ninety days;
  orders, payment events, accounts and what people wrote are never
  touched. Without the secret the route answers 503 and sweeps
  nothing.

The studio writes to buyers and senders on its own, through the same
mail as the account links: an order placed, paid, delivered or refunded
(to the account's email, or the one a guest gives at checkout), thanks
for a word to the studio, and the waitlist's note. On a development
server every one is kept under `.data/mail.json` and read at
`/api/dev/mail`; `apps/web/.env.development` (committed, no secret in
it) makes `ops@example.com` the admin and sets the development cron
token, so the suites run the operations end to end.

## 4. What to check after a deploy

One command runs every check below against the site and exits 1 on
any failure (`.github/workflows/deploy-check.yml` runs the same from
the Actions tab, given the address):

    pnpm smoke https://furnish-es.com

What the command checks:

- `GET /api/health` is 200, `ok: true`, the database migrated, and on a
  hosted site `missingForHosting: []` (which covers `ADMIN_EMAILS` and
  `CRON_SECRET`); it prints which services are on.
- The landing and the inner pages open; every response carries the
  security headers (`X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS); `/robots.txt` keeps crawlers out of
  `/api/`, `/reset`, `/ops` and `/s/`; the sitemap lists the pages.
- The waitlist takes an address once and refuses it twice; Eva answers
  (from the model with a key, from the rules without).
- `/ops` and its routes are 404 to a guest; the nightly sweep refuses a
  call without its token.

What to try by hand after the first deploy:

- `/account` makes an account; with mail on, the confirmation link
  arrives; with Google on, the button shows.
- Signed in as an admin, `/ops` lists the orders, the words and the
  waitlist, and a move on an order sends its letter.
- With Stripe on, an order from the studio opens the hosted payment page
  and comes back paid; the order then reads paid under `/ops` and the
  event is in the `payment_event` table.

## 5. Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: the
format, the lint, the types, the unit tests of both packages, the
production build, and the studio's end-to-end suite in Chromium against
a development server with PGlite. Nothing in CI needs a key.
