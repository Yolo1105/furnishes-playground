import { describe, expect, it } from "vitest";
import { NoColorSpace, SRGBColorSpace, Vector2 } from "three";
import { lookMaterial } from "./finish-material";
import { SET_MAPS } from "./materials";
import { surfaceOf } from "./textures";

/**
 * Round 10, Part 2: the colour-space audit, and the boards' occlusion.
 * Every map is read as what it holds (a colour as sRGB, data as it is),
 * and a piece's board carries its bake as its occlusion and no map of
 * its own beside it. (The screen's occlusion is still laid on every
 * surface: a per-surface share was tried and did not take in this
 * sandbox, docs/plan-realism.md.)
 */
describe("each map's colour space", () => {
  it("a set's colour is sRGB, its normal and roughness are data", () => {
    expect(SET_MAPS.color).toBe(SRGBColorSpace);
    expect(SET_MAPS.normal).toBe(NoColorSpace);
    expect(SET_MAPS.roughness).toBe(NoColorSpace);
    // and a set's own occlusion map is never loaded
    expect(Object.keys(SET_MAPS)).not.toContain("ao");
  });
  it("a grown surface's maps the same way", () => {
    const px = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const maps = { colour: px, normal: px, rough: px, size: 4 };
    const tinted = surfaceOf(maps, true);
    expect(tinted.map.colorSpace).toBe(SRGBColorSpace);
    expect(tinted.normalMap.colorSpace).toBe(NoColorSpace);
    expect(tinted.roughnessMap.colorSpace).toBe(NoColorSpace);
  });
});

describe("a board's occlusion", () => {
  it("plain, coated or sheened: its bake, and no map beside it", () => {
    for (const f of [
      { colour: "#d9c4a0", rough: 0.6 },
      { colour: "#d9c4a0", rough: 0.4, coat: 0.5 },
      { colour: "#7a6a5a", rough: 0.9, sheen: 0.6 },
    ]) {
      const m = lookMaterial(null, {
        colour: "#d9c4a0",
        f,
        maps: {},
        normalScale: new Vector2(1, 1),
        banded: true,
      });
      expect(m.aoNode).toBeTruthy();
      expect(m.aoMap).toBeNull();
    }
  });
});
