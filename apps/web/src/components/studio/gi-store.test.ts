import { describe, expect, it } from "vitest";
import { giFromDisk, overflow } from "./gi-store";

describe("the rooms' light kept in the browser", () => {
  it("lets go of the least recently used past the limit", () => {
    const entries = [
      { key: "a", used: 30 },
      { key: "b", used: 10 },
      { key: "c", used: 20 },
      { key: "d", used: 40 },
    ];
    expect(overflow(entries, 2)).toEqual(["b", "c"]);
    expect(overflow(entries, 4)).toEqual([]);
    expect(overflow(entries, 9)).toEqual([]);
  });
  it("without a store, finds nothing and the room is baked", async () => {
    expect(await giFromDisk("any", 16)).toBeNull();
  });
});
