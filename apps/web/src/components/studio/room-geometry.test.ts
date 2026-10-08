import { describe, expect, it } from "vitest";
import { outerOutline } from "./room-geometry";

describe("outerOutline", () => {
  it("moves a rectangle's corners out by the thickness both ways", () => {
    expect(
      outerOutline(
        [
          [0, 0],
          [6500, 0],
          [6500, 4000],
          [0, 4000],
        ],
        300,
      ),
    ).toEqual([
      [-300, -300],
      [6800, -300],
      [6800, 4300],
      [-300, 4300],
    ]);
  });
  it("brings a concave corner in, so an L keeps its notch", () => {
    const out = outerOutline(
      [
        [0, 0],
        [6000, 0],
        [6000, 2000],
        [3000, 2000],
        [3000, 4000],
        [0, 4000],
      ],
      300,
    );
    expect(out[2]).toEqual([6300, 2300]);
    expect(out[3]).toEqual([3300, 2300]);
    expect(out[4]).toEqual([3300, 4300]);
  });
  it("runs the same whichever way round the outline goes", () => {
    expect(
      outerOutline(
        [
          [0, 0],
          [0, 4000],
          [6500, 4000],
          [6500, 0],
        ],
        300,
      ),
    ).toEqual([
      [-300, -300],
      [-300, 4300],
      [6800, 4300],
      [6800, -300],
    ]);
  });
});
