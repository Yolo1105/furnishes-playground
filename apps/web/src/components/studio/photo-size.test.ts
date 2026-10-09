import { describe, expect, it } from "vitest";
import { photoChoices, photoPixels } from "./photo-size";

describe("a photo's size", () => {
  it("is the screen's own buffer, or a fixed height at the stage's shape", () => {
    expect(photoPixels("screen", 1440, 900, 8192)).toEqual({
      width: 1440,
      height: 900,
    });
    expect(photoPixels("1080p", 1440, 900, 8192)).toEqual({
      width: 1728,
      height: 1080,
    });
    expect(photoPixels("4k", 1600, 900, 8192)).toEqual({
      width: 3840,
      height: 2160,
    });
  });
  it("refuses what the device cannot hold in one texture", () => {
    expect(photoPixels("4k", 1600, 900, 2048)).toBeNull();
    expect(photoPixels("1080p", 1600, 900, 2048)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(photoPixels("screen", 0, 0, 2048)).toBeNull();
  });
  it("lists every choice with its pixels or none", () => {
    const c = photoChoices(1440, 900, 2048);
    expect(c.map((x) => x.id)).toEqual(["screen", "1080p", "1440p", "4k"]);
    expect(c[3]!.pixels).toBeNull();
    expect(c[1]!.pixels).not.toBeNull();
  });
});
