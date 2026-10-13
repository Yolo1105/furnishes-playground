import { describe, expect, it } from "vitest";
import { bracketPart } from "@furnishes/domain";
import {
  type Project,
  refreshShowcase,
  type Snapshot,
  upgrade,
} from "./project-store";

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

/**
 * The studio's flat changing never costs a visitor their work: a
 * showcase project given earlier and left alone is made over in place,
 * one they changed and every one they made stay as they are, and none
 * is noted gone.
 */
describe("refreshShowcase", () => {
  const project = (id: string, at: number): Project => ({
    id,
    name: id,
    at,
    data: base(),
  });
  it("makes over an untouched showcase project in place, and leaves the rest", () => {
    const kept = [
      project("given", 100),
      project("changed", 300),
      project("mine", 50),
    ];
    const { projects, given } = refreshShowcase(kept, {
      v: 6,
      given: {
        given: { arrangement: "balanced", at: 100 },
        changed: { arrangement: "study", at: 200 },
      },
    });
    expect(projects.map((p) => p.id)).toEqual(["given", "changed", "mine"]);
    const made = projects.find((p) => p.id === "given")!;
    expect(made.at).toBeGreaterThan(100);
    expect(made.data).not.toBe(kept[0]!.data);
    expect(projects.find((p) => p.id === "changed")).toBe(kept[1]);
    expect(projects.find((p) => p.id === "mine")).toBe(kept[2]);
    expect(Object.keys(given)).toEqual(["given"]);
    expect(given.given!.at).toBe(made.at);
  });
  it("gives a browser with no record the flat beside what it kept", () => {
    const kept = [project("mine", 50)];
    const { projects, given } = refreshShowcase(kept, { v: 6, given: {} });
    expect(projects.at(-1)).toBe(kept[0]);
    expect(projects.length).toBeGreaterThan(1);
    expect(Object.keys(given)).toHaveLength(projects.length - 1);
  });
});
