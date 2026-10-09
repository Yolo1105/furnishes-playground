@AGENTS.md

# Gap-closing rules

- Versions are pinned: three 0.186.1, @react-three/fiber 9.8.1, drei 10.7.9, three-gpu-pathtracer 0.0.26, replicad 1.1.0, @salusoft89/planegcs 1.3.0. Do not upgrade or add a dependency unless the prompt says so.
- Read docs/plan-realism.md first; it records why each earlier choice was made. Do not undo a recorded decision (e.g. the probe grid instead of a Blender bake) without saying so and why.
- Before writing TSL or path-tracer code, read the matching file in node_modules (three/examples/jsm/..., three-gpu-pathtracer's .d.ts) and quote the signatures you will use.
- Every user-visible state gets a data-\* attribute on .stage-3d so tests can wait on it.
- Every new third-party file gets a line in the nearest LICENSES.md (source, licence, what was changed).
- Finish every task with: pnpm lint, pnpm typecheck, pnpm test, and the visual project (npx playwright test --project=visual). If a picture changes on purpose, say which and why before running --update-snapshots.
- End with a short report: what changed (files), what was verified and how, what could not be verified in this sandbox (e.g. anything needing a real WebGPU GPU), and the numbers each gate asked for.
