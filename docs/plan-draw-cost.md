# What a furnished flat costs to open and draw

The four-room flat opens furnished, and on the sandbox's software
renderer (SwiftShader behind WebGL2, the "phone" post tier) the page
stood still for long stretches of its first minute. This plan says what
was measured, what was changed and why, what was left and why, and how
to take the same numbers on a real phone or GPU.

## What was measured

All numbers are from `/rounded` at 1440×900 in the sandbox, the flat as
it opens, after the merged books (commit 9634885):

| what                                 | before | after this plan |
| ------------------------------------ | -----: | --------------: |
| meshes shown                         |    387 |             254 |
| joint-line sets (one draw each)      |    141 |              50 |
| shadow casters                       |    331 |             198 |
| triangles                            |   254k |            150k |
| shader programs built                |     25 |              22 |
| main thread held, first 60 s         |   29 s |          21.5 s |
| longest single freeze                |    8 s |           8.6 s |

Batching and the lighter models alone left the main thread held 28.4 s;
the one-shader-a-finish change took it to 21.5 s. The longest freeze is
the first frame's shaders, built together, and did not move.

Two findings shaped the work:

- **Where the draws went.** A built piece (a carcass, a bench, a cart,
  the kitchen counter) was drawn a mesh per board plus a joint-line set
  per board, and each mesh again for each shadow light: the bookwall
  alone was 21 meshes and 13 line sets. Three quarters of the triangles
  were in a handful of stock models: four dining chairs at 22k each, two
  wicker baskets at 22k, three plants at 9k, two stools at 8k.
- **What held the page.** A CPU profile of the first 40 s put 17 s in
  `createRenderPipeline` → `_completeCompile`, most of it in
  `_setupBindings`, which waits for the program to link. The page is
  held by building shaders (0.4–0.7 s a program in the software
  renderer), not by drawing. Fewer draws make every frame cheaper, but
  the long freezes only shrink with fewer programs or by building them
  off the main thread.

## What was changed

1. **A built piece is drawn a finish at a time** (`Built` in finish.tsx,
   `batchesOf` in part-geometry.ts). A piece lists its boards and rods
   as plain data. The parts with the same finish and colour are merged
   into one geometry, each board placed and turned where it stands, and
   their joint lines into one line set. Each board keeps its grain laid
   along its own longer side and its edge band, exactly as a lone
   `Slab` draws it, so the picture does not change. The piece is still
   picked as a whole by its group, the export copies the merged meshes
   as they are, and a bay in its own colour or a metal handle stays a
   batch of its own. Carcass, Bench, Cart, Rug, Counter, the screen,
   and the legs of the table, chair, sofa and stool are built this way.
   Mirror faces and books stay separate (a mirror is its own reflector;
   a shelf's books were merged already).
2. **One shader a finish, not two.** A rod and a soft block now carry
   white vertex colours, like a slab's band, so a finish compiles once
   and not once with vertex colours and once without. Soft blocks are
   made as drei's `RoundedBox` made them (the same extruded rounded
   rectangle and creased normals) but kept by size, so a cushion's
   geometry is built once and not once per mount.
3. **Lighter stock models.** The models over about 8k triangles were
   simplified to about 6k with glTF Transform's `weld` and `simplify`
   (meshoptimizer, at most 0.5% of the model's size out of place) and
   Draco-compressed again, textures untouched (public/props/LICENSES.md).
   Side by side at the size they are seen, the chair, basket, plant,
   stool, books, box, vase, laptop, lamp, cabinet and planter read the
   same. The tools were already in the workspace (manifold-3d brings
   them); no dependency was added and no script is kept that leans on
   them.
4. **The bench reports the opening.** `/rounded?bench=walk` and the
   checklist's bench now take, before the walk, the main thread's long
   tasks since the page began (count, total, longest), the shader
   programs the renderer keeps, and the meshes, casters and triangles
   the scene shows. The lines are on the panel and under `opening` in
   the copied JSON.

## What was left, and why

- **Building the shaders off the main thread.** three's
  `renderer.compileAsync` (and `PassNode.compileAsync` for the scene
  pass with its MRT) links programs with `KHR_parallel_shader_compile`
  and does not block. It is the right next step, but it was not taken
  blind: the post chain renders the scene through its own pass, the
  shadow passes are not covered by `compileAsync`, and on the demand
  frame loop any frame drawn while a warm-up runs builds the rest
  synchronously anyway. It needs a held first frame (the stage already
  fades in on `data-drawn`), a warm-up per pass, and a real device's
  numbers to show it pays. The bench's opening lines are there to take
  those numbers before and after.
- **Instancing the repeated pieces.** Two bedside cabinets or four
  dining chairs could each be one instanced draw. After batching, a
  piece is two or three draws, so instancing saves little against its
  cost in code (per-instance picking, colours and outlines).
- **Fewer shadow casters.** Small parts (handles, castors) under a few
  centimetres still cast shadows, but they now sit in their piece's
  batches and cost no draws of their own.

## Measuring on a real phone or GPU

The sandbox has no GPU, so these steps are for a person with a device:

1. Run the production build (`pnpm build && pnpm start`) and open
   `/rounded?bench=walk` on the device (on a phone, through the
   machine's address on the local network).
2. Leave it for about 30 s: the panel waits for the room, walks the
   tour for 20 s, then shows the frame rate, P50/P95/P99, the post's
   share, the GPU time where the device has the timestamp query, and
   the two opening lines.
3. Press Copy JSON and keep the report with the device's name and
   browser. On Safari the long-task line says the browser does not
   report long tasks; the frame lines still stand.
4. The phone budget is 30 fps or more; the desktop's P95 at 1440p is
   16.7 ms or less. A longest freeze over about a second while opening
   says the shader warm-up above is worth building.
