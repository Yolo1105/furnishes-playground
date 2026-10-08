# The realistic viewer and the modelling layer: the plan, read from the references

Written 7 October 2026 against the live sources: the reference
repositories were cloned and read, the libraries' type definitions and
changelogs fetched, and the open issues checked that day. Where the
earlier plan (2 October) guessed a name or a behaviour, this one says
what the code actually has. `docs/research/` holds the wider survey;
this file is the decision.

## Where the studio stands

The studio renders with three.js r186's classic `WebGLRenderer` through
React Three Fiber 9.8.1 and drei 10.7.9: physically based materials
(roughness, sheen on cloth, clearcoat on lacquer) painted from procedural
canvases, one shadow-casting directional light with a 1024 map and an
ambient light, four CC0 HDRIs or a panel rig through drei's
`Environment`, ACES tone mapping at exposure 1.15, Draco-compressed
Poly Haven props, and fal.ai pictures and meshes for generated items.
The room is a polygon the person draws, with openings on its edges;
walls are single planes with no thickness. Nothing is baked, there is
no post-processing, no probe grid, no reflections beyond the HDRI, no
photo output, and no CAD kernel. The catalogue's thirteen pieces are
parametric assemblies of 18 mm panels with a parts list, bolt count,
steps and a price counted from the parts.

## What the references actually are

**0beqz/lightmap_interior_test** (no licence, 2021, three r127, WebGL):
a Blender lightmap (The Lightmapper) loaded as a separate KTX2 and set
as `material.lightMap` at intensity 3.75 with the diffuse darkened to
0.3 grey; zero runtime lights; one box-projected cube map on the floor
through an `onBeforeCompile` GLSL patch (the parallax-correct normal
by codercat); SMAA, bloom and a gamma of 1.275 through
`pmndrs/postprocessing`. The technique carries; the code does not
(WebGL-only, no licence), and in r186 the box projection is a TSL
helper (`getParallaxCorrectNormal`) rather than a shader patch.

**salimkt/3xdezine** (no licence, active, three 0.186.0, R3F 9.7):
`WebGPURenderer` made in R3F's async `gl` factory with
`forceWebGL: !('gpu' in navigator)`, `antialias: false, samples: 0`
(MSAA breaks the post stack's depth copy), `shadows={{ type:
PCFShadowMap }}`; a `RenderPipeline` of GTAO (half-res on balanced),
SSGI only on high, SSR, TRAA and bloom, each stage in a try/catch with
`gl.render` as the fallback; AgX tone mapping at exposure 1.1 and an
HDRI set straight onto `scene.environment` through `HDRLoader` (the
renderer filters it itself); walls as `ExtrudeGeometry` from a `Shape`
with door and window holes, three material groups, thickness never
faked with a plane; no StrictMode. It is the architecture to follow.

**three.js r186 examples** (MIT): the exact calls. GTAO: a pre-pass
with `mrt({ output: packNormalToRGB(normalView), velocity })`, the
normal target as `UnsignedByteType`, `ao(depth, normal, camera)` at
`resolutionScale 0.5` with temporal filtering, fed into the lighting
through `scenePass.contextNode = builtinAOContext(...)`, then
`traa(scenePass, depth, velocity, camera)` as the output node and
`NeutralToneMapping` on the renderer. The probe grid is
`LightProbeGrid` (WebGPU) or `LightProbeGridWebGL` (WebGL), a `Light`
added to the scene, baked with `bake(renderer, scene, { cubemapSize,
near, far, start, count, pass })` a few probes per frame. The box
projection is `material.envNode = pmremTexture(cube,
getParallaxCorrectNormal(reflectVector, size, centre))` on a node
material from a `CubeCamera` rendered once. Renames in force:
`PostProcessing` is `RenderPipeline`, `RGBELoader` is `HDRLoader`,
`PCFSoftShadowMap` is gone from WebGPU, `renderAsync` is deprecated.

**React Three Fiber 9.8.1 and drei 10.7.9**: the async factory is the
documented pattern and the double-creation bug (#3782) is closed as
fixed by 9.8.0's synchronous root configuration; R3F's `shadows` boolean
sets the removed `PCFSoftShadowMap`, so pass an object; R3F passes
`antialias: true` by default, so override it. drei's `Environment` with
`.hdr` files works (an equirect on `scene.environment`); the children
and ground variants, gainmap JPGs, `MeshReflectorMaterial`,
`BakeShadows`, `SoftShadows` and anything on `EffectComposer` are
WebGL-only. drei 11 is alpha and needs fiber 10, which is alpha; neither
is an option.

**three-gpu-pathtracer 0.0.26** (MIT): `WebGPUPathTracer(renderer)`
from `three-gpu-pathtracer/webgpu`; there is no `samples` or `bounces`
property, it is `maxSamples` (must be above 0 or the denoiser never
runs) and `maxBounces`; progress is `getSampleCountsAsync()`. The
denoiser is the library's own `OIDNDenoiser({ initUNetFromURL,
auxWeightsUrl })` with `oidn-web` 0.4.0 (MIT, WebGPU only, weights
served by the app, 1.76 MB). Known in 0.0.26: a black render after
changing bounces once settled and a leak on every reset and dispose
(fixed only on main), a first sample at a 1 by 1 buffer breaking the
kernels (#868, open), `setScene` blocking on big scenes. No example
writes a PNG; the WebGPU drawing buffer survives presentation, so
`canvas.toBlob()` right after `renderSample()` is the read-back.

**three-gpu-baker 1.0.1**: three weeks old, one author, no issues, and
"HDR or cube environment maps: not supported", which rules it out for a
room lit by an HDRI. **The Lightmapper**: no stated Blender 4.x
support, the 4.0 to-do open since 2023; plain Cycles baking (Diffuse,
Direct and Indirect, Color unchecked) is the route if a bake is ever
needed.

**Modelling.** Panelizer (MIT, three r185, R3F): one flat list of
axis-aligned boxes, `Panel { normal: 'x'|'y'|'z', length, width,
thickness, position (centre, mm), materialId, grain }`, drei
`TransformControls` for moves, sphere handles for resizes, and a pure
snapping core (`snapGroupDelta`, `snapResizeFace`, flush, butt, centre
and mid-thickness snaps within 15 mm) plus a MaxRects cut list with
grain, kerf and stock; no rotation beyond the three axes, no templates,
no holes or grooves. cabinetry_designer: eight commits of a 2D wall
canvas, no panels, no three.js despite its README. blueprint3d-modern
(MIT, three r181): a corner graph with half edges offset by half the
wall thickness and mitred at corners, extruded per edge with openings as
`Shape.holes`; thickness and height are global defaults in centimetres
and not saved; doors attach to the nearest edge by distance; not
published as a package. WoodworkingShop (MIT): no three.js, SVG views,
a cut optimiser and parametric machining calculators (35 mm cup, 32 mm
system), a STEP writer of plain cuboids. O-LAP: dead since 2022 on
three r91. replicad 1.1.0 (MIT) on replicad-opencascadejs 1.1.0
(LGPL-2.1-only, a 23 MB wasm, OCCT 8) with a documented comlink worker
pattern, mesh to `BufferGeometry` and STEP out; brepjs 20.1.4
(Apache-2.0) on occt-wasm (LGPL wasm, 21 MB, needs wasm tail calls) with
five patch releases in four days and a kernel roadmap that just went
AGPL. `@salusoft89/planegcs` 1.3.0 is the only 2D constraint solver
(FreeCAD's, LGPL, a 484 KB wasm, JSON primitives, explicit `destroy`).
`manifold-3d` 3.5.4 (Apache-2.0, 541 KB) does mesh booleans.

## The decisions

1. **Move the studio to `WebGPURenderer` with the WebGL2 backend as the
   fallback**, in the 3xdezine shape, keeping fiber 9.8.1 and drei
   10.7.9 and pinning three 0.186.1. The panel rig goes (it is an
   `Environment` with children); the four `.hdr` skies stay. Shadows
   become `{ type: PCFShadowMap }`; `antialias: false, samples: 0`.
   Chromium in CI has no WebGPU, so the suite exercises the WebGL2
   backend; WebGPU is checked by hand and by screenshot baselines.
2. **Colour first, no post yet**: AgX tone mapping with an exposure
   control in View settings, the ambient light removed in favour of the
   environment, every texture's colour space set, and real PBR texture
   sets (ambientCG and Poly Haven, CC0) for the panel finishes, cloth
   and the floors, 1K to start, KTX2 once the asset pipeline exists.
   This is where the "cartoon" look goes.
3. **GTAO and TRAA through `RenderPipeline`**, written against the r186
   example, in a component that takes over the frame loop; every stage
   in a try/catch with `gl.render` behind it; three quality tiers
   (desktop, laptop, phone) chosen from the backend, the device memory
   and the coarse pointer, with phones on SMAA and no AO.
4. **Indirect light without a bake**: a `LightProbeGrid` over the room
   (the WebGL twin on the fallback), baked incrementally once the
   layout settles and again on a change, since the room is drawn by
   the person and a Blender bake per layout cannot be. SSGI only on the
   desktop tier. A Blender lightmap is reserved for the landing's five
   fixed spots, if ever.
5. **Floor reflections** by the box-projected cube map in TSL from one
   `CubeCamera` render after load, localised to the room's box.
6. **Photo mode** as a WebGPU-only button: one `WebGPUPathTracer` kept
   for the renderer's life (never one per shot, because 0.0.26 leaks on
   dispose), bounce settings fixed before the first sample, a guard on
   the drawing buffer size, `maxSamples` 64, 256 or 1024, the OIDN
   denoiser with the app's own weights, R3F's loop paused while the
   tracer presents, `toBlob` as the PNG. No cloud render until the
   browser route has been measured.
7. **Walls with thickness and height** per polygon edge, the inner and
   outer offsets by the half-angle bisector (the blueprint3d-modern
   formula, about sixty lines, rewritten), each wall an
   `ExtrudeGeometry` with its openings as holes and three material
   groups (the 3xdezine builder), the plan's `layoutHash` marking the
   probe grid stale.
8. **A free panel editor** on Panelizer's data model and pure snapping
   core, vendored with its MIT notice into the domain package and
   bridged to the studio's Instance and Component tree; cabinet
   templates are the existing recipes made resizable.
9. **Machining and cut lists** as features in panel-local coordinates
   (holes, grooves, cut-outs), rendered as decals in the studio and
   subtracted with `manifold-3d` only on export; the cut list on
   Panelizer's MaxRects nesting; a DXF R12 writer per panel face.
10. **Free-form parts** last and lazily: `planegcs` for sketch
    constraints and replicad on OpenCascade in a Web Worker, both wasms
    served as separate files for the LGPL, loaded only when a part is
    opened; an 18 mm recipe never loads a kernel. replicad over brepjs
    for its stability and its worker pattern; brepkit's AGPL turn and
    occt-wasm's browser floor decided it.

## Where the work stands

- R0 is in: `apps/web/e2e/visual.spec.ts` keeps five fixed views of
  the room (the panels by day, a sunset, the evening, the front
  elevation, eye level) as pictures and fails on a drift over half a
  percent of the pixels, a pixel counting as changed past a twentieth
  of its colour (Playwright's default fifth let the whole of R3 through
  unseen); a second run of the same build drifts by nothing. The photo
  spike waits for a browser with WebGPU, which the sandbox lacks.
- R1 is in, with one departure: AgX tone mapping with an Exposure
  slider in View settings, the flat ambient term replaced by the
  surroundings plus a sky-against-floor light (3xdezine keeps the same
  low hemisphere light), every texture's colour space set, and a relief
  (normal and roughness maps) read from each painted grain. The CC0
  texture sets could not be fetched from the build sandbox, so the
  panels and floors keep their painted grain with its relief; the
  photographed sets go in when the assets can be brought in.
- R2 is in: the room renders with three's `WebGPURenderer`, made in
  React Three Fiber's async factory, which asks for a WebGPU adapter
  first and otherwise runs the WebGL 2 backend on a context of its own
  with the drawing buffer kept (so Export still reads the canvas);
  shadows are the PCF map the renderer keeps; the light panels are two
  files drawn by `scripts/make-panels.mjs` (the run-time rig only the
  WebGL renderer could draw is gone); the stage says which backend came
  up (`data-backend`). The suite and the five kept pictures run on the
  WebGL 2 backend, since headless Chromium has no adapter; WebGPU is
  checked by hand in a browser that has it.
- R3 is in, with two departures from the r186 example. The scene is
  drawn once a frame into a pass that keeps its depth and motion
  beside the colour; GTAO reads its normals back from that depth (no
  second pass with packed normals, which doubled the shader programs
  and the draw calls), and the occlusion darkens the lit colour in the
  composite rather than entering the lighting through
  `builtinAOContext`, which needs the occlusion before the scene is
  lit. The composite (`apps/web/src/components/studio/Post.tsx`)
  tone-maps the frame and lays it on the page's own backdrop, the
  body's gradient read from the computed style and drawn at the
  canvas's place in the window, because TRAA's history is opaque and
  the pass's own alpha could not be read beside another texture on the
  WebGL backend (the page behind the room used to come through the
  canvas's alpha). TRAA resolves the edges over sixteen settle frames
  after each change (SMAA in one pass on phones, which also skip the
  occlusion); the tier comes from the pointer, the backend and the
  device memory, the stage says which (`data-post`), View settings has
  an Ambient occlusion switch, and a stage that fails on a device
  draws the room plain from then on. drei's `Edges` went with it (its
  `LineMaterial` is not a node material): the outlines are plain edge
  lines. WebGPU is still checked by hand.
- R4 is in, with a departure: the probes see the shell alone. A
  `LightProbeGrid` over the room (`apps/web/src/components/studio/Probes.tsx`,
  probes about 1.5 m apart, each a cubemap of the floor, the walls,
  their openings and the surroundings through the open top) is baked
  over frames, two probes a frame, whenever the shell, its finish or
  its light changes, and again when a surroundings map arrives; the
  pieces are hidden for the bake's renders and the shadow maps are not
  drawn again for each side, so a drag never starts a bake and the seam
  under a piece stays the occlusion's work. The first probe is baked
  before anything is drawn with the grid in the room, since a material
  built while the grid has no texture would never sample it (the
  renderer is also told the grid's light node up front; it otherwise
  learns it at the first bake and warns before). The stage says whether
  a bake is under way (`data-probes`), the pictures and the suite wait
  for it, and phones go without. three's `LightProbeGridWebGL` is for
  the old WebGL renderer, not this renderer's WebGL backend, so one
  class serves both backends. SSGI on the desktop tier waits for a
  browser with WebGPU to check it in.
- R5 is in: the room's floor reflects the room
  (`apps/web/src/components/studio/Reflection.tsx`). One picture of
  the room is taken from its middle into a cube map (the floor out of
  it, the surroundings in through the open top), filtered by the
  floor's roughness through `pmremTexture`, and each reflection is
  projected on the room's box with `getParallaxCorrectNormal`, so a
  window or a piece lands on the floor where it stands. The picture is
  taken again a moment after the room, its pieces, its light or the
  walk's ceiling change, and the stage says when the floor shows the
  last change (`data-reflection`, with `data-probes` now `pending` or
  `ready` the same way); the kept pictures and the suite wait for
  both. The floor's material became a node material for its
  `envNode`; another room's floor, and a phone's, take the surroundings
  as before. Both stills share one helper (`capture.ts`) that hides
  what should not be in them and lets the shadow maps serve from the
  last frame. With it came the first of R7's tiers as a setting: View
  settings' Picture (Auto, Full, Light, Plain) replaces the Ambient
  occlusion switch; Auto follows the device, and a software GPU
  (SwiftShader, llvmpipe: the stage says `data-backend="software"`)
  gets the phone's tier, so a machine without a GPU, the suite's
  Chromium among them, draws the room without the finish, the probes
  or the reflection; the five kept pictures ask for Full.
- R6 is in, unchecked by eye: on a browser with WebGPU, Render traces
  the light through the room with three-gpu-pathtracer's WebGPU tracer
  (`apps/web/src/components/studio/Photo.tsx`) instead of grading the
  view, the line under the toolbar runs by the samples' count, Open
  Image Denoise cleans the result with weights the app serves itself
  (`apps/web/public/oidn`), the before side of the compare is a picture
  of the view as it stood, and Export's PNG reads the photo from the
  canvas. One tracer serves the renderer for its life (0.0.26 leaks on
  dispose, and 0.0.27 has not shipped), the bounces are fixed before
  the first sample, fiber's loop is paused while the tracer presents, a
  drawing buffer too small to trace is refused (#868), and a failure
  falls back to the graded view. The sandbox's Chromium has no WebGPU
  adapter, so the suite covers the graded path only: the photo waits
  for a hand check in Chrome or Safari 26 before the step is called
  done, and the samples per tier (256, 64, 64) are a first guess until
  the minute-at-1080p gate is measured.
- R7 is in, as far as the sandbox lets it be measured. The tiers came
  with R5 (View settings' Picture: Auto, Full, Light, Plain; a software
  GPU gets the phone's). The budgets: the studio's first-load
  JavaScript, as Next counts it, is about 365 KB gzip, under the 450 KB
  gate, because the scene has been a lazy chunk since before this plan;
  the scene's own chunks (three's WebGPU build with TSL, 284 KB, and
  the scene with drei, the loaders and the probes, 244 KB) arrive right
  after, so a studio visit transfers about 893 KB of script in all. The
  frame-rate gates (60 fps desktop, 30 fps phone) cannot be read on a
  software GPU and wait for a hand check with the browser's frame
  timing. The visual-target review changed three things: the evening's
  sun now stands low beyond the north wall, where every template's
  window is, so it comes in through the glass; the walls cast shadows,
  so a low sun comes in through the openings alone; and the evening's
  surroundings and sky fill stand back (the panels at 0.5, the maps at
  0.4, the sky at 0.25), so the sun carries the room and the evening
  reads as one. The day's light, which the three targets agreed on, is
  unchanged.
- M1 is in: the walls have a thickness and a height in both views, the
  same ones. Each room keeps its walls' thickness (`thickness`, mm;
  Room tab, Walls, 100 to 400 mm, an HDB's 300 to start) beside its
  height; the outline is the walls' inner face in both views, and the
  outer face stands a thickness outside it, each corner's outer point
  where the two offset faces meet along the bisector of the normals
  (`outerOutline` in `room-geometry.ts`, the blueprint3d-modern formula
  rewritten and unit-tested on a rectangle, an L and both windings). The
  plan draws the band between the two faces (it used to be a stroke
  centred on the outline, half of it inside the room, which the 3D
  walls on the outline contradicted), with the openings, their grips
  and the wall handles on it. In 3D each wall run is built solid
  (`wall-solid.ts`): its elevation less its openings as stretches, each
  a box from the inner face to the outer, the ends slanted where the
  wall meets the next (longer at a convex corner, shorter at a concave
  one), so a doorway is a way through the thickness and a window shows
  its sill and jambs; the walls cast shadows. The rooms stand their
  walls' thickness apart, the shared walls and the magnet take the
  room's thickness, a piece outside the room leans on its far face, and
  the export carries it. A room saved before takes the default.

## The order of work

| Step | What ships                                                                                                       | Gate                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| R0   | Five camera bookmarks, Playwright screenshot baselines on both backends, the Photo spike in Chrome and Safari 26 | baselines rerun within 0.5%                                                            |
| R1   | AgX, exposure, no ambient, colour spaces, PBR texture sets on panels, cloth and floors                           | white walls read off-white; no flat colour blocks                                      |
| R2   | `WebGPURenderer` with fallback, PCF shadows, the panel rig replaced                                              | the suite green on the WebGL2 backend; WebGPU by hand                                  |
| R3   | GTAO and TRAA, the three tiers                                                                                   | post under 6 ms at 1440p on a desktop GPU                                              |
| R4   | Probe grid, incremental and on change; SSGI on desktop                                                           | furniture bases darken; no leaks across walls                                          |
| R5   | Box-projected floor reflections                                                                                  | a window reflects in the right place on the floor                                      |
| R6   | Photo mode                                                                                                       | 1080p at 256 samples in under a minute on a desktop GPU; ten shots with no VRAM growth |
| R7   | Tiers, budgets, the visual-target review                                                                         | 60 fps desktop, 30 fps phone; first-load JS under 450 KB gzip                          |
| M1   | Wall thickness and height, extruded walls with holes                                                             | 2D and 3D never disagree; openings follow a moved wall                                 |
| M2   | Free panels with snapping and typed millimetres                                                                  | a 600 mm base cabinet with two shelves in under two minutes                            |
| M3   | Machining features, cut list, DXF                                                                                | a 20-panel cabinet recomputes under 200 ms                                             |
| M4   | Sketch constraints and free-form parts in a worker, STEP out                                                     | a constrained sketch solves under 50 ms; the main thread never blocks over 16 ms       |

The earlier plan's own estimate was 55 to 85 developer-days for
rendering and 47 to 74 for modelling. With the studio's base already in
place the rendering steps R0 to R5 are about 25 to 35 days, R6 and R7
about 15, and M1 to M4 about 40 to 60; the WebGPU switch (R2) and the
probe grid (R4) are where the risk is, and R6 depends on
three-gpu-pathtracer shipping 0.0.27 with the leak fixes.

## What was dropped from the earlier plan, and why

- The Blender lightmap bake of the shell (its Phase 6), because the
  room is the person's drawing and changes under their hand; the probe
  grid and SSGI take its place, and the bake is kept for fixed scenes.
- three-gpu-baker, because it cannot light from an HDRI.
- drei v11, because it needs fiber 10 and both are alpha.
- A cloud Cycles render, until the browser route is measured.
- cabinetry_designer, WoodworkingShop and O-LAP as code references:
  the first has no panels, the second no three.js, the third is dead.
- brepjs, for the reasons above; it stays a watch item.
