# Speeding up the studio: what was measured, what changed, what is next

The question was how to make the studio feel faster to use, end to
end: opening it, moving about the plan and the 3D view, and pointing at
things. This plan says how it was measured, what was changed and by
how much, and what is left in order of what it would save.

## How it was measured

A throwaway Playwright script (kept out of the repository) opened
`/rounded` in the sandbox's Chromium (SwiftShader behind WebGL 2, the
"phone" post tier) on the development server and read Chrome's own
counters (`Performance.getMetrics`: the script's time and the whole
main thread's) and the page's long tasks:

- **Opening:** from the navigation to the stage saying `data-drawn`
  (the first picture), and the main thread held in long tasks.
- **Pointing:** the pointer moved forty times across the 3D room, over
  pieces and off them; the script's time it cost.
- **The plan:** thirty two-finger trackpad steps over the plan (wheel
  events without Control, the trackpad's pan); the script's time.

The development server compiles a route on its first request after a
change, so the first run after an edit is thrown away, and a reading
that waits on loads (the opening) is taken several times and the
median kept: one build gave 12.6 s and 4.9 s on two runs in a row.

## What was changed

1. **The plan's sheet moves alone** (`PlanSheet` in Plan2D.tsx). The
   zoom and the pan were read by the whole plan, so every trackpad step
   and every wheel notch drew every room, every wall, every opening and
   every piece of the seven-room flat again, about 390 ms of script a
   step here. The zoom and the pan are now read by the sheet's frame
   alone, which only moves its transform; the rooms and pieces inside
   it are made by the plan and are not drawn again.
2. **A hover draws two pieces, not all of them** (`useHovered` in
   Scene3D.tsx). The piece under the pointer was the stage's state, so
   the pointer entering or leaving any piece drew the whole stage and
   every piece in the flat again. It is a small store now: each piece
   reads whether it is the one, and the stage's `data-hover` (the hand
   or the finger over the canvas) is set as the pointer moves, without
   a render.

3. **A room's probes are kept** (Probes.tsx). Each room change baked
   the light probes again, and coming back to a room baked its probes
   once more. Each room's grid is now kept with what it was baked
   under (the room's stamp: its shell, its light, its shadows; and the
   surroundings), the last eight rooms; coming back to a room that has
   not changed takes its probes as they stand. In the sandbox, the
   master bedroom's bake took 26 s (the quick bake); back in the
   living room the stage read `data-probes="ready"` throughout, with no
   bake.

4. **A pick draws the pieces it changes** (`usePieceActions` in
   piece-actions.ts, `Piece` in Scene3D.tsx). Which piece is picked was
   read by the hook every view of every room calls, so a pick drew the
   3D stage, its seven rooms and every piece in them, the plan and the
   panels; and each of those calls read its room again: the pieces,
   the findings with their fixes, and the four layouts, each costed,
   twenty readings a pick (the findings' fixes alone took half a second
   of it). A room's reading is now kept by what it was read from and
   shared by every view that asks, and the pick is read by the 3D
   piece, the plan and the elevation themselves. Ten picks: 8.0 s of
   script before, 1.3 s after; one pick's click came back in 0.36 s
   instead of 2.9 s. What is left of a pick in the sandbox is the
   software renderer drawing the frame (a frame's own script is 28 ms).
5. **A room switch builds nothing again** (`FlatRoom` in Scene3D.tsx).
   The active room was drawn by the stage and the others by a second
   component, so a click on another room took both rooms down and
   built them anew: the shells, the pieces, and their shaders' node
   graphs (a second of the switch's script, in `getNodeBuilderState`
   and the warm-up's `compileAsync`). Every room is now drawn by one
   component kept by its id, and a switch only moves the rooms and
   changes what two of them do (dragged, named, hovered, the floor's
   reflection, the probes' pieces). The click came back in 0.58 s
   instead of 1.64 s, and the shader building is gone from the switch's
   profile; the rest of its wait is the camera's glide, frame by frame.

## The numbers

| what (sandbox, dev server)             | before |     after |
| -------------------------------------- | -----: | --------: |
| 30 trackpad steps on the plan, script  | 11.8 s |     0.2 s |
| 40 pointer moves over the room, script | 0.73 s | 0.5–0.6 s |
| 10 picks, script                       |  8.0 s |     1.3 s |
| a room switch, script                  |  1.7 s |     1.0 s |
| a room switch, the click back          | 1.64 s |    0.58 s |

Measured and left: **the other rooms after the first picture.** The
3D view draws the whole flat, seven rooms and their sixty-odd pieces,
and with the first view inside the living room the others stand behind
its walls, so they could come in once its first picture is up. Five
openings each way, alternating, put the first picture at 8.6 s (median)
with them held back and 8.5 s with them drawn from the start: the
opening's cost is the shader programs, which the rooms share, and the
living room's own. Held back, they would only add a second hold just
after the first picture, so they are drawn from the start as before.

## What is next, in order of what it would save

1. **Production, not development.** `next dev` compiles each route on
   its first request after a start or a change (66 s for `/rounded` and
   its three.js chunk on the sandbox's first request after the server
   started, which the measurements above leave out: the page waits on
   the compile with nothing drawn, the "stuck" first load) and runs
   React's development build. The same three readings on a production
   build (`next build && next start`, three runs): the main thread held
   6.2–7.8 s while opening (8.4–9.0 s on the development server), forty
   pointer moves 0.27 s of script (about 0.55 s), thirty trackpad steps
   0.04 s (about 0.2 s). The first picture, 5.4–10.5 s, moved little:
   in the sandbox it waits on the software renderer, not on the
   script. A person trying the studio should run
   `pnpm build && pnpm start`; it is the first thing to check when the
   first load is slow.
2. **Shader programs on the opening.** The software renderer spends
   most of the opening linking programs (docs/plan-draw-cost.md); on a
   real GPU with `KHR_parallel_shader_compile` or WebGPU the warm-up
   already builds them off the main thread. Measured on the seven-room
   flat: 39 programs are linked by the first picture, and only 12 are
   lit surfaces (the rest are shadow depth, plain colours and the
   post's passes). The 12 are not near twins to fold together: the
   closest two differ in some 730 lines of their fragment shader, the
   rest in 1,300 to 1,600, as the floor's photographed set, the plaster,
   the wood, the cloth, the stock models' maps, the glass and the satin
   coat each are. Fewer would mean fewer finishes, a change to the
   picture for a cost only the software renderer pays, so they stay.
3. **The props' download.** The stock models (2.8 MB) and the
   photographed sets (3.3 MB) are fetched on the first visit; they are
   cached after. KTX2 was measured and left (plan-realism.md).
