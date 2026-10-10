import { describe, expect, it } from "vitest";
import { assetGroups, showcasePlaces } from "./assets-data";
import { healthOf, type Room } from "./room-health";
import { footprint } from "./piece-detail";
import { hdbOffset, PRIVATE_ROOMS, SHOWCASE_ROOMS } from "./room-data";
import { footprintOf, openingsOf, roomOverlaps, useRoom } from "./room-store";
import { inRoom, propsOf } from "./scene-store";

/**
 * The flat the studio opens on, read as the planner reads it: four
 * rooms that stand clear of each other, joined as the plan says, every
 * piece inside its room and the rooms' rules met (no overlaps, the
 * doors' swings and the windows clear, the walkways kept, nothing a
 * room must have missing).
 */
const flat = useRoom.getInitialState();
const items = assetGroups
  .flatMap((g) => g.items)
  .filter((n) => n.kind !== "fixed");

describe("the flat the studio opens on", () => {
  it("is a 5-room flat of four rooms that stand clear of each other", () => {
    expect(flat.flat).toBe("5-room");
    expect(flat.rooms.map((r) => r.room)).toEqual([
      "living",
      "master",
      "bathroom",
      "kitchen",
    ]);
    expect(flat.rooms.map((r) => r.id)).toEqual(Object.values(SHOWCASE_ROOMS));
    for (const r of flat.rooms)
      expect(roomOverlaps(flat.rooms, r.id)).toEqual([]);
    expect(flat.activeId).toBe(SHOWCASE_ROOMS.living);
  });

  it("joins the rooms as a flat is joined: each neighbour on its own wall", () => {
    const { living, master, bathroom, kitchen } = SHOWCASE_ROOMS;
    const between = (a: string, b: string) =>
      flat.joins.find(
        (j) => (j.a === a && j.b === b) || (j.a === b && j.b === a),
      )!;
    const toKitchen = between(living, kitchen);
    expect(toKitchen).toMatchObject({
      kind: "sliding",
      width: 1800,
      open: true,
    });
    const toMaster = between(living, master);
    expect(toMaster).toMatchObject({ kind: "door", into: master, open: true });
    const toBath = between(living, bathroom);
    expect(toBath).toMatchObject({
      kind: "door",
      into: bathroom,
      width: 750,
      open: true,
    });
    // the bedroom and the bathroom share a wall, but it stays solid
    expect(between(master, bathroom)).toMatchObject({ open: false });
    expect(flat.joins).toHaveLength(4);
    // the three doorways from the living room are on three walls
    const walls = flat.joins
      .filter((j) => j.open)
      .map((j) => (j.a === living ? j.wallA : j.wallB));
    expect(new Set(walls).size).toBe(2); // west twice (bedroom, bathroom), east once
    expect(walls.filter((w) => w === "west")).toHaveLength(2);
    expect(walls.filter((w) => w === "east")).toHaveLength(1);
    // the open doorways read as openings of the rooms on both sides
    for (const r of flat.rooms) {
      const doors = openingsOf(flat, r).filter((o) => o.join);
      expect(doors.length).toBeGreaterThan(0);
    }
    expect(PRIVATE_ROOMS).toContain("bathroom");
  });

  it("stands every piece in its room, clear of the rules", () => {
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
      expect(mine.length, r.room).toBeGreaterThan(2);
      const boxes = mine.map((n) => {
        const p = propsOf(n, showcasePlaces);
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
        r.room,
      ).toEqual([]);
    }
  });

  it("tells the pieces for sale from the room items", () => {
    const pieces = items.filter((n) => n.kind === "piece");
    const decor = items.filter((n) => n.kind === "decor");
    expect(pieces.length).toBe(11);
    expect(pieces.every((n) => n.productId && n.price)).toBe(true);
    expect(decor.every((n) => !n.productId && n.price === undefined)).toBe(
      true,
    );
    // every room has something to buy in it
    for (const id of Object.values(SHOWCASE_ROOMS))
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
    // the kitchen keeps its window on the service yard's side
    expect(
      room(SHOWCASE_ROOMS.kitchen)
        .openings.filter((o) => o.kind === "window")
        .map((o) => o.wall),
    ).toEqual(["east"]);
    // the bedroom's door is its doorway: no door of its own comes back
    expect(
      room(SHOWCASE_ROOMS.master).openings.some((o) => o.kind === "door"),
    ).toBe(false);
    // the entry door keeps its place by HDB's convention, 800 mm from
    // the east corner of the smaller living room
    const living = room(SHOWCASE_ROOMS.living);
    expect(living.width).toBe(6000);
    const door = living.openings.find((o) => o.kind === "door")!;
    expect(hdbOffset(door, living.width, living.depth)).toBe(800);
    useRoom.setState(useRoom.getInitialState(), true);
  });
});
