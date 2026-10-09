import { describe, expect, it } from "vitest";
import { bracketPart } from "@furnishes/domain";
import { type Snapshot, upgrade } from "./project-store";

/**
 * A snapshot kept by an earlier studio is brought up to the current
 * shape as it is read: an old project loads unchanged, a part item
 * keeps its history, and a node of a kind this studio does not know
 * stands as a room item rather than breaking the room.
 */
const base = (): Snapshot =>
  ({
    room: {},
    scene: {
      groups: [
        {
          id: "storage",
          name: "Storage",
          items: [
            {
              id: "x",
              name: "Bookwall",
              kind: "piece",
              category: "storage",
              productId: "bookwall",
              price: 100,
            },
          ],
        },
      ],
      cart: [],
      labels: [],
      overrides: {},
    },
    eva: {},
  }) as unknown as Snapshot;

describe("upgrade", () => {
  it("brings a version-1 snapshot to the current shape unchanged in substance", () => {
    const snap = { ...base(), v: 1 };
    const up = upgrade(snap);
    expect(up.v).toBe(2);
    expect(up.scene.groups).toEqual(snap.scene.groups);
  });
  it("keeps a part item and names its units; an unknown kind becomes a room item", () => {
    const snap = base();
    const { units: _u, ...noUnits } = bracketPart();
    snap.scene.groups[0]!.items.push(
      {
        id: "p1",
        name: "Shelf bracket",
        kind: "part",
        category: "components",
        part: noUnits as never,
      },
      { id: "q", name: "Thing", kind: "future" as never, category: "decor" },
    );
    const up = upgrade({ ...snap, v: 1 });
    const items = up.scene.groups[0]!.items;
    expect(items[1]!.part?.units).toBe("mm");
    expect(items[1]!.part?.features).toHaveLength(4);
    expect(items[2]!.kind).toBe("decor");
  });
  it("leaves a current snapshot as it is", () => {
    const snap = { ...base(), v: 2 };
    expect(upgrade(snap)).toBe(snap);
  });
});
