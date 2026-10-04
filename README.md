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
pnpm install
cp .env.example .env    # fill in keys as features land
pnpm dev                # http://localhost:3000
```

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
touch suite on Chromium emulating an iPad and an iPhone. With
`PW_ENGINES=1` and `npx playwright install webkit firefox` the desktop
suite also runs on WebKit and Firefox; those two engines cannot be
downloaded in the cloud container, so they run on a machine of your
own.

## Status

A working studio on placeholder data. `/` is the square-cornered studio
and `/rounded` the floating one; Settings switches between them. Projects
(new, rename, delete, switch) each hold a room, its pieces and Eva's
side, autosaved in the browser.

Accounts are Better Auth over Drizzle: an email and a password from the
gear's Sign in, the name and email in the user bar, Sign out beside
them. The database is Neon Postgres when `DATABASE_URL` is set and
PGlite otherwise, a Postgres inside the server process that keeps its
files under `apps/web/.data/pglite`, so a checkout runs and tests with
no account anywhere; the migrations under `apps/web/drizzle` run when
the server first touches the database, and `pnpm db:generate` writes a
new one from a change to the schema. `BETTER_AUTH_SECRET` signs the
sessions in production (a development run uses the library's own and
says so).

The room is a full-screen stage behind three panels. The project rail
has Assets (an outliner with hide and remove), Products (the catalogue),
Room (HDB presets, walls drawn on the plan or a template) and Detail (a
piece's parts, place and turn in degrees, lock, hide, remove, colour,
texture and size). A piece turns a quarter with a click on its handle or
the R key, and freely with a drag round it, in steps of 15 degrees
unless Shift is held; Square brings it back to the walls. On the slant
a clash is read from the turned outline, not the box round it. The main column has a toolbar (Edit/Preview, Select, which drags
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
floor and walls and the walk all keep to it, and a door or window sits
on the longest real edge of its side. The 2D plan is a CAD sheet with
four interior elevations and the planner's zones, zoomed with the wheel or the keys about the pointer,
panned by dragging the sheet, fitted again in one click, and measured
with the Measure tool (two clicks, the distance in millimetres, the run
and rise on a slant); the 3D room is three.js with furniture built from what
each piece is (18 mm panel carcasses for Furnishes pieces), dragging with
wall snap and clash outlines, a view cube that glides the camera, and a
walk mode, a tour (stops set on the plan, numbered and joined; Play
walks the camera through them at a slow pace with its eye on the
pieces, a progress bar and Stop; a round of the room clear of the
pieces when there are no stops),
and View settings (edges on every piece, the names, a floor
grid, shadows, daylight or evening light), kept with the view. Preview
runs a stand-in render with a before/after divider.

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
(a missing thing gets an Add), and how far apart a layout spreads the
pieces. Under the room's health, Layouts lays the room out three ways
(rows across the width, rows down the depth, along the walls with the
middle open), reads each against the same rules, marks Eva's pick and
applies one in a single undo step; locked pieces stay put. Keyboard
shortcuts are listed under the gear.
