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
4. Add the domain. The site's name, address and contact are in
   `apps/web/src/lib/site.ts`; a deployment elsewhere changes them there.
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

## 3. What to check after a deploy

- `GET /api/health` is 200, `ok: true`, `missingForHosting: []`.
- The landing opens at `/`; `/account` makes an account; with mail on,
  the confirmation link arrives; with Google on, the button shows.
- Every response carries the security headers (`X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS); `/robots.txt` keeps
  crawlers out of `/api/` and `/reset`.
- With Stripe on, an order from the studio opens the hosted payment page
  and comes back paid; the webhook row shows in the cost and event
  tables.

## 4. Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: the
format, the lint, the types, the unit tests of both packages, the
production build, and the studio's end-to-end suite in Chromium against
a development server with PGlite. Nothing in CI needs a key.
