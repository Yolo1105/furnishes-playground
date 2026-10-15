import { describe, expect, it } from "vitest";
import { openingCentre } from "./room-health";
import { footprintOf, openingsOf, useRoom } from "./room-store";
import { itemCentre, suggestItems, WALL_ITEMS } from "./wall-items";

/**
 * What hangs on the walls, suggested by rule: clear of the doors and
 * windows and of each other, kept off a wall a tall piece stands
 * against, outlets over a kitchen's worktop, the same each time.
 */
const box = (W: number, D: number) =>
  [
    [0, 0],
    [W, 0],
    [W, D],
    [0, D],
  ] as const;
const living = {
  W: 5700,
  D: 6300,
  outline: box(5700, 6300),
  openings: [
    {
      id: "d",
      kind: "door" as const,
      wall: "south" as const,
      at: 900,
      width: 900,
    },
    {
      id: "w",
      kind: "window" as const,
      wall: "north" as const,
      at: null,
      width: 2400,
    },
  ],
};
const spanOf = (
  shell: Parameters<typeof itemCentre>[0],
  it: ReturnType<typeof suggestItems>[number],
) => {
  const c = itemCentre(shell, it);
  const half = WALL_ITEMS[it.kind].width / 2;
  return [c.centre - half, c.centre + half] as const;
};

describe("suggested wall items", () => {
  it("gives a living room its picture, shelf, air-con, clock, outlets and TV point, clear of the openings and each other", () => {
    const items = suggestItems(living, "living");
    expect(items.map((i) => i.kind).sort()).toEqual(
      [
        "aircon",
        "art",
        "clock",
        "outlet",
        "outlet",
        "outlet",
        "shelf",
        "tv-point",
      ].sort(),
    );
    for (const it of items) {
      const [p, q] = spanOf(living, it);
      for (const o of living.openings.filter((o) => o.wall === it.wall)) {
        const c = openingCentre(living, o);
        expect(q <= c.centre - o.width / 2 || p >= c.centre + o.width / 2).toBe(
          true,
        );
      }
      for (const other of items)
        if (other !== it && other.wall === it.wall) {
          const [a, b] = spanOf(living, other);
          expect(q <= a || p >= b).toBe(true);
        }
    }
    // the same room, the same items
    expect(suggestItems(living, "living")).toEqual(items);
  });

  it("keeps the picture off a wall a tall piece stands against", () => {
    const art = suggestItems(living, "master").find((i) => i.kind === "art")!;
    // a wardrobe the length of that wall, against it
    const along = art.wall === "north" || art.wall === "south";
    const s = itemCentre(living, art);
    const blocker = along
      ? {
          x: 0,
          y: art.wall === "north" ? s.at : s.at - 600,
          w: 5700,
          d: 600,
          h: 2200,
        }
      : {
          x: art.wall === "west" ? s.at : s.at - 600,
          y: 0,
          w: 600,
          d: 6300,
          h: 2200,
        };
    const moved = suggestItems(living, "master", [blocker]).find(
      (i) => i.kind === "art",
    )!;
    expect(moved.wall).not.toBe(art.wall);
    // a low piece does not: the picture hangs over it
    const low = { ...blocker, h: 500 };
    expect(
      suggestItems(living, "master", [low]).find((i) => i.kind === "art")!.wall,
    ).toBe(art.wall);
  });

  it("puts a kitchen's outlets over the worktop and a bathroom's things in it", () => {
    const k = suggestItems(living, "kitchen").filter(
      (i) => i.kind === "outlet",
    );
    expect(k.length).toBe(2);
    expect(k.every((i) => i.y === 1150)).toBe(true);
    expect(suggestItems(living, "bathroom").map((i) => i.kind)).toEqual([
      "mirror-cabinet",
      "towel-rail",
      "water-heater",
    ]);
  });

  it("finds room for every room of the showcase flat, its doorways too", () => {
    const st = useRoom.getState();
    for (const r of st.rooms) {
      const shell = {
        W: r.width,
        D: r.depth,
        outline: footprintOf(r),
        openings: openingsOf(st, r),
      };
      const items = suggestItems(shell, r.room);
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) {
        const [p, q] = spanOf(shell, it);
        for (const o of shell.openings.filter((o) => o.wall === it.wall)) {
          const c = openingCentre(shell, o);
          expect(
            q <= c.centre - o.width / 2 || p >= c.centre + o.width / 2,
          ).toBe(true);
        }
      }
    }
  });
});
