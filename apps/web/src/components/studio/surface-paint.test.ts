import { describe, expect, it } from "vitest";
import { paintMaps, SPEC, type SurfaceKind } from "./surface-paint";

/**
 * The grown surfaces: each kind paints its three maps at the asked
 * size, the same every time, and wraps so a tile meets itself.
 */
const KINDS: SurfaceKind[] = [
  "wood",
  "cloth",
  "plaster",
  "parquet",
  "vinyl",
  "tiles",
  "concrete",
];

describe("the grown surfaces", () => {
  it("paint three maps of the asked size, the same every time", () => {
    for (const kind of KINDS) {
      const spec = { kind, size: 32, tint: null, relief: SPEC[kind].relief };
      const a = paintMaps(spec);
      const b = paintMaps(spec);
      expect(a.colour.length).toBe(32 * 32 * 4);
      expect(a.normal.length).toBe(32 * 32 * 4);
      expect(a.rough.length).toBe(32 * 32 * 4);
      expect(a.colour).toEqual(b.colour);
      expect(a.normal).toEqual(b.normal);
    }
  });
  it("tint a floor and leave wood as light values", () => {
    const floor = paintMaps({
      kind: "concrete",
      size: 16,
      tint: "#c0a080",
      relief: 2,
    });
    const wood = paintMaps({ kind: "wood", size: 16, tint: null, relief: 2 });
    // a tinted map never goes past its tint; light values go to white
    expect(
      Math.max(...floor.colour.filter((_, i) => i % 4 === 0)),
    ).toBeLessThanOrEqual(0xc0);
    expect(
      Math.max(...wood.colour.filter((_, i) => i % 4 === 0)),
    ).toBeGreaterThan(0xc0);
  });
  it("wrap: the seam between the last column and the first is no sharper than any other", () => {
    const n = 64;
    const m = paintMaps({ kind: "plaster", size: n, tint: null, relief: 1.2 });
    // the mean step between a column and the next, across the seam and
    // within the tile
    const step = (x0: number, x1: number) => {
      let diff = 0;
      for (let y = 0; y < n; y++)
        diff += Math.abs(
          m.normal[(y * n + x0) * 4]! - m.normal[(y * n + x1) * 4]!,
        );
      return diff / n;
    };
    let inside = 0;
    for (let x = 0; x < n - 1; x++) inside += step(x, x + 1);
    inside /= n - 1;
    expect(step(n - 1, 0)).toBeLessThan(inside * 1.5);
  });
});
