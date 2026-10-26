import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
} from "three";
import { describe, expect, it } from "vitest";
import { applyGiUv, collectFlat, roomAt, type GiPlace } from "./gi-collect";

/**
 * Two rooms side by side, 4 × 4 m each, 2.6 m tall: A from x = −2 to 2,
 * B from x = 2.1 to 6.1, and the wall between them (0.1 m thick) drawn
 * by A alone, as the flat draws a shared wall once.
 */
const named = (name: string, mesh: Mesh) => {
  mesh.userData = { name };
  return mesh;
};
const roomGroup = (x: number, wall: boolean) => {
  const g = new Group();
  g.position.set(x, 0, 0);
  const white = new MeshStandardMaterial({ color: "#ffffff" });
  const floor = named("Floor", new Mesh(new PlaneGeometry(4, 4), white));
  floor.rotation.x = -Math.PI / 2;
  const ceiling = named("Ceiling", new Mesh(new PlaneGeometry(4, 4), white));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 2.6;
  g.add(floor, ceiling);
  if (wall) {
    const w = named(
      "Wall",
      new Mesh(new BoxGeometry(0.1, 2.6, 4).toNonIndexed(), white),
    );
    w.position.set(2.05, 1.3, 0);
    g.add(w);
  }
  g.updateMatrixWorld(true);
  return g;
};

describe("the flat as the bounce bake reads it (round 9, Part 1)", () => {
  const a = roomGroup(0, true);
  const b = roomGroup(4.1, false);
  b.add(new PointLight("#ffffff", 0));
  const lamp = new PointLight("#ffaa66", 14, 5);
  lamp.position.set(0, 1.2, 0);
  b.add(lamp);
  b.updateMatrixWorld(true);
  const rooms = [
    { id: "a", group: a, windows: [] },
    { id: "b", group: b, windows: [] },
  ];

  it("finds each room by its floor, and none above the ceilings", () => {
    const flat = collectFlat(rooms, 4, 256);
    expect(roomAt(flat.floors, [0, 1, 0])).toBe("a");
    expect(roomAt(flat.floors, [4, 1, 1])).toBe("b");
    expect(roomAt(flat.floors, [0, 2.7, 0])).toBe(null);
    expect(roomAt(flat.floors, [20, 1, 0])).toBe(null);
  });

  it("gives the shared wall's far face to the room it faces, and B's bake holds the wall A draws", () => {
    const flat = collectFlat(rooms, 4, 256);
    const jobB = flat.rooms.get("b")!.job;
    // B's receivers: its floor, its ceiling and the wall's +x face
    const facing = jobB.charts.map((c) => c.n.map((x) => Math.round(x) + 0));
    expect(facing).toContainEqual([1, 0, 0]);
    expect(facing).toContainEqual([0, 1, 0]);
    expect(facing).toContainEqual([0, -1, 0]);
    // and A's: the wall's −x face, not its +x one
    const facingA = flat.rooms
      .get("a")!
      .job.charts.map((c) => c.n.map((x) => Math.round(x) + 0));
    expect(facingA).toContainEqual([-1, 0, 0]);
    expect(facingA).not.toContainEqual([1, 0, 0]);
    // the lit lamp of B is B's, the dark one is not a lamp
    expect(flat.rooms.get("b")!.lamps.length).toBe(1);
    expect(flat.rooms.get("a")!.lamps.length).toBe(0);
    // the shell's meshes: two floors, two ceilings and the wall
    expect(flat.shells.length).toBe(5);
  });

  it("writes each face's room into its coordinates, and waits for every room it faces", () => {
    const flat = collectFlat(rooms, 4, 256);
    const wall = a.children.find((c) => c.userData.name === "Wall") as Mesh;
    const place = (id: string, slot: number): GiPlace => {
      const p = flat.rooms.get(id)!;
      return { slot, charts: p.charts, size: p.job.size };
    };
    // B not baked yet: the wall keeps its live light
    const onlyA = new Map([["a", place("a", 0)]]);
    expect(applyGiUv(wall, wall.geometry, flat.floors, onlyA, 256)).toBe(false);
    expect(wall.geometry.getAttribute("giuv")).toBeUndefined();
    const both = new Map([
      ["a", place("a", 0)],
      ["b", place("b", 1)],
    ]);
    expect(applyGiUv(wall, wall.geometry, flat.floors, both, 256)).toBe(true);
    const uv = wall.geometry.getAttribute("giuv");
    const nrm = wall.geometry.getAttribute("normal");
    const slotOf = (x: number, y: number) => {
      for (let i = 0; i < nrm.count; i++)
        if (Math.round(nrm.getX(i)) === x && Math.round(nrm.getY(i)) === y)
          return uv.getZ(i);
      return NaN;
    };
    expect(slotOf(1, 0)).toBe(1);
    expect(slotOf(-1, 0)).toBe(0);
    // its cut top looks into no room: lit as outdoors
    expect(slotOf(0, 1)).toBe(-1);
    // every coordinate within the layer
    for (let i = 0; i < uv.count; i++) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
    }
  });

  it("lets the light through a window's drawn outside: the picture beyond the glass is the sky the bake stands for, not a wall", () => {
    const g = roomGroup(0, false);
    const count = () =>
      collectFlat([{ id: "a", group: g, windows: [] }], 4, 256).rooms.get("a")!
        .job.tris.length;
    const without = count();
    // the outlook, opaque, a hand's width past where the glass would be
    const outside = new Mesh(
      new PlaneGeometry(1.2, 1.2),
      new MeshBasicMaterial({ color: "#88aadd" }),
    );
    outside.userData = { export: "outlook" };
    outside.position.set(1.9, 1.4, 0);
    outside.rotation.y = -Math.PI / 2;
    g.add(outside);
    g.updateMatrixWorld(true);
    expect(count()).toBe(without);
  });
});
