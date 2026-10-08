import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The limiter counts in the database: so many goes in a window, then
 * no more until the window has passed. Off outside production unless
 * RATE_LIMITS=on asks, which this test does, against a PGlite of its
 * own in a temporary folder.
 */
process.env.RATE_LIMITS = "on";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "furnishes-limit-"));
const { allow } = await import("./rate-limit");

describe("allow", () => {
  it("lets the first goes through and refuses the one past the bound", async () => {
    const key = `test:${Date.now()}`;
    expect(await allow(key, 2)).toBe(true);
    expect(await allow(key, 2)).toBe(true);
    expect(await allow(key, 2)).toBe(false);
  }, 60_000);
  it("starts the count again once the window has passed", async () => {
    const key = `test-window:${Date.now()}`;
    expect(await allow(key, 1, 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(await allow(key, 1, 1)).toBe(true);
  }, 60_000);
});
