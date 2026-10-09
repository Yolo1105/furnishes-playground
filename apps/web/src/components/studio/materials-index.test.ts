import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The photographed sets' index: every set it lists has its three maps
 * on disk and a tile that covers some stretch, so the loader never
 * asks for a file that is not there.
 */
const ROOT = join(process.cwd(), "public", "materials");

describe("the materials index", () => {
  const index = JSON.parse(readFileSync(join(ROOT, "index.json"), "utf8")) as {
    materials: Record<
      string,
      { tile: number; color: string; normal: string; roughness: string }
    >;
  };
  it("lists sets whose three maps are on disk, each with a tile", () => {
    const names = Object.keys(index.materials);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const m = index.materials[name]!;
      expect(m.tile).toBeGreaterThan(0);
      for (const file of [m.color, m.normal, m.roughness])
        expect(existsSync(join(ROOT, name, file)), `${name}/${file}`).toBe(
          true,
        );
    }
  });
  it("names only materials the studio looks for", () => {
    const known = [
      "wood",
      "cloth",
      "plaster",
      "parquet",
      "vinyl",
      "tiles",
      "concrete",
    ];
    for (const name of Object.keys(index.materials))
      expect(known).toContain(name);
  });
  it("has a licence line for every set", () => {
    const licences = readFileSync(join(ROOT, "LICENSES.md"), "utf8");
    for (const name of Object.keys(index.materials))
      expect(licences).toContain("`" + name + "/`");
  });
});
