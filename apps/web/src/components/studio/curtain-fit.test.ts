import { describe, expect, it } from "vitest";
import { drapesFree } from "./curtain-fit";
import type { Opening } from "./room-data";

/** a 4 × 3 m room, a 1.5 m window in the middle of a wall */
const room = {
  W: 4000,
  D: 3000,
  outline: [
    [0, 0],
    [4000, 0],
    [4000, 3000],
    [0, 3000],
  ] as [number, number][],
};
const win = (wall: Opening["wall"]): Opening =>
  ({ id: "w", kind: "window", wall, at: null, width: 1500 }) as Opening;
const past = 0.175;

describe("a window's drapes and what stands at the wall", () => {
  it("hangs both when nothing stands in their way", () => {
    expect(drapesFree(room, win("north"), past, [])).toEqual([true, true]);
    // a sofa out in the room, well clear of the wall
    const sofa = { x: 1200, y: 1200, w: 2000, d: 900 };
    expect(drapesFree(room, win("north"), past, [sofa])).toEqual([true, true]);
  });

  it("leaves off the drape a TV unit against the wall stands in", () => {
    // the window runs x 1250..2750 on the north wall; a unit against the
    // wall from x 2500 to 4000 takes the right-hand drape's place
    const unit = { x: 2500, y: 0, w: 1500, d: 450 };
    expect(drapesFree(room, win("north"), past, [unit])).toEqual([true, false]);
    // and on the left
    const left = { x: 0, y: 0, w: 1400, d: 450 };
    expect(drapesFree(room, win("north"), past, [left])).toEqual([false, true]);
  });

  it("reads the window's sides on an east wall as the window does", () => {
    // on the east wall the window's own +x runs south (+y): a cabinet at
    // the north end of the window is its left-hand drape's
    const cabinet = { x: 3600, y: 0, w: 400, d: 900 };
    expect(drapesFree(room, win("east"), past, [cabinet])).toEqual([
      false,
      true,
    ]);
  });
});
