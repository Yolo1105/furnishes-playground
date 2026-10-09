# Code the studio serves as files of its own

Three WebAssembly kernels are loaded by the studio's part worker
(`src/components/studio/part.worker.ts`), the first time a panel is
given a shape and never before, each as the unmodified file its npm
package ships, served separately from the studio's own code (Next
emits them under `/_next/static/media/`), so that either can be
replaced by another build as their licences provide:

- `@salusoft89/planegcs` (FreeCAD's planegcs constraint solver,
  LGPL-2.0-or-later; https://github.com/Salusoft89/planegcs):
  `planegcs.wasm`.
- `replicad-opencascadejs` (Open CASCADE Technology built for
  replicad, LGPL-2.1-only; https://github.com/sgenoud/replicad):
  `replicad_single.wasm`. `replicad` itself is MIT.

- `manifold-3d` (the Manifold geometry library, Apache-2.0;
  https://github.com/elalish/manifold), pinned at 3.5.4: `manifold.wasm`,
  loaded the first time a panel's machining is cut for real
  (`src/components/studio/cut-solid.ts`); nothing of it was changed.

Their licence texts are in the packages under `node_modules`.
