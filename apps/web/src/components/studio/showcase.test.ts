import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARRANGEMENTS,
  arrangementOf,
  assetGroups,
  showcasePlaces,
} from "./assets-data";
import { healthOf, type Room } from "./room-health";
import { footprint, isRug, isSmall } from "./piece-detail";
import { hdbOffset, PRIVATE_ROOMS, SHOWCASE_ROOMS } from "./room-data";
import type { PieceProps } from "./piece-detail";
import type { Variant } from "./prop-variants";
import { fittedSizes } from "./props-store";
import { footprintOf, openingsOf, roomOverlaps, useRoom } from "./room-store";
import { inRoom, ownOverrides, propsOf } from "./scene-store";

/**
 * The flat the studio opens on, an HDB 5-room flat read as the planner
 * reads it: ten rooms that stand clear of each other, joined as the plan says, every
 * piece inside its room and the rooms' rules met (no overlaps, the
 * doors' swings and the windows clear, the walkways kept, nothing a
 * room must have missing).
 */
const flat = useRoom.getInitialState();
const items = assetGroups
  .flatMap((g) => g.items)
  .filter((n) => n.kind !== "fixed");
/** the real models' list as the studio reads it (props-store.ts) */
const models = (
  JSON.parse(
    readFileSync(
      path.join(__dirname, "../../../public/props/index.json"),
      "utf8",
    ),
  ) as { models: Variant[] }
).models;
/** the overrides as they stand, and as they stand once the room items
    take their real models' sizes (fit-models.tsx): the flat has to keep
    to its rules both before the list arrives and after */
const asBuiltAndFitted = (
  things: typeof items,
  overrides: Record<string, Partial<PieceProps>>,
) => {
  const sizes = fittedSizes(things, overrides, models);
  const fitted = { ...overrides };
  for (const [id, size] of Object.entries(sizes))
    fitted[id] = { ...fitted[id], ...size };
  return [
    ["as built", overrides],
    ["fitted to the models", fitted],
  ] as const;
};

describe("the flat the studio opens on", () => {
  it("is a 5-room flat: three bedrooms, a common bathroom and the master's own, the hall, the shelter and the yard, standing clear", () => {
    expect(flat.flat).toBe("5-room");
    expect(flat.rooms.map((r) => r.room)).toEqual([
      "living",
      "kitchen",
      "master",
      "bedroom-1",
      "bedroom-2",
      "bathroom",
      "ensuite",
      "hall",
      "shelter",
      "yard",
    ]);
    expect(flat.rooms.map((r) => r.id)).toEqual(Object.values(SHOWCASE_ROOMS));
    for (const r of flat.rooms)
      expect(roomOverlaps(flat.rooms, r.id)).toEqual([]);
    expect(flat.activeId).toBe(SHOWCASE_ROOMS.living);
  });

  it("joins the rooms as the plan does: the bedrooms and the common bathroom off the hall, the parents' bathroom off their room", () => {
    const {
      living,
      kitchen,
      master,
      bedroom2,
      bedroom3,
      bathroom,
      bathroom2,
      hall,
      shelter,
      yard,
    } = SHOWCASE_ROOMS;
    const between = (a: string, b: string) =>
      flat.joins.find(
        (j) => (j.a === a && j.b === b) || (j.a === b && j.b === a),
      )!;
    expect(between(living, kitchen)).toMatchObject({
      kind: "sliding",
      width: 1800,
      open: true,
    });
    // the hall opens off the living room without a leaf
    expect(between(living, hall)).toMatchObject({
      kind: "passage",
      open: true,
    });
    // every bedroom, the common bathroom and the shelter have their door
    // from the hall, the leaf swinging into the room
    for (const [room, width] of [
      [master, 800],
      [bedroom2, 800],
      [bedroom3, 800],
      [bathroom, 750],
      [shelter, 800],
    ] as const)
      expect(between(hall, room), room).toMatchObject({
        kind: "door",
        into: room,
        width,
        open: true,
      });
    // the parents' bathroom from their room alone
    expect(between(master, bathroom2)).toMatchObject({
      kind: "door",
      into: bathroom2,
      width: 700,
      open: true,
    });
    expect(
      flat.joins.some(
        (j) =>
          j.open &&
          (j.a === bathroom2 || j.b === bathroom2) &&
          (j.a === hall || j.b === hall),
      ),
    ).toBe(false);
    // the yard from the kitchen alone
    expect(between(kitchen, yard)).toMatchObject({
      kind: "door",
      into: yard,
      open: true,
    });
    // the walls rooms share without a door stand solid
    expect(between(master, bedroom3)).toMatchObject({ open: false });
    expect(between(bedroom2, bedroom3)).toMatchObject({ open: false });
    // the two bathrooms share no wall: the parents' is at the head of
    // their room, the family's off the hall
    expect(between(bathroom, bathroom2)).toBeUndefined();
    expect(between(living, bedroom2)).toMatchObject({ open: false });
    expect(flat.joins.filter((j) => j.open)).toHaveLength(9);
    // nothing but the hall, the kitchen and the entry opens off the
    // living room
    const open = flat.joins.filter(
      (j) => j.open && (j.a === living || j.b === living),
    );
    expect(open.map((j) => (j.a === living ? j.b : j.a)).sort()).toEqual(
      [hall, kitchen].sort(),
    );
    // the entry door on the living room's south wall
    const entry = flat.rooms[0]!.openings.find((o) => o.kind === "door")!;
    expect(entry.wall).toBe("south");
    // the open doorways read as openings of the rooms on both sides
    for (const r of flat.rooms) {
      const doors = openingsOf(flat, r).filter((o) => o.join);
      expect(doors.length, r.id).toBeGreaterThan(0);
    }
    expect(PRIVATE_ROOMS).toContain("bathroom");
    expect(PRIVATE_ROOMS).toContain("shelter");
  });

  it("stands every piece in its room, clear of the rules, its room items fitted to their models or not", () => {
    for (const [how, places] of asBuiltAndFitted(items, showcasePlaces))
      for (const r of flat.rooms) {
        const room: Room = {
          W: r.width,
          D: r.depth,
          outline: footprintOf(r),
          openings: openingsOf(flat, r),
          rules: r.rules,
          thickness: r.thickness,
        };
        const mine = items.filter((n) =>
          inRoom(showcasePlaces[n.id] ?? {}, r.id, flat.rooms[0]!.id),
        );
        // the hall is kept clear; every other room is furnished
        if (r.room !== "hall") expect(mine.length, r.room).toBeGreaterThan(0);
        const boxes = mine.map((n) => {
          const p = propsOf(n, places);
          expect(p.x, n.name).toBeDefined();
          // on the 50 mm grid a drag snaps to, so a drag never shifts the rest
          expect(p.x! % 50, n.name).toBe(0);
          expect(p.y! % 50, n.name).toBe(0);
          const f = footprint(p);
          // inside the room
          expect(p.x!, n.name).toBeGreaterThanOrEqual(0);
          expect(p.y!, n.name).toBeGreaterThanOrEqual(0);
          expect(p.x! + f.w, n.name).toBeLessThanOrEqual(r.width);
          expect(p.y! + f.d, n.name).toBeLessThanOrEqual(r.depth);
          return {
            id: n.id,
            name: n.name,
            x: p.x!,
            y: p.y!,
            ...f,
            h: p.height,
            own: { w: p.width, d: p.depth, rotation: p.rotation },
          };
        });
        const issues = healthOf(boxes, room);
        expect(
          issues.map((i) => `${r.room}: ${i.kind} ${i.text}`),
          `${how}: ${r.room}`,
        ).toEqual([]);
      }
  });

  it("walks the tour clear of the furniture and through the rooms", () => {
    // every piece one would walk round, on the sheet
    const boxes = flat.rooms.flatMap((r) =>
      items
        .filter((n) =>
          inRoom(showcasePlaces[n.id] ?? {}, r.id, flat.rooms[0]!.id),
        )
        .map((n) => ({ n, p: propsOf(n, showcasePlaces) }))
        .filter(({ n, p }) => !isRug(n) && !isSmall(p))
        .map(({ n, p }) => {
          const f = footprint(p);
          return {
            name: n.name,
            x: r.pos[0] + p.x!,
            y: r.pos[1] + p.y!,
            ...f,
          };
        }),
    );
    const roomAt = (x: number, y: number) =>
      flat.rooms.find(
        (r) =>
          x > r.pos[0] &&
          x < r.pos[0] + r.width &&
          y > r.pos[1] &&
          y < r.pos[1] + r.depth,
      );
    for (const [x, y] of flat.stops)
      expect(roomAt(x, y), `${x},${y}`).toBeDefined();
    flat.stops.slice(1).forEach(([x1, y1], i) => {
      const [x0, y0] = flat.stops[i]!;
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 25);
      for (let k = 0; k <= steps; k++) {
        const x = x0 + ((x1 - x0) * k) / steps;
        const y = y0 + ((y1 - y0) * k) / steps;
        const hit = boxes.find(
          (b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.d,
        );
        expect(hit?.name, `leg ${i + 1} at ${x},${y}`).toBeUndefined();
      }
    });
  });

  it("keeps every arrangement clear of the rules, each one different", () => {
    const seen = new Set<string>();
    for (const a of ARRANGEMENTS) {
      const { groups, overrides } = arrangementOf(a.id);
      const things = groups
        .flatMap((g) => g.items)
        .filter((n) => n.kind !== "fixed");
      seen.add(
        things
          .map((n) => n.id)
          .sort()
          .join(","),
      );
      for (const [how, places] of asBuiltAndFitted(things, overrides))
        for (const r of flat.rooms) {
          const room: Room = {
            W: r.width,
            D: r.depth,
            outline: footprintOf(r),
            openings: openingsOf(flat, r),
            rules: r.rules,
            thickness: r.thickness,
          };
          const boxes = things
            .filter((n) => inRoom(places[n.id] ?? {}, r.id, flat.rooms[0]!.id))
            .map((n) => {
              const p = propsOf(n, places);
              const f = footprint(p);
              return {
                id: n.id,
                name: n.name,
                x: p.x!,
                y: p.y!,
                ...f,
                h: p.height,
                own: { w: p.width, d: p.depth, rotation: p.rotation },
              };
            });
          expect(
            healthOf(boxes, room).map((i) => `${i.kind} ${i.text}`),
            `${a.name}, ${how}: ${r.room}`,
          ).toEqual([]);
        }
    }
    expect(seen.size).toBe(ARRANGEMENTS.length);
  });

  it("tells the pieces for sale from the room items", () => {
    const pieces = items.filter((n) => n.kind === "piece");
    const decor = items.filter((n) => n.kind === "decor");
    expect(pieces.length).toBe(10);
    expect(pieces.every((n) => n.productId && n.price)).toBe(true);
    expect(decor.every((n) => !n.productId && n.price === undefined)).toBe(
      true,
    );
    // every room has something to buy in it but the hall, kept clear,
    // and the bathrooms, whose storage is their basin cabinets
    const fitted: string[] = [
      SHOWCASE_ROOMS.hall,
      SHOWCASE_ROOMS.bathroom,
      SHOWCASE_ROOMS.bathroom2,
    ];
    for (const id of Object.values(SHOWCASE_ROOMS).filter(
      (id) => !fitted.includes(id),
    ))
      expect(
        pieces.some((n) =>
          inRoom(showcasePlaces[n.id] ?? {}, id, flat.rooms[0]!.id),
        ),
        id,
      ).toBe(true);
  });

  it("keeps each room's own openings when the flat type changes", () => {
    useRoom.getState().setFlat("3-room");
    const s = useRoom.getState();
    const room = (id: string) => s.rooms.find((r) => r.id === id)!;
    // the kitchen keeps its window over the counter, on the south wall
    expect(
      room(SHOWCASE_ROOMS.kitchen)
        .openings.filter((o) => o.kind === "window")
        .map((o) => o.wall),
    ).toEqual(["south"]);
    // the bedroom's door is its doorway: no door of its own comes back
    expect(
      room(SHOWCASE_ROOMS.master).openings.some((o) => o.kind === "door"),
    ).toBe(false);
    // the rooms keep the sizes the plan gives them, and the entry door
    // its place by HDB's convention, 800 mm from the east corner
    const living = room(SHOWCASE_ROOMS.living);
    expect(living.width).toBe(5700);
    const door = living.openings.find((o) => o.kind === "door")!;
    expect(hdbOffset(door, living.width, living.depth)).toBe(800);
    useRoom.setState(useRoom.getInitialState(), true);
  });
  const doorways = (
    joins: readonly { a: string; b: string; open: boolean; kind: string }[],
  ) => joins.filter((j) => j.open).map((j) => `${j.a}-${j.b} ${j.kind}`);
  it("keeps together as a 4-room flat: every room where it was, every doorway kept", () => {
    useRoom.getState().setFlat("4-room");
    const s = useRoom.getState();
    for (const r of s.rooms) expect(roomOverlaps(s.rooms, r.id)).toEqual([]);
    expect(s.rooms.map((r) => r.room)).toEqual(flat.rooms.map((r) => r.room));
    expect(s.rooms.map((r) => r.pos)).toEqual(flat.rooms.map((r) => r.pos));
    expect(doorways(s.joins)).toEqual(doorways(flat.joins));
    useRoom.setState(useRoom.getInitialState(), true);
  });
  it("keeps together as a 3-room flat, its third bedroom a living room", () => {
    useRoom.getState().setFlat("3-room");
    const s = useRoom.getState();
    for (const r of s.rooms) expect(roomOverlaps(s.rooms, r.id)).toEqual([]);
    // a 3-room flat has one common bedroom: the other becomes a room of
    // the living room's kind, as any room the flat type has not
    expect(s.rooms.find((r) => r.id === SHOWCASE_ROOMS.bedroom3)!.room).toBe(
      "living",
    );
    expect(doorways(s.joins)).toEqual(doorways(flat.joins));
    useRoom.setState(useRoom.getInitialState(), true);
  });

  it("reads each room's own things alike from the room's overrides alone", () => {
    // a room's reading takes only its own overrides (a drag elsewhere
    // reads nothing there): a thing in another room must not fall back
    // to the first room
    const groups = assetGroups;
    const firstId = flat.rooms[0]!.id;
    for (const r of flat.rooms) {
      const own = ownOverrides(
        { groups, overrides: showcasePlaces },
        r.id,
        firstId,
      );
      const here = (o: typeof showcasePlaces) =>
        items
          .filter((n) => inRoom(propsOf(n, o), r.id, firstId))
          .map((n) => n.id);
      expect(here(own), r.room).toEqual(here(showcasePlaces));
    }
  });
});
