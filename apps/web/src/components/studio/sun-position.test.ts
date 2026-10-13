import { describe, expect, it } from "vitest";
import { SUN_TIMES, sunAt, sunDirection } from "./sun-position";

describe("the sun over Singapore", () => {
  it("rises in the east and sets in the west at the equinox", () => {
    const morning = sunAt(SUN_TIMES.morning);
    const afternoon = sunAt(SUN_TIMES.afternoon);
    expect(morning.azimuth).toBeGreaterThan(80);
    expect(morning.azimuth).toBeLessThan(100);
    expect(afternoon.azimuth).toBeGreaterThan(260);
    expect(afternoon.azimuth).toBeLessThan(280);
  });
  it("stands nearly overhead at midday and low in the morning", () => {
    expect(sunAt(SUN_TIMES.midday).elevation).toBeGreaterThan(80);
    const low = sunAt(SUN_TIMES.morning).elevation;
    expect(low).toBeGreaterThan(25);
    expect(low).toBeLessThan(45);
  });
  it("stands north of overhead in June and south in December", () => {
    // solar noon falls near 13:05 on Singapore's clocks
    expect(sunAt(13.08, 172).azimuth).toBeLessThan(10);
    expect(Math.abs(sunAt(13.08, 355).azimuth - 180)).toBeLessThan(10);
  });
  it("points east on a plan with north up, and turns with the plan's north", () => {
    const [x, y, z] = sunDirection(SUN_TIMES.morning);
    expect(x).toBeGreaterThan(0.6);
    expect(y).toBeGreaterThan(0);
    expect(Math.abs(z)).toBeLessThan(0.2);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    // north pointing right on the plan: east is down the plan (south +z)
    const [x2, , z2] = sunDirection(SUN_TIMES.morning, 90);
    expect(z2).toBeGreaterThan(0.6);
    expect(Math.abs(x2)).toBeLessThan(0.2);
  });
});
