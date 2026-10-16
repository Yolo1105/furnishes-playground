import { describe, expect, it } from "vitest";
import { sofaOnRug } from "./room-health";

describe("a sofa against its rug (round 9, Part 3)", () => {
  it("notes a sofa on a rug of nearly its own tone", () => {
    const pieces = [
      { id: "s", name: "Sofa", colour: "#8c8a86" },
      { id: "r", name: "Rug", colour: "#88857f" },
    ];
    const notes = sofaOnRug(pieces);
    expect(notes.length).toBe(1);
    expect(notes[0]!.pieceId).toBe("s");
    expect(notes[0]!.text).toMatch(/rug/);
  });
  it("lets a light sofa on a darker rug be", () => {
    expect(
      sofaOnRug([
        { id: "s", name: "Sofa", colour: "#d8d2c8" },
        { id: "r", name: "Rug", colour: "#6f6a62" },
      ]),
    ).toEqual([]);
  });
});
