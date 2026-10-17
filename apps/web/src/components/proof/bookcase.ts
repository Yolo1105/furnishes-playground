import type { V3 } from "./board-uv";

/**
 * The round 10 proof piece: one birch-ply bookcase, 800 × 2000 × 400 mm,
 * built as a cabinet maker builds it, as plain data (a board each, in
 * metres, centred, the floor at y = 0, the front +z). Sides to the
 * floor, the top over them, a plinth between them set 30 mm back, a
 * bottom on the plinth, a back 9 mm thick set 10 mm in from the back
 * edges, a fixed shelf at half height, a shelf in the cupboard below it
 * and two above, and two overlay doors on the lower half on 2 mm
 * bumpers with a 3 mm gap round them and a bar handle on each.
 */

export const BOOKCASE = {
  id: "proof-bookcase-800",
  w: 0.8,
  h: 2.0,
  d: 0.4,
  /** the boards and the back, m */
  board: 0.018,
  back: 0.009,
  backIn: 0.01,
  /** the plinth: its height and how far it stands back from the front */
  plinth: 0.06,
  plinthBack: 0.03,
  /** the shelves stop this far behind the front edge */
  shelfIn: 0.02,
  /** the doors: the gap round them and how far they stand off the
      carcass on their bumpers */
  gap: 0.003,
  bumper: 0.002,
  /** the fixed shelf's middle, the doors' top */
  middle: 1.0,
} as const;

export type Board = { id: string; dims: V3; at: V3 };
export type Handle = { at: V3; length: number };

export const bookcase = () => {
  const B = BOOKCASE;
  const t = B.board;
  const inner = B.w - 2 * t;
  const boards: Board[] = [];
  const add = (id: string, dims: V3, at: V3) => boards.push({ id, dims, at });
  // the sides, to the floor, under the top
  for (const [id, s] of [
    ["side-left", -1],
    ["side-right", 1],
  ] as const)
    add(id, [t, B.h - t, B.d], [(s * (B.w - t)) / 2, (B.h - t) / 2, 0]);
  add("top", [B.w, t, B.d], [0, B.h - t / 2, 0]);
  // the plinth between the sides, set back
  add("plinth", [inner, B.plinth, t], [0, B.plinth / 2, B.d / 2 - B.plinthBack - t / 2]);
  add("bottom", [inner, t, B.d - B.backIn - B.back], [
    0,
    B.plinth + t / 2,
    (B.backIn + B.back) / 2,
  ]);
  // the back, in from the sides' back edges, between top and floor
  const backTop = B.h - t;
  add("back", [inner, backTop - B.plinth, B.back], [
    0,
    B.plinth + (backTop - B.plinth) / 2,
    -B.d / 2 + B.backIn + B.back / 2,
  ]);
  // the shelves: one in the cupboard, the fixed one, two above
  const shelfD = B.d - B.backIn - B.back - B.shelfIn;
  const shelfZ = -B.d / 2 + B.backIn + B.back + shelfD / 2;
  const shelves: [string, number][] = [
    ["shelf-low", (B.plinth + t + B.middle) / 2],
    ["shelf-middle", B.middle],
    ["shelf-upper", B.middle + (backTop - B.middle) / 3],
    ["shelf-top", B.middle + (2 * (backTop - B.middle)) / 3],
  ];
  for (const [id, y] of shelves) add(id, [inner, t, shelfD], [0, y, shelfZ]);
  // the doors over the lower half, full overlay
  const doorBottom = B.plinth + B.gap;
  const doorTop = B.middle - B.gap / 2;
  const doorH = doorTop - doorBottom;
  const doorW = (B.w - 3 * B.gap) / 2;
  const doorZ = B.d / 2 + B.bumper + t / 2;
  const handles: Handle[] = [];
  for (const [id, s] of [
    ["door-left", -1],
    ["door-right", 1],
  ] as const) {
    const x = s * (B.gap / 2 + doorW / 2);
    add(id, [doorW, doorH, t], [x, doorBottom + doorH / 2, doorZ]);
    // a 160 mm bar near the meeting edge, its middle 120 mm under the top
    handles.push({
      at: [x - s * (doorW / 2 - 0.05), doorTop - 0.2, doorZ + t / 2],
      length: 0.16,
    });
  }
  return { boards, handles };
};
