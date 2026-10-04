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

UI shell with placeholder data, no AI yet. `/` is the square-cornered
studio and `/rounded` the floating one; Settings switches between them.
The room is a full-screen stage behind three panels: a project rail with
Assets (an outliner), Products (the catalogue), Room (HDB presets, walls
drawn on the plan or a template) and Detail (a piece's parts, colour,
texture and size); the main column with a toolbar (Edit/Preview, Select,
Inspect, Add, an eye that hides every panel, Undo/Redo over the room's
contents, Eva's preferences, Guide, Export as SVG/PNG/JSON) and a shelf
with Saved and Cart (Checkout reads the order back and downloads it as
CSV); a right rail with the other view (2D or 3D) over Eva's Agent,
History and Preference tabs. The 2D plan is drawn as a CAD sheet, the 3D
view is a three.js stand-in with a view cube; Preview runs a stand-in
render with a before/after divider. Keyboard shortcuts are listed under
the gear. The last view and the guide dismissals live in the browser.
