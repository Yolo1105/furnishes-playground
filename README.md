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

## Status

A working studio on placeholder data. `/` is the square-cornered studio
and `/rounded` the floating one; Settings switches between them. Projects
(new, rename, delete, switch) each hold a room, its pieces and Eva's
side, autosaved in the browser.

The room is a full-screen stage behind three panels. The project rail
has Assets (an outliner with hide and remove), Products (the catalogue),
Room (HDB presets, walls drawn on the plan or a template) and Detail (a
piece's parts, place and turn, lock, hide, remove, colour, texture and
size). The main column has a toolbar (Edit/Preview, Select, which drags
and turns pieces on the plan and in 3D, Inspect, Add, an eye that hides
every panel, Undo/Redo, Eva's preferences, Guide, Export as SVG/PNG/JSON)
and a shelf with Saved and Cart. Checkout takes a delivery address and
places an order in a ledger (awaiting payment, paid, delivered,
cancelled, refunded) listed under the gear; no payment provider is wired,
and `/api/checkout` says so rather than pretend. The right rail shows the
other view small over Eva's Agent, History and Preference tabs.

The 2D plan is a CAD sheet with four interior elevations and the
planner's zones; the 3D room is three.js with furniture built from what
each piece is (18 mm panel carcasses for Furnishes pieces), dragging with
wall snap and clash outlines, a view cube that glides the camera, and a
walk mode. Preview runs a stand-in render with a before/after divider.

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
Fix. The Room tab's Rules set what the planner holds to: the walkway's
width, whether the door's swing and the window are kept clear, a bed
against a wall (preferred, required or off), what the room must have
(a missing thing gets an Add), and how far apart a layout spreads the
pieces. Under the room's health, Layouts lays the room out three ways
(rows across the width, rows down the depth, along the walls with the
middle open), reads each against the same rules, marks Eva's pick and
applies one in a single undo step; locked pieces stay put. Keyboard
shortcuts are listed under the gear.
