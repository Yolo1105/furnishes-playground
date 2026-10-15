import { describe, expect, it } from "vitest";
import {
  artCentre,
  DESIGN,
  designOf,
  mattressTop,
  type Placed,
  tvLift,
} from "./design-rules";

const at = (
  id: string,
  name: string,
  x: number,
  y: number,
  w: number,
  d: number,
  h = 800,
): Placed => ({ id, name, x, y, w, d, h });
const W = 5700;
const D = 6300;
// a sofa against the west wall facing east, 2.4 m long
const sofa = at("s", "Sofa", 300, 1500, 950, 2400);
const rules = (pieces: Placed[]) => designOf(pieces, W, D).map((a) => a.rule);

describe("a room arranged by the book", () => {
  it("sets the coffee table a reach from the sofa, about two thirds its length", () => {
    const good = at("t", "Coffee table", 300 + 950 + 420, 2100, 600, 1600, 400);
    expect(rules([sofa, good])).toEqual([]);
    const far = { ...good, x: good.x + 400 };
    expect(rules([sofa, far])).toContain("table-gap");
    const small = { ...good, d: 900, y: 2400 };
    expect(rules([sofa, small])).toContain("table-length");
  });
  it("wants a rug the seats' front legs stand on, framed by the floor", () => {
    // from under the sofa's front to 300 mm off the east wall
    const rug = at("r", "Rug", 1000, 1300, W - 1300, 2800, 10);
    expect(rules([sofa, rug])).toEqual([]);
    // a small rug floating in the middle
    const small = at("r", "Rug", 2000, 2200, 1400, 1000, 10);
    expect(rules([sofa, small])).toEqual(
      expect.arrayContaining(["rug-size", "rug-margin"]),
    );
    // wall to wall
    const wall = at("r", "Rug", 50, 50, W - 100, D - 100, 10);
    expect(rules([wall])).toContain("rug-margin");
  });
  it("keeps a floor lamp beside a seat", () => {
    const by = at("l", "Floor lamp", 300, 1100, 350, 350, 1600);
    expect(rules([sofa, by])).toEqual([]);
    const open = at("l", "Floor lamp", 3500, 4500, 350, 350, 1600);
    expect(rules([sofa, open])).toContain("lamp");
  });
  it("levels a bedside table with the mattress", () => {
    const bed = at("b", "Queen bed", 600, 1700, 1600, 2100, 1000);
    const top = mattressTop(1000);
    const level = at("n", "Bedside cabinet", 100, 1700, 450, 400, top + 20);
    expect(rules([bed, level])).toEqual([]);
    const tall = { ...level, h: top + 200 };
    expect(rules([bed, tall])).toContain("bedside");
  });
  it("puts a television and a picture at the heights a seated eye wants", () => {
    // a 65-inch screen on a 450 mm console: its stand lifts its middle
    // into the band; on a tall console the stand's own height holds
    const c = 450 + tvLift(450, 810, 80) + 810 / 2;
    expect(c).toBeGreaterThanOrEqual(DESIGN.tvCentre[0]);
    expect(c).toBeLessThanOrEqual(DESIGN.tvCentre[1]);
    expect(tvLift(900, 810, 80)).toBe(80);
    expect(artCentre(600, null)).toBe(1500);
    expect(artCentre(600, 850)).toBe(850 + 225 + 300);
  });
});
