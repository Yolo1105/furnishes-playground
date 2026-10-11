import { describe, expect, it } from "vitest";
import { looksLikeMouse, readWheel } from "./input";

/** a wheel event as the browser sends it, at a time of the test's own */
let clock = 0;
const wheel = (
  deltaY: number,
  o: Partial<{
    deltaX: number;
    deltaMode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    gap: number;
  }> = {},
) => {
  clock += o.gap ?? 1000;
  return {
    deltaX: o.deltaX ?? 0,
    deltaY,
    deltaMode: o.deltaMode ?? 0,
    ctrlKey: o.ctrlKey ?? false,
    metaKey: false,
    shiftKey: o.shiftKey ?? false,
    timeStamp: clock,
  } as unknown as WheelEvent;
};

describe("what a wheel event means", () => {
  it("tells a mouse's notch from a trackpad's step", () => {
    // Chrome and Edge on Windows: 100 a notch; 33⅓ at one line a notch
    expect(looksLikeMouse(wheel(100))).toBe(true);
    expect(looksLikeMouse(wheel(100 / 3))).toBe(true);
    expect(looksLikeMouse(wheel(200 / 3))).toBe(true);
    // Firefox counts lines
    expect(looksLikeMouse(wheel(3, { deltaMode: 1 }))).toBe(true);
    // a trackpad: small steps, fractions, any sideways part
    expect(looksLikeMouse(wheel(4))).toBe(false);
    expect(looksLikeMouse(wheel(12.5))).toBe(false);
    expect(looksLikeMouse(wheel(40, { deltaX: 3 }))).toBe(false);
  });
  it("keeps one reading for a whole gesture, the flick's momentum too", () => {
    // a trackpad's flick starts small and its momentum peaks past a
    // notch's size: still a scroll, not a zoom half-way through
    const first = readWheel(wheel(6), "auto");
    expect(first.kind).toBe("scroll");
    const peak = readWheel(wheel(120, { gap: 16 }), "auto");
    expect(peak.kind).toBe("scroll");
    // a pause, then a mouse notch: a zoom
    expect(readWheel(wheel(100, { gap: 600 }), "auto").kind).toBe("zoom");
  });
  it("zooms a notch by a step, and a pinch with the fingers, never far", () => {
    const notch = readWheel(wheel(-100), "auto");
    expect(notch.kind).toBe("zoom");
    if (notch.kind === "zoom") {
      expect(notch.factor).toBeGreaterThan(1.1);
      expect(notch.factor).toBeLessThan(1.3);
    }
    const spun = readWheel(wheel(-900), "auto");
    if (spun.kind === "zoom") expect(spun.factor).toBeCloseTo(1.35, 5);
    // a trackpad pinch (Control held) follows the fingers
    const pinch = readWheel(wheel(-8, { ctrlKey: true }), "auto");
    if (pinch.kind === "zoom")
      expect(pinch.factor).toBeCloseTo(Math.exp(0.08), 5);
    // Control with a mouse's notch: a step, not the whole range at once
    const ctrl = readWheel(wheel(-100, { ctrlKey: true }), "auto");
    if (ctrl.kind === "zoom") expect(ctrl.factor).toBeCloseTo(1.6, 5);
  });
  it("scrolls across for a sideways wheel, or Shift with a mouse", () => {
    const side = readWheel(wheel(0, { deltaX: 40 }), "zoom");
    expect(side).toEqual({ kind: "scroll", dx: -40, dy: 0 });
    const shifted = readWheel(wheel(100, { shiftKey: true }), "auto");
    expect(shifted).toEqual({ kind: "scroll", dx: -100, dy: 0 });
  });
  it("follows the setting: always a zoom, or always a move", () => {
    expect(readWheel(wheel(6), "zoom").kind).toBe("zoom");
    expect(readWheel(wheel(100), "scroll").kind).toBe("scroll");
  });
});
