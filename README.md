# furnishes-playground

Furnishes studio: a design-to-buy studio for Singapore HDB flats selling
modular 18 mm panel furniture. This repository is the clean rebuild; the
archived standalone playground, the prod chatbot and the house site are its
donors.

## Workspace

```
apps/web          Next.js 16 app (React 19.3 + React Compiler, Tailwind 4, R3F)
packages/domain   the catalogue: recipes, parts, steps and prices (framework-free)
packages/scene    the world frame: the domain's millimetres to the renderers' metres
```

pnpm 10 workspace. Any Node 24 (24.21 recommended, see `.nvmrc`). TypeScript 6.
Use pnpm, not npm: `npm install` will refuse the workspace.

## Run

```sh
nvm use                 # Node 24.21.0
corepack enable         # or: npm i -g pnpm@10
pnpm install            # again after every pull: the dependencies move
cp apps/web/.env.example apps/web/.env.local   # keys as they land; none needed locally
pnpm dev                # http://localhost:3000
```

A "Module not found" at start, naming a package under `node_modules/.pnpm`,
means the install is older than the checkout: run `pnpm install`.

Checks: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
(vitest: the domain package's recipes and prices; the web app's Stripe
signing, order pricing, the guard, the letters, Eva's rules and the
room layouts), `pnpm e2e` (the studio's suite, the touch suite on a
tablet and a phone, and five fixed views of the room compared with the
pictures kept under `apps/web/e2e/visual.spec.ts-snapshots`, which
`--update-snapshots` renews once a change in the look is meant),
`pnpm build`. CI runs the same.

Notes:

- ESLint is pinned to the 9.x maintenance line: `eslint-config-next` bundles
  `eslint-plugin-react` 7.37, which does not run on ESLint 10 yet.
- TypeScript is pinned to the latest 6.x: `typescript-eslint` 8.71 supports
  TypeScript below 6.1 and refuses 7.0 outright (its issue #10940 tracks
  support for 7.1 and later). The project typechecks under 7.0.2, so the
  bump is one line in four package.json files once the linter allows it.
- `pnpm e2e` on a machine with its own Chromium: set
  `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium`.

## Devices and browsers

The studio is driven by a mouse, a trackpad, a finger or a pen, and by
the keyboard alone. Every drag runs on pointer events, so a tile, a
piece, the sheet and the turn handle behave the same under each. A
wheel on the plan is read by what sent it: a mouse notch zooms, a
trackpad's two-finger scroll moves the sheet, a pinch zooms (as a wheel
with Control, or Safari's own gesture), and Settings has "Scroll wheel
on the plan" to settle it. Two fingers pinch and move the plan; a long
press on a piece raises its actions; a tile is carried after a hold.
Tooltips wait for a hover only where hover exists, targets grow to a
finger's size under a coarse pointer, and what a hover would reveal (the
cart on a card, the actions under an answer, the eye on a picked row)
stands shown under a finger. Help, from the gear or ?, says what the
hand does in three tabs: Mouse & trackpad, Touch and Keyboard, opening
on the one in use. On a tablet upright the panels
become drawers; on a phone the plan fills the width and the Project and
Eva tabs open the drawers.

The browser floor is what the stylesheet's colour syntax needs: Chrome
or Edge 119, Safari 16.4 (Mac, iPhone and iPad), Firefox 128, or newer;
`browserslist` records it and an older browser is told so in one line.
3D needs WebGL 2, which they all have; it draws at most two device
pixels per CSS pixel, drops shadows under a finger, and renders a frame
only when something moves.

Playwright runs the desktop suite on Chromium with a mouse and the
touch suite on Chromium emulating an iPad and an iPhone. On a machine
of your own, `cd apps/web && npx playwright install` fetches the
browsers once (Chromium, WebKit and Firefox); then `npx playwright
test` runs the Chromium projects and `PW_ENGINES=1 npx playwright test`
adds the desktop suite on WebKit and Firefox. The cloud container has
Chromium only, so those two engines run on your machine.

## Status

A working studio on the real catalogue. The site opens on the landing
(`/`), in the approved design: the red-orange band with the compressed
title and its fading echoes, a cream main whose hero is a spot in a room
as it is and with the piece we would put there (one picture, a line you
drag; five spots captioned in the visitor's words, each with the piece's
parts, bolts, minutes and estimated price from the catalogue and a link
that opens the studio with that piece placed and its Detail shown,
`/rounded?piece=<id>`), the thirteen pieces with their sizes and
estimated prices, how a piece is built, what the studio does, the list
for the day ordering opens (`/api/waitlist`), and the accent footer. A
Menu opens the full-screen menu of pages and sections, a section rail
bottom-left follows the scroll, and a one-line cookie note, dismissed
once, says that the session is the only cookie. The inner pages share
one design, a rail beside a cream stage set in Archivo and Space Mono:
the account's way in (`/account`, with Sign in or Create account and a
quiet link to look around without one; whoever is signed in, or has
just signed in, goes straight on into the studio), help (`/help`: how a
piece is made, delivered and built, returns, where a price comes from,
and Ask us, which writes to the studio's help table), privacy
(`/privacy`) and the terms with the refund policy inside them
(`/terms`); every word of those pages is in
`apps/web/src/components/site/copy.ts`. `/rounded` is the studio with
floating panels and `/studio` the square-cornered one; Settings
switches between them. Projects
(new, rename, delete, switch) each hold a room, its pieces and Eva's
side, autosaved in the browser.

Eva can change the room. When she is asked to furnish, lay out, move
or add things, her answer carries changes (pieces moved or turned,
taken out, catalogue pieces brought in, room items made from a few
words, each with a spot, and a layout to run over everything), shown
under her message as Eva's changes with Apply and Not now; Apply is one
undo step. The chat context tells the model where every piece stands
and how big it is, and what the planner flags. Two actions sit beside
Brainstorm in the Agent tab: Furnish this room (what the room kind's
archetype asks for that is not there yet, from the catalogue or as a
room item, laid out by the book) and Review this room (three to five
observations, each with a piece to add or a thing to ask; the route
`/api/suggestions` gives a caller so many a day, counted in the
database, and without a key or past the day's share the studio's own
rules review the room from the planner's findings, the archetype, what
is missing and the budget). The planner's Layouts gained a fourth, By
the book, from archetype rules per room kind
(`apps/web/src/components/studio/archetypes.ts`: the bed centred on the
longest wall with the bedsides flanking it, the wardrobe opposite, the
desk at the window, the sofa facing the sideboard with the coffee table
in front, the bookwall along the longest free wall, the dining table in
the middle); the same rules are the model's guidance on the layout lens,
and each layout's Inspect has Ask Eva why. View settings gained
Surroundings: the studio's own light panels, or one of four Poly Haven
environment maps (an apartment, a photo studio, a sunset, night) under
`public/sky`, which light and reflect in the room, and an Exposure
slider; the picture is tone-mapped with AgX, the fill comes from the
surroundings and a sky-against-floor light rather than a flat ambient
term, and every grained surface (the panels, the floors) carries a
relief read from its own grain, a normal and a roughness map, so it
catches the light along the grain. The room renders with three's WebGPU
renderer where the browser has an adapter and on its WebGL 2 backend
elsewhere (the stage says which, `data-backend`); the light panels are
two surroundings files drawn by `apps/web/scripts/make-panels.mjs`.
After the scene is drawn, the picture is finished through three's
render pipeline (`apps/web/src/components/studio/Post.tsx`): ambient
occlusion from the frame's depth darkens the seams where a piece meets
the floor or a wall, the frame is tone-mapped onto the page's own
backdrop, and the edges are resolved over frames (TRAA); a desktop
draws the occlusion at full size, a laptop at half, a phone skips it
and smooths its edges in one pass (SMAA), the stage says which
(`data-post`), and View settings' Picture picks Auto, Full, Light or
Plain (Auto follows the device; a software GPU gets a phone's). On a
browser with WebGPU, Render takes a photo: the light is traced through
the room (`apps/web/src/components/studio/Photo.tsx`), denoised with
weights the app serves under `apps/web/public/oidn`, and the compare
sets it against a picture of the view as it stood; elsewhere the
render is the view graded. In the evening the sun stands low beyond
the window's wall and comes in through the glass, the walls casting
their shadows, with the surroundings standing back. The walls have a thickness
(the Room tab's Walls, beside the height): the outline is their inner
face in both views, the plan draws the band outside it, and in 3D each
wall is built solid with its openings cut through, mitred where it
meets the next. A carcass piece opens as panels in the Detail tab
(Panelizer's model and snapping, rewritten into `packages/domain`):
each panel is listed and typed in millimetres, added to, duplicated
or removed, picked and dragged in 3D with its faces snapping to its
neighbours, and the piece's size and price follow its panels. The
room's own bounce light comes from a grid of light probes over the
shell (`apps/web/src/components/studio/Probes.tsx`), baked over frames
whenever the shell, its finish or its light changes and never under a
drag (the pieces are left out of the probes' pictures), and the floor
reflects the room from one picture taken from its middle, each
reflection projected on the room's box
(`apps/web/src/components/studio/Reflection.tsx`), taken again a
moment after the room or its pieces change; the stage says when a bake
or a picture is on its way (`data-probes`, `data-reflection`). The gear's Board
keeps pictures with a title and a note, uploaded (sized down in the
browser first) or saved from a generated room item's tile, with the
starred room items beside them; it is mirrored to the account as a
fifth document and is in the data export. `docs/` holds the deployment
guide, the research notes and the Chinese product brief.

Accounts are Better Auth over Drizzle: an email and a password from the
gear's Sign in (or Google, when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
and `NEXT_PUBLIC_AUTH_GOOGLE=1` are set), the name and email in the
user bar, Account and Sign out beside them. A new account is sent a
link that confirms its email (signing in does not wait on it; the
gear's Account says whether it is confirmed and sends the link again);
a forgotten password is asked for from the sign-in form and set anew on
the page its link opens (`/reset`); the gear's Account changes the
password with the current one, which signs the other devices out, and
lists the devices signed in, each to be signed out from here. Mail goes
through Resend (`RESEND_API_KEY`, `MAIL_FROM`); without a key a
development server keeps it under `.data/mail.json`, where the tests
follow its links (`/api/dev/mail`), and a hosted run says it sent
nothing. The browser stays the truth and the account mirrors
it: signed in, the projects (and which were deleted), the orders, the
room items made and the guide's record are pulled, merged with
what is here (a project goes to the newer copy and stays gone where
either side deleted it later; an order keeps the state that moved on
from awaiting payment) and pushed back, then every change is pushed a
moment later, saying the time the mirror was last seen at; a push the
account has moved past since (another device) comes back with the
account's copy to merge and push again, and coming back to the tab
pulls again; the user bar says when a save did not go through. The
view and the wheel stay the device's own. The gear's
Account shows the name, editable, the email, when the mirror was last
taken with Save now, Sign out, the rooms shared by link, and the end of
the account, which takes the mirror with it and leaves the browser's
copy. Export has Share a link: a copy
of the open project's room and pieces, without Eva's side, kept under a
short id for anyone with the link (`/s/<id>`), who sees the room in 3D
read-only with the pieces and their total and can take it into a studio
of their own as a new project; the gear's Account lists what is shared
and takes a link down. The database is Neon Postgres when `DATABASE_URL` is set and
PGlite otherwise, a Postgres inside the server process that keeps its
files under `apps/web/.data/pglite`, so a checkout runs and tests with
no account anywhere; the migrations under `apps/web/drizzle` run when
the server first touches the database (a hosted build runs `pnpm
migrate` ahead of it), and `pnpm db:generate` (in `apps/web`) writes
a new one from a change to the schema. An order is numbered by the
server, has its own page (`/orders/<number>?key=<key>`, which its
letters link to and the payment page comes back to), and its payment
page is closed when it is cancelled; every route reads its body with a
cap, counts a caller's goes, and says its failures as one JSON line
each in the log. A project's snapshot carries the
version of its shape (`SNAPSHOT_VERSION` in the project store); one
kept by an earlier studio, in the browser, the account's mirror or a
share link, is brought up to the current shape as it is read, step by
step, so nothing kept is ever stale. `BETTER_AUTH_SECRET` signs the
sessions in production (a development run uses the library's own and
says so).

Deploying to furnish-es.com (`docs/DEPLOY.md` has the steps and the
checks): the site's name, address and contact come from
`apps/web/src/lib/site.ts` (furnish-es.com's unless the public variables
in `apps/web/.env.example` say otherwise), which the titles, the sitemap,
the auth's trusted origins, the landing, the inner pages and the gear's
Feedback all read. `GET /api/health` says which backends are up (the
database and its migrations, mail, the model, pictures, payments and
its webhook, Google, the operations area and the nightly sweep) and
what a hosted deployment is still missing,
never a secret, and lists the shares in force; `.github/workflows/ci.yml`
runs the format, lint, types, unit tests, build and the end-to-end
suite on every push, and `pnpm smoke <https://site>` runs the checks
after a deploy against the live site. The studio's own operations are at
`/ops` for the accounts named in `ADMIN_EMAILS` (404 to anyone else):
orders moved on (paid another way, delivered, cancelled, refunded) with
a note each, words to the studio answered by mail and marked, the
waitlist as a CSV and its one opening note sent once, and the day's and
the month's spend against the caps. The studio writes to buyers and
senders on its own (an order placed, paid, delivered, refunded; thanks
for a word; the waitlist's note), to the account's email or the one a
guest gives at checkout; `GET /api/cron/retention`, run nightly by the
host with `CRON_SECRET`, sweeps rate-limit windows older than a day and
cost rows older than ninety days and nothing else. A caller's shares (Eva's turns and reviews, room
items, waitlist and help requests) and a document's weight have their
defaults in `apps/web/src/lib/limits.ts` and can each be set in the
environment. On Vercel, import the repository with `apps/web` as
the root directory (the build command and output are Next's own), add
the domain, and set the variables a hosted site cannot run without:
`DATABASE_URL` from a Neon project (a hosted run without one refuses to
start rather than lose accounts on a wiped disk), `BETTER_AUTH_SECRET`
from `openssl rand -base64 32`, `BETTER_AUTH_URL=https://furnish-es.com`,
`ADMIN_EMAILS` and `CRON_SECRET`; then whichever provider keys
you want on (`ANTHROPIC_API_KEY`, `FAL_KEY`, `STRIPE_SECRET_KEY` with
`STRIPE_WEBHOOK_SECRET` from a webhook endpoint at
`/api/webhooks/stripe` listening to the checkout session, payment
intent and charge events); the migrations run on the first request. Every response carries
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
HSTS; `/robots.txt` keeps crawlers out of the API and `/sitemap.xml`
lists the pages. A page that fails says so in the home page's design,
with Try again and a way into the studio. The providers are bounded:
each caller gets so many turns and items an hour, counted in the
database so a fleet of servers counts as one, and what each call cost
goes into a cost log with a day's share per caller and for the site
(the rates and the shares are set in the environment; see
`apps/web/.env.example`); a message that tries to talk the model out of its rules
is refused and the studio's own rules answer it, and what the model
says is read without any line that plays a role. The gear's Feedback
writes to the studio's own table (`/api/help`, with the page and
project it came from), `/api/waitlist` keeps an email once, and the
gear's Account offers everything the account holds as one file
(`/api/account/export`). What needs a key that is not set still says so rather than pretend:
without `RESEND_API_KEY` no mail leaves a hosted run, and without
`STRIPE_SECRET_KEY` an order waits at awaiting payment.

The room is a full-screen stage behind three panels. The project rail
has Assets (an outliner with hide and remove), Products (the catalogue),
Room (HDB presets, walls drawn on the plan or a template) and Detail (a
piece's parts, place and turn in degrees, lock, hide, remove, colour,
texture and size). A piece turns a quarter with a click on its handle or
the R key, and freely with a drag round it, in steps of 15 degrees
unless Shift is held; Square brings it back to the walls. On the slant
a clash is read from the turned outline, not the box round it. The
main column has a toolbar (the four stages of the work, Room, Layout,
Furnish and Review, each opening its panel tab and the last rendering
the room; Select, which drags and turns pieces on the plan and in 3D,
Inspect, Add, an eye that hides every panel, Undo/Redo, Guide, Export
as SVG/PNG/JSON) and a shelf with Saved and Cart: the pieces as cards
each saying where it stands (placed, with Eva, decided, ordered),
a tile that opens the catalogue, and how ready the room is to order
(the share of its pieces in the cart, the cart against the budget when
one is kept). Checkout takes a delivery address and
places an order in a ledger (awaiting payment, paid, delivered,
cancelled, refunded) listed under the gear. The order is kept on the
server too (`/api/checkout` prices its lines again from the catalogue,
so what is charged is what the studio showed, and keeps it under the
account when signed in and under a random key either way); with
`STRIPE_SECRET_KEY` set a hosted Stripe payment page is opened and
offered, and `/api/webhooks/stripe`, checking Stripe's signature and
keeping each event's id so a replay does nothing twice, moves the order
to paid, cancelled when the page lapsed, or refunded; the studio reads
the order back on the way home (`/api/orders/[id]`) and says so. Without
a key the order waits as awaiting payment and the route says so rather
than pretend. The right rail shows the
other view small over Eva's Agent, History and Preference tabs.

A project is a flat of rooms on one sheet. The Room tab's Rooms row adds
another room (the flat's next kind, stood a wall's thickness from the
active room on its first free side), picks the active one or removes it
with what stood in it; a click on another room's floor, or on a piece in
it, makes it active. The plan draws every room, the active one with its
dimensions and handles, the others faint with their names; the 3D view
and the panel's small isometric view frame the whole flat. A piece added
or dropped goes into the active room; the panels, the health check and
Eva read the active room, and the outliner says which room a piece
stands in when it is not the active one. With the Wall tool a room's
floor drags the room about the sheet, and the magnet stands it against a
neighbour a wall's thickness apart, ends in line. Where two rooms stand
wall to wall a doorway joins them: a door swinging into the private room
(a bedroom or the study; it stands in for the preset door that room came
with) or an open passage between the others. Both rooms read the doorway
(the plan draws the leaf on its side and a gap on the other, the 3D view
builds the shared wall once with the way through, the walk crosses it);
each room's Openings names it by the room beyond, sizes it like any
opening, closes it to a solid wall and opens it again.

Each room is its outline, not the box round it: a template (square,
rectangle, long, L, mirrored L, alcove, T, U, or a shape tapped out of
squares) or drawn walls, and either kind is reshaped on the plan with
the Wall tool: a bar on each wall pushes it in or out (the walls either
side follow, and a wall that ran straight on gets a step), a square on
each corner moves it, a double-click splits a wall in two, and the bar
reads the wall's length; what stands in the room keeps to the walls that
stayed. The Room tab's four sections are Start (how the room begins, the
flat and room, the size in millimetres), Openings, Rules and Finish. The
health rules, the four layouts, the 3D floor and walls and the walk all
keep to the outline. The openings are a list on the walls: hinged,
sliding and double doors, open passages and windows, each on the longest
real edge of its side, added from the + strip (a tile dropped on the
plan goes into the nearest wall where it lands) or the Room tab, sized
by name (Narrow to Sliding, Small to Full wall) or in millimetres, and
moved on the plan with the Wall tool, which drags an opening along its
wall and pulls either end. The 2D plan is a CAD sheet with
four interior elevations and the planner's zones, zoomed with the wheel or the keys about the pointer,
panned by dragging the sheet, fitted again in one click, and measured
with the Measure tool (two clicks, the distance in millimetres, the run
and rise on a slant). On the plan each piece is drawn as its symbol, as
a drawing has it (a sofa with its back, arms and cushions, storage in
its bays, a table on its legs, a lamp as a circle with a cross, a plant,
a rug laid under the rest), turned with the piece, its name written
where it fits. The 3D room is three.js: the floor in its finish painted
on a canvas, skirting, each window with its frame and glass, each door
as its kind (a hinged leaf, two leaves, sliding panels, or a bare
passage), a ceiling once you walk in, and light from soft panels baked into the
surroundings; the furniture is built from what each piece is (18 mm
panel carcasses on a plinth for Furnishes pieces, with doors and
handles, books on a bookwall, hooks on an organiser; a sofa with its
cushions and legs in cloth, a table on turned legs, a lamp with a lit
shade, a plant in its pot, a vase on a lathe), with wood grain painted
on when that finish is chosen. A move in either view is the move in the
other. A piece may stand anywhere, past the walls too; with the magnet
on (Settings), a side within 150 mm of a wall or of another piece goes
flush to it, inside or out, and the room's rules say when a piece
stands past a wall. Clashes are outlined; a view cube turned as the camera is glides it to
a named angle from a face and turns it to any angle by a drag; there is a
walk mode, a tour (stops set on the plan, numbered and joined; Play
walks the camera through them at a slow pace with its eye on the
pieces, a progress bar and Stop; a round of the room clear of the
pieces when there are no stops),
and View settings (edges on every piece, the names, a floor
grid, shadows, daylight or evening light), kept with the view. Review
renders whichever view is up, the 3D room (its shadows on, its handles
away) or the plan, sweeps it in and, with the panels hidden, offers a
before/after divider. The studio opens in 3D on each visit and keeps
the view and angle for the tab. A piece can stand past the walls; a
move never shifts another piece, nor does a piece coming in (it takes
the first clear spot, or the nearest inside the walls), and two pieces
standing over each other read in the warning red on the plan and in
3D, and are listed in one card at the top left of the stage, each with
a pick and a Fix, which shows only while something overlaps. A Furnishes
piece's card, tile and product page carry its portrait, cut out on
nothing (a room item's carry its plan mark). The catalogue itself is real: the thirteen Furnishes
recipes from the house site's storefront live in `packages/domain`
(each a body of 18 mm birch panels on the 600 × 400 × 400 unit, with
its tiers, bays, rooms, what it lets you do, its add-ons and its status
tier), with the parts each is built from, the steps to build it, the
boxes it comes in and its price, an estimate counted from those parts
by one table of rates in Singapore dollars, so no price is typed in and
none can drift. A piece in the room is the size its recipe draws it and
is built in 3D as its recipe has it. The Detail tab is its product page:
what it is and what to check in the room, what comes in the box (every
part counted, every box weighed), how it is built (the steps, the
minutes, the bolts), where the price comes from line by line, and the
pieces worth a look beside it, each a press from the room. The five
parts the + strip sells on their own are priced from the same rates. In 3D no names show until View
settings asks for them; the piece under the pointer shows its own, with
an outline and a hand (or a finger, when it can only be picked). The
small plan in the view panel is the plan itself: a piece is picked and
dragged there too, and the 3D room follows.

Add also makes room items: things that set the scene and are not for
sale (an armchair, a plant, a pendant) from a few words. With `FAL_KEY`
set, `/api/generate-item` has Flux draw a product shot and Hunyuan 3D
turn it into a mesh that stands in the room; without a key a stock mesh
of the thing stands in when there is one (fifteen CC0 Poly Haven models
under `public/props`: a sofa, an armchair, a chair, a stool, a coffee
table, a cabinet, a lamp, a plant, a planter, a vase, a basket, books,
pillows, a box, a laptop), and otherwise the item
stands as a shape and the strip says so. Generations are kept in the
browser, can be starred, and a tile puts another into the room.

Eva speaks through Claude when `ANTHROPIC_API_KEY` is set (`/api/chat`,
with the chatbot's rules and a fixed answer shape); without a key her rule
brain answers from the room's facts and the catalogue. Either way she
keeps to the order of the work (the room's walls first, then
preferences, pieces, refining, ordering), asks for the room's size
before a layout and a budget before a list, proposes the preferences she
hears or that a quiz works out (style, budget, colours, needs) for you to
keep or set aside, and a room she hears is a proposal to change the
active room (the room itself is the Room tab's, never a preference),
picks catalogue pieces with why each fits, and reads the room plan,
folded under one line that says the most urgent of it: what is still to
decide, the room's health (walkways, the door's swing, the window,
clashes) each finding with a Fix, four layouts to inspect and apply,
and where the budget should go once one is kept. Her tab opens with
what she has read in one line and the prompts to start from, the room's
own first. Eva comes four ways, as the chatbot had her (balanced, Style, Plan,
Budget), chosen from the one chip in the box and kept with the project;
each says what she leads with, and the choice steers what the box asks
for (Style picks pieces, Plan lays the room out, the others let the
words decide; a greeting stays a greeting); the model gets her lean,
the rules end a plain answer in it. A long
answer offers itself shorter as a chip, more options and cheaper are
chips under her picks, any answer can be pinned to the project,
Brainstorm for me brings three directions to go with, Review my
preferences has her say what she keeps to and offer a chip for each
block still open, follow-up chips are read from what she said, and
Stop cuts an answer off. History starts empty and holds only
conversations that were had. The Room tab's Rules set what the planner holds to: the walkway's
width, whether the door's swing and the window are kept clear, a bed
against a wall (preferred, required or off), what the room must have
(a missing thing gets an Add), how far apart a layout spreads the
pieces, and two priorities, storage or flow and cosy or open; five
presets (Open plan, Snug storage, Family flow, Reading nook,
Live-work) set the whole lot for a way of living in the room, and
Typical brings the room's own back. Under the room's health, Layouts
lays the room out four ways (rows across the width, rows down the
depth, along the walls with the middle open, and by the book of the
room's archetype), costs each against the
rules with the priorities leaning on the walkways, the door and the
window, marks Eva's pick (the lowest cost; when costs tie, the layout
that moves the least) and applies one in a single undo step; locked
pieces stay put. Inspect under a layout says why it stands where it
does, what it would leave for the planner, and which pieces it would
move, how far, and turn. Keyboard
shortcuts are listed under the gear.
