# furnishes-playground

Furnishes studio: a design-to-buy studio for Singapore HDB flats selling
modular 18 mm panel furniture. This repository is the clean rebuild; the
archived standalone playground, the prod chatbot and the house site are its
donors.

## Workspace

```
apps/web          Next.js 16 app (React 19.3 + React Compiler, Tailwind 4, R3F)
packages/domain   product model (Project → Room → Scheme → Instance → Component)
packages/scene    one world frame, coordinate adapters, geometry vocabulary
```

pnpm 10 workspace. Any Node 24 (24.21 recommended, see `.nvmrc`). TypeScript 6.
Use pnpm, not npm: `npm install` will refuse the workspace.

## Run

```sh
nvm use                 # Node 24.21.0
corepack enable         # or: npm i -g pnpm@10
pnpm install            # again after every pull: the dependencies move
cp .env.example .env    # fill in keys as features land
pnpm dev                # http://localhost:3000
```

A "Module not found" at start, naming a package under `node_modules/.pnpm`,
means the install is older than the checkout: run `pnpm install`.

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm build`.

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

A working studio on placeholder data. The site opens on the home page
(`/`): the way in, in the production account page's design, a rail
beside a cream stage set in Archivo and Space Mono, with Sign in or
Create account and a quiet link to look around without one. Whoever is
signed in, or has just signed in, goes straight on into the studio.
`/rounded` is the studio with floating panels and `/studio` the
square-cornered one; Settings switches between them, and the old
`/account` address goes to the home page. Projects
(new, rename, delete, switch) each hold a room, its pieces and Eva's
side, autosaved in the browser.

Accounts are Better Auth over Drizzle: an email and a password from the
gear's Sign in, the name and email in the user bar, Account and Sign
out beside them. The browser stays the truth and the account mirrors
it: signed in, the projects (and which were deleted), the orders, the
room items made and the guide's record are pulled once, merged with
what is here (a project goes to the newer copy and stays gone where
either side deleted it later; an order keeps the state that moved on
from awaiting payment) and pushed back, then every change is pushed a
moment later; the view and the wheel stay the device's own. The gear's
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
the server first touches the database, and `pnpm db:generate` writes a
new one from a change to the schema. `BETTER_AUTH_SECRET` signs the
sessions in production (a development run uses the library's own and
says so).

Deploying to furnish-es.com: the site's name, address and contact are
in `apps/web/src/lib/site.ts`, which the titles, the sitemap, the
auth's trusted origins, the privacy page (`/privacy`) and the gear's
Feedback all read. On Vercel, import the repository with `apps/web` as
the root directory (the build command and output are Next's own), add
the domain, and set four variables: `DATABASE_URL` from a Neon project
(a hosted run without one refuses to start rather than lose accounts
on a wiped disk), `BETTER_AUTH_SECRET` from `openssl rand -base64 32`,
`BETTER_AUTH_URL=https://furnish-es.com`, and whichever provider keys
you want on (`ANTHROPIC_API_KEY`, `FAL_KEY`, `STRIPE_SECRET_KEY`); the
migrations run on the first request. Every response carries
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
HSTS; `/robots.txt` keeps crawlers out of the API and `/sitemap.xml`
lists the pages. A page that fails says so in the home page's design,
with Try again and a way into the studio. Not built, as each needs a mail sender or a payment provider
that is not connected: forgotten-password mail, email verification, and
payment itself (an order waits at awaiting payment).

The room is a full-screen stage behind three panels. The project rail
has Assets (an outliner with hide and remove), Products (the catalogue),
Room (HDB presets, walls drawn on the plan or a template) and Detail (a
piece's parts, place and turn in degrees, lock, hide, remove, colour,
texture and size). A piece turns a quarter with a click on its handle or
the R key, and freely with a drag round it, in steps of 15 degrees
unless Shift is held; Square brings it back to the walls. On the slant
a clash is read from the turned outline, not the box round it. The main column has a toolbar (Edit/Render, Select, which drags
and turns pieces on the plan and in 3D, Inspect, Add, an eye that hides
every panel, Undo/Redo, Eva's preferences, Guide, Export as SVG/PNG/JSON)
and a shelf with Saved and Cart. Checkout takes a delivery address and
places an order in a ledger (awaiting payment, paid, delivered,
cancelled, refunded) listed under the gear; no payment provider is wired,
and `/api/checkout` says so rather than pretend. The right rail shows the
other view small over Eva's Agent, History and Preference tabs.

The room is its outline, not the box round it: a template (square,
rectangle, long, L, mirrored L, alcove, T, U, or a shape tapped out of
squares) or drawn walls; the health rules, the three layouts, the 3D
floor and walls and the walk all keep to it. The openings are a list on
the walls: hinged, sliding and double doors, open passages and windows,
each on the longest real edge of its side, added from the + strip (a
tile dropped on the plan goes into the nearest wall where it lands) or
the Room tab, sized by name (Narrow to Sliding, Small to Full wall) or
in millimetres, and moved on the plan with the Wall tool, which drags an
opening along its wall and pulls either end. The 2D plan is a CAD sheet with
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
stands past a wall. Clashes are outlined, a view cube glides the camera, and there is a
walk mode, a tour (stops set on the plan, numbered and joined; Play
walks the camera through them at a slow pace with its eye on the
pieces, a progress bar and Stop; a round of the room clear of the
pieces when there are no stops),
and View settings (edges on every piece, the names, a floor
grid, shadows, daylight or evening light), kept with the view. Render
grades whichever view is up, the 3D room (its shadows on, its handles
away) or the plan, sweeps it in and, with the panels hidden, offers a
before/after divider. The studio opens in 3D on each visit and keeps
the view and angle for the tab. A piece can stand past the walls; a
move never shifts another piece, nor does a piece coming in (it takes
the first clear spot, or the nearest inside the walls), and two pieces
standing over each other read in the warning red on the plan and in
3D, and are listed in one card at the top left of the stage, each with
a pick and a Fix, which shows only while something overlaps. Until the
catalogue has photographs, a product card and a shelf card carry the
piece's plan mark. In 3D no names show until View
settings asks for them; the piece under the pointer shows its own, with
an outline and a hand (or a finger, when it can only be picked). The
small plan in the view panel is the plan itself: a piece is picked and
dragged there too, and the 3D room follows.

Add also makes room items: things that set the scene and are not for
sale (an armchair, a plant, a pendant) from a few words. With `FAL_KEY`
set, `/api/generate-item` has Flux draw a product shot and Hunyuan 3D
turn it into a mesh that stands in the room; without a key the item
stands as a shape and the strip says so. Generations are kept in the
browser, can be starred, and a tile puts another into the room.

Eva speaks through Claude when `ANTHROPIC_API_KEY` is set (`/api/chat`,
with the chatbot's rules and a fixed answer shape); without a key her rule
brain answers from the room's facts and the catalogue. Either way she
keeps to the order of the work (room, preferences, pieces, refine,
order), asks for the room's size before a layout and a budget before a
list, proposes the preferences she hears or that a quiz works out (style,
budget, room) for you to keep or set aside, picks catalogue pieces with
why each fits, and reads the room plan's readiness, budget and health
(walkways, the door's swing, the window, clashes), each finding with a
Fix. Eva comes four ways, as the chatbot had her (balanced, Style, Plan,
Budget), chosen from the chip in the box and kept with the project; the
model gets her lean, the rules end a plain answer in it. Her latest
answer can be refined (shorter, more options, cheaper), any answer
pinned to the project, Brainstorm for me brings three directions to go
with, follow-up chips are read from what she said, a kept preference
can be sent back for review and an open one asked about, and Stop cuts
an answer off. The Room tab's Rules set what the planner holds to: the walkway's
width, whether the door's swing and the window are kept clear, a bed
against a wall (preferred, required or off), what the room must have
(a missing thing gets an Add), how far apart a layout spreads the
pieces, and two priorities, storage or flow and cosy or open; five
presets (Open plan, Snug storage, Family flow, Reading nook,
Live-work) set the whole lot for a way of living in the room, and
Typical brings the room's own back. Under the room's health, Layouts
lays the room out three ways (rows across the width, rows down the
depth, along the walls with the middle open), costs each against the
rules with the priorities leaning on the walkways, the door and the
window, marks Eva's pick (the lowest cost; when costs tie, the layout
that moves the least) and applies one in a single undo step; locked
pieces stay put. Inspect under a layout says why it stands where it
does, what it would leave for the planner, and which pieces it would
move, how far, and turn. Keyboard
shortcuts are listed under the gear.
