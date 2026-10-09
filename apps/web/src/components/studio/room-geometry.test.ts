import { describe, expect, it } from "vitest";
import {
  magnetSize,
  outerOutline,
  roomsOverlap,
  settleRoom,
} from "./room-geometry";

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

const rect = (x: number, y: number, w: number, d: number) =>
  [
    [x, y],
    [x + w, y],
    [x + w, y + d],
    [x, y + d],
  ] as [number, number][];

describe("rooms over each other", () => {
  it("knows an overlap from two rooms wall to wall", () => {
    const living = rect(0, 0, 6500, 4000);
    // beside it, a wall apart: not an overlap
    expect(roomsOverlap(living, rect(6800, 0, 3000, 3000))).toBe(false);
    // a touch is not an overlap either
    expect(roomsOverlap(living, rect(6500, 0, 3000, 3000))).toBe(false);
    // the living room grown into the bedroom is
    expect(
      roomsOverlap(rect(0, 0, 7500, 4000), rect(6800, 0, 3000, 3000)),
    ).toBe(true);
  });
  it("settles a room out of its neighbour by the smallest shift, a wall apart", () => {
    const living = rect(0, 0, 7500, 4000);
    const bedroom = rect(6800, 0, 3000, 3000);
    // the bedroom moves east: 7500 + 300 - 6800
    expect(settleRoom(bedroom, living, 300)).toEqual({ dx: 1000, dy: 0 });
    // and the living room, if it is the one to move, goes west the same
    expect(settleRoom(living, bedroom, 300)).toEqual({ dx: -1000, dy: 0 });
    // a room mostly below its neighbour goes south
    expect(settleRoom(rect(0, 3500, 4000, 3000), living, 300)).toEqual({
      dx: 0,
      dy: 800,
    });
    expect(settleRoom(bedroom, rect(0, 0, 6500, 4000), 300)).toBeNull();
  });
  it("draws a resized room's far walls to a neighbour's within reach", () => {
    const bedroom = rect(6800, 0, 3000, 3000);
    // widened to 6300: 200 short of wall to wall, drawn the rest
    expect(magnetSize(rect(0, 0, 6300, 4000), [bedroom], 300)).toEqual({
      dw: 200,
      dd: 0,
    });
    // widened a little into it: drawn back
    expect(magnetSize(rect(0, 0, 6700, 4000), [bedroom], 300)).toEqual({
      dw: -200,
      dd: 0,
    });
    // far from it: left alone
    expect(magnetSize(rect(0, 0, 5000, 4000), [bedroom], 300)).toEqual({
      dw: 0,
      dd: 0,
    });
  });
});
