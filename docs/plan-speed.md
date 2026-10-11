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

## The numbers

| what (sandbox, dev server)             | before |     after |
| -------------------------------------- | -----: | --------: |
| 30 trackpad steps on the plan, script  | 11.8 s |     0.2 s |
| 40 pointer moves over the room, script | 0.73 s | 0.5–0.6 s |

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
   its first request after a change (seconds for `/rounded` and its
   three.js chunk, which the measurements above leave out) and runs
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
   already builds them off the main thread. Fewer distinct materials
   (one cloth, one wood, one paint per tone, shared across pieces) would
   cut the count further.
3. **Selection still draws every piece.** Picking a piece changes the
   stage's state and every piece is drawn again; the same treatment as
   the hover (each piece reading whether it is the picked one) would
   make a pick cost one or two pieces. It was left because a pick is a
   click, not a stream of events.
4. **The probe bake.** Each room change bakes the light probes again
   (a minute on the software renderer, a fraction of a second on a
   GPU); a bake per room kept by its stamp would make switching back to
   a room free.
5. **The props' download.** The stock models (2.8 MB) and the
   photographed sets (3.3 MB) are fetched on the first visit; they are
   cached after. KTX2 was measured and left (plan-realism.md).
