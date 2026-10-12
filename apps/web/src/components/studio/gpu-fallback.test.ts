import { afterEach, describe, expect, it, vi } from "vitest";
import { fellBackFor, shun, shunnedFor, SHUN_MS, within } from "./gpu-fallback";

/** the browser's storage, as the module reads it */
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
});

describe("a GPU that does not answer", () => {
  afterEach(() => {
    store.clear();
    vi.useRealTimers();
  });
  it("is tried while it has not failed lately, and left alone for a day after", () => {
    expect(shunnedFor(1000)).toBeNull();
    shun("device", 1000);
    expect(fellBackFor()).toBe("device");
    expect(shunnedFor(1000 + SHUN_MS - 1)).toBe("device");
    expect(shunnedFor(1000 + SHUN_MS)).toBeNull();
  });
  it("reads a broken note as nothing failed", () => {
    store.set("furnishes.gpu", "{not json");
    expect(shunnedFor()).toBeNull();
    store.set("furnishes.gpu", JSON.stringify({ why: 3 }));
    expect(shunnedFor()).toBeNull();
  });
  it("ends a wait that never ends, and keeps an answer that comes", async () => {
    vi.useFakeTimers();
    const never = within(new Promise<number>(() => {}), 4000, "late" as const);
    vi.advanceTimersByTime(4000);
    await expect(never).resolves.toBe("late");
    await expect(within(Promise.resolve(7), 4000, "late")).resolves.toBe(7);
    await expect(
      within(Promise.reject(new Error("no")), 4000, "late"),
    ).rejects.toThrow("no");
  });
});
