import { describe, expect, it } from "vitest";
import type { Opening } from "./room-data";
import { type LitRoom, panesOf, WINDOW_LIGHT } from "./window-light";

const win = (id: string, wall: Opening["wall"], width = 1500): Opening =>
  ({
    id,
    kind: "window",
    wall,
    at: null,
    width,
    sill: 900,
    head: 2400,
  }) as Opening;
const box = (W: number, D: number) =>
  [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ] as const;
const room = (
  id: string,
  pos: [number, number],
  openings: Opening[],
): LitRoom => ({
  id,
  pos,
  W: 4000,
  D: 3000,
  outline: box(4000, 3000),
  openings,
});

describe("the windows' light", () => {
  it("stands in each opening just inside the glass, facing in, the glass's size", () => {
    const [p] = panesOf([room("a", [0, 0], [win("w", "north", 3000)])], "a");
    expect(p!.facing).toEqual([0, 1]);
    // the north wall is z = -D/2; the light a few cm inside it
    expect(p!.at[2]).toBeCloseTo(-1.5 + WINDOW_LIGHT.inset);
    expect(p!.at[1]).toBeCloseTo(1.65);
    expect(p!.width).toBeCloseTo(3);
    expect(p!.height).toBeCloseTo(1.5);
  });
  it("lights the active room's windows alone, never through a wall", () => {
    const rooms = [
      room("far", [20000, 0], [win("f1", "north"), win("f2", "east")]),
      room(
        "next",
        [4000, 0],
        [win("n1", "north"), win("n2", "south"), win("n3", "east")],
      ),
      room("a", [0, 0], [win("a1", "west"), win("a2", "south")]),
    ];
    const panes = panesOf(rooms, "a");
    expect(panes).toHaveLength(2);
    // in the active room's own frame
    expect(panes[0]!.at[0]).toBeCloseTo(-2 + WINDOW_LIGHT.inset);
    expect(panes[1]!.facing).toEqual([0, -1]);
    // a room with none has none
    expect(panesOf([room("h", [0, 0], [])], "h")).toEqual([]);
  });
});
