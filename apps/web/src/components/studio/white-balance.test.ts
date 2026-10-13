import { Color } from "three";
import { describe, expect, it } from "vitest";
import {
  balanceGain,
  EVENING_LIGHT,
  LAMP_BULB,
  LAMPLIT_WHITE,
} from "./white-balance";

describe("the evening's white balance", () => {
  it("turns a lamp-lit white into a warm white, not orange", () => {
    const lamp = new Color("#ffb877");
    const [r, g, b] = balanceGain("#ffb877");
    const out = new Color(lamp.r * r, lamp.g * g, lamp.b * b);
    const want = new Color(LAMPLIT_WHITE);
    // the same hue as the target, up to the exposure's brightness
    expect(out.r / out.g).toBeCloseTo(want.r / want.g, 5);
    expect(out.b / out.g).toBeCloseTo(want.b / want.g, 5);
    // the blue is lifted and the red held back
    expect(b).toBeGreaterThan(1);
    expect(r).toBeLessThan(1);
  });
  it("balances for the evening's mix, the lamps' pools left warmer", () => {
    const gain = balanceGain(EVENING_LIGHT);
    const lit = (hex: string) => {
      const c = new Color(hex);
      return [c.r * gain[0], c.g * gain[1], c.b * gain[2]] as const;
    };
    const want = new Color(LAMPLIT_WHITE);
    const wall = lit(EVENING_LIGHT);
    expect(wall[0] / wall[1]).toBeCloseTo(want.r / want.g, 5);
    expect(wall[2] / wall[1]).toBeCloseTo(want.b / want.g, 5);
    // under the bulb alone, warmer than the wall: red up, blue down
    const pool = lit(LAMP_BULB);
    expect(pool[0] / pool[1]).toBeGreaterThan(wall[0] / wall[1]);
    expect(pool[2] / pool[1]).toBeLessThan(wall[2] / wall[1]);
  });
  it("leaves a white light as it is", () => {
    const [r, g, b] = balanceGain("#ffffff", "#ffffff");
    expect([r, g, b]).toEqual([1, 1, 1]);
  });
});
