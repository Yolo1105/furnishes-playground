import { describe, expect, it } from "vitest";
import {
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
  Vector2,
} from "three";
import { lookMaterial } from "./finish-material";
import { SET_MAPS } from "./materials";
import { aoSourcesOf, GTAO_SHARE, screenAoOf, takesScreenAo } from "./screen-ao";
import { surfaceOf } from "./textures";

/**
 * Round 10, Part 2 and 3: the colour-space and occlusion audit. Every
 * map is read as what it holds (a colour as sRGB, data as it is), and
 * every surface takes one occlusion, never two laid over each other.
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

describe("one occlusion a surface", () => {
  const finish = (f: Parameters<typeof lookMaterial>[1]["f"]) =>
    lookMaterial(null, {
      colour: "#d9c4a0",
      f,
      maps: {},
      normalScale: new Vector2(1, 1),
      banded: true,
    });
  it("a piece's board, plain, coated or sheened: its bake alone", () => {
    for (const f of [
      { colour: "#d9c4a0", rough: 0.6 },
      { colour: "#d9c4a0", rough: 0.4, coat: 0.5 },
      { colour: "#7a6a5a", rough: 0.9, sheen: 0.6 },
    ]) {
      const m = finish(f);
      expect(aoSourcesOf(m)).toEqual(["baked"]);
      expect(screenAoOf(m)).toBe(0);
    }
  });
  it("a loaded model: the screen's, at a share of its strength", () => {
    const m = takesScreenAo(new MeshStandardMaterial());
    expect(aoSourcesOf(m)).toEqual(["screen"]);
    expect(GTAO_SHARE).toBeGreaterThanOrEqual(0.3);
    expect(GTAO_SHARE).toBeLessThanOrEqual(0.5);
    expect(screenAoOf(m)).toBe(GTAO_SHARE);
  });
  it("a model with its own occlusion map keeps that one alone", () => {
    const m = takesScreenAo(new MeshStandardMaterial({ aoMap: new Texture() }));
    expect(aoSourcesOf(m)).toEqual(["map"]);
    expect(screenAoOf(m)).toBe(0);
  });
});
