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
- `pnpm e2e` on a machine with its own Chromium: set
  `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium`.

## Status

UI shell with placeholder data and a rule-based Eva, no model yet. `/` is
the square-cornered studio and `/rounded` the floating one; Settings
switches between them. Projects (new, rename, delete, switch) each hold
a room, its pieces and Eva's side, autosaved in the browser.

The room is a full-screen stage behind three panels. The project rail
has Assets (an outliner with hide and remove), Products (the catalogue),
Room (HDB presets, walls drawn on the plan or a template) and Detail (a
piece's parts, place and turn, lock, hide, remove, colour, texture and
size). The main column has a toolbar (Edit/Preview, Select, which also
drags and turns pieces, Inspect, Add, an eye that hides every panel,
Undo/Redo, Eva's preferences, Guide, Export as SVG/PNG/JSON) and a shelf
with Saved and Cart (Checkout reads the order back and downloads it as
CSV). The right rail shows the other view small, the plan or an isometric
room, over Eva's Agent, History and Preference tabs.

The 2D plan is drawn as a CAD sheet with four interior elevations; the 3D
view is a three.js stand-in with a view cube; Preview runs a stand-in
render with a before/after divider. Eva follows the chatbot's order of
work (room, preferences, pieces, refine, order), asks for the room's size
before a layout and a budget before a list, proposes the preferences she
hears for you to keep or set aside, picks catalogue pieces with why each
fits, and reads the room plan's readiness, budget and clashes. Keyboard
shortcuts are listed under the gear.
