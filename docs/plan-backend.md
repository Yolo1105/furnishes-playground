# The backend, reviewed for a smooth run

A review of the server and the account, order and share flows as a
person meets them end to end (the site, an account, its confirmation,
two devices, a room shared, an order paid, the mails, a return later,
an export, the end of the account) and as the operator runs them
(Vercel and Neon, the operations page, the nightly sweep, the costs,
the limits, what the log says). What was found, what was done about
it, and what is left to a hand check or a later step.

## What was found

- **Two devices wrote over each other.** The mirror was pulled once at
  sign-in and every later change pushed whole, so a phone's rename
  erased a laptop's new project and the laptop's next push erased the
  rename; neither saw the other until a reload. A document of the
  wrong shape, from one bad device, broke every device's pull, and a
  failed save showed only inside the Account dialog.
- **A paid order could stay "awaiting payment".** The webhook matched
  an order by the session or intent it was opened with, written after
  the Stripe call; an intent's event arriving first, or that write
  failing, left the event consumed and the order waiting, silently.
- **Order numbers came from the browser** (the time in base 36,
  colliding every seventeen hours), and a guest whose request got
  through but whose answer was lost saw "that number is in use" on the
  retry. A cancelled order's payment page stayed open and could be
  paid; a lapsed page was handed back again to a retry; the way back
  from paying was built from whatever `Origin` the request said.
- **A buyer had nothing to come back to**: the mails said "it stands
  in the studio's Orders", but the orders lived in one browser's
  storage, and no page showed an order by its key.
- **Mail went once, with no timeout, retry or idempotency**, and a
  hosted site without a mail key reported itself as lacking nothing
  while every reset and confirmation was a dead end; a confirmation
  link dropped the person in the studio with no word, an expired one
  the same.
- **Sign-ins were counted in memory**, per instance, so a fleet held
  no line against credential stuffing or reset-mail bombing.
- **Bodies were parsed before their size was checked**; checkout, the
  share, the mirror and the order routes had no caller's share; a
  signed-in caller was counted as their address.
- **Nothing was logged**: a database failure was a bare 500, a Stripe
  refusal swallowed, an unmatched webhook silent.
- **Migrations ran on every cold start**, unlocked, racing on a deploy
  that added one; the sweep left sessions and mail links to grow; a
  deleted account kept the verification rows and the email on what
  it wrote; the privacy page said "three ways only" of six letters.
- **A shared room with a broken document read as "taken down"**, a
  share that failed said nothing, and the page carried no room name.

## What was done

- The mirror: every push says the time it last saw (`ifAt`); a push
  the account has moved past comes back as 409 with the account's
  copy, which the browser merges with its own rules and pushes again;
  coming back to the tab pulls again; each document is checked
  against its shape and the whole against its weight before anything
  is written; the user bar says when a save did not go through; a
  change is pushed as the document it is in alone (the whole after a
  pull or a merge), so no push weighs more than one document at its
  cap, well under the host's request limit.
- Orders: the server numbers an order (`orderNumber`, the day's
  minute in base 36 and three characters, retried on a clash) and
  hands the number back, the browser's own being its handle until
  then; the webhook finds the order by the number the session and its
  intent carry, then by the session or intent, and says in the log
  what it applied, refused or could not match; a cancel, by the
  shopper or from ops, expires the Stripe session; an order placed
  again gets its open page back or a fresh session under a fresh
  idempotency key; the way back from paying is the order's own page,
  `/orders/<number>?key=<key>`, on the site's own origin; that page
  shows the order live (its state, pieces, address, the page to pay
  on, a cancel) and every letter links to it; Orders reads each known
  order anew when it opens and links its page.
- Mail: a ten-second timeout, one retry after a 429 or a 5xx honouring
  `Retry-After`, an idempotency key per letter (the order and its
  move, the waitlist address), the failure's status and first words in
  the log; a hosted site without `RESEND_API_KEY` is reported as
  missing it; the confirmation link returns to `?verified=1` and the
  studio says so at its foot, a lapsed link the same.
- Sign-ins, sign-ups and reset mails are counted in the database
  (`auth_rate_limit`, migration 0007); an account can end however long
  ago it signed in, and takes its verification rows and the address on
  what it wrote with it (`help_request.email` is nullable now); the
  privacy page says what is kept (orders, as the ledger's record) and
  the six letters the studio writes.
- Every route reads its body with a cap (`readJson`) before parsing;
  checkout counts a caller's orders an hour and an address's a day,
  the share and the mirror count pushes; a signed-in caller of Eva's
  routes is counted as themselves.
- A JSON line per event in the log (`lib/log`): checkout placed,
  order moved or cancelled, webhook ignored, unmatched, refused,
  applied or failed, Stripe and Resend failures with their status,
  mail dropped or unsent.
- A Neon server counts the migrations in and migrates only when the
  journal is ahead; the deploy guide puts `pnpm migrate` in the build.
  The sweep also deletes sessions and mail links past their time and
  cancels an offline order left thirty days.
- A shared room is checked against the snapshot's shape, carries no
  cart or labels, is told apart as gone or unreadable, and its page is
  titled after the room; a share that fails says why.
- The checks after a deploy (`pnpm smoke`) try the money paths too;
  a unit test exercises the limiter against PGlite with
  `RATE_LIMITS=on`; the suite follows the order's page and the
  confirmation's word.

## What is left

- By hand, on a deployment: a Stripe payment end to end (the webhook
  events as listed in `docs/DEPLOY.md`), a Resend letter, a Google
  sign-in with both halves set, the build command with `pnpm migrate`.
- Error reporting beyond the log (a Sentry DSN, say) when the host's
  log search is not enough.
