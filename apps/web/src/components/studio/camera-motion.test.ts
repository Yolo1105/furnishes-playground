import { afterEach, describe, expect, it, vi } from "vitest";
import { medianOf, SLOW_MS } from "./camera-motion";
import { tierBelow, tierOf } from "./Post";

describe("a lighter picture for a slow device", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts a device short of memory on the phone's picture", () => {
    vi.stubGlobal("navigator", { deviceMemory: 4 });
    expect(tierOf("auto", false, "webgl")).toBe("phone");
    expect(tierOf("auto", false, "webgpu")).toBe("phone");
    // asked for in View settings, it is kept
    expect(tierOf("light", false, "webgl")).toBe("laptop");
    vi.stubGlobal("navigator", { deviceMemory: 8 });
    expect(tierOf("auto", false, "webgpu")).toBe("desktop");
    expect(tierOf("auto", false, "webgl")).toBe("laptop");
    // a browser that does not say (Safari, Firefox) is judged by its frames
    vi.stubGlobal("navigator", {});
    expect(tierOf("auto", false, "webgl")).toBe("laptop");
  });

  it("takes the tier down a step at a time, never below the phone's", () => {
    expect(tierBelow("desktop", 0)).toBe("desktop");
    expect(tierBelow("desktop", 1)).toBe("laptop");
    expect(tierBelow("desktop", 2)).toBe("phone");
    expect(tierBelow("desktop", 5)).toBe("phone");
    expect(tierBelow("laptop", 1)).toBe("phone");
    expect(tierBelow("phone", 3)).toBe("phone");
    expect(tierBelow(null, 2)).toBeNull();
  });

  it("judges the moving frames by their middle, so one long frame does not count", () => {
    const steady = Array.from({ length: 23 }, () => 16);
    expect(medianOf([...steady, 400])).toBeLessThan(SLOW_MS);
    expect(medianOf(Array.from({ length: 24 }, () => 70))).toBeGreaterThan(
      SLOW_MS,
    );
    expect(medianOf([])).toBe(0);
  });
});
