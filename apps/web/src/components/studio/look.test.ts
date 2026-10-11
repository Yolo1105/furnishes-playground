import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CURTAIN, curtainGeometry } from "./curtain";
import {
  cameraFor,
  cornerOf,
  FOV,
  roomFov,
  walkStart,
} from "./camera-bookmarks";
import { SHOWCASE_ROOMS } from "./room-data";
import { openingsOf, useRoom } from "./room-store";
import { roomItemHex, ROOM_ITEM_HEX } from "./piece-detail";
import { WOOD_M } from "./surface-paint";

describe("the look: a curtain's cloth", () => {
  it("hangs from its rail in folds, both faces built", () => {
    const g = curtainGeometry(0.42, 1.5);
    g.computeBoundingBox();
    const b = g.boundingBox!;
    // its width across, from the rail (y 0) down its drop
    expect(b.max.x - b.min.x).toBeCloseTo(0.42, 5);
    expect(b.max.y).toBeCloseTo(0, 5);
    expect(b.min.y).toBeCloseTo(-1.5, 5);
    // the folds stand fuller at the hem than at the rail
    expect(b.max.z - b.min.z).toBeGreaterThan(CURTAIN.fold);
    // the front and the back each have their vertices and white tones
    const n = g.getAttribute("position").count;
    expect(n % 2).toBe(0);
    expect(g.getAttribute("color").count).toBe(n);
    expect([...(g.getAttribute("color").array as Float32Array)]).toEqual(
      new Array<number>(n * 3).fill(1),
    );
    // the front's normals face the room, the back's the glass
    const normals = g.getAttribute("normal");
    const z = (i: number) => new Vector3().fromBufferAttribute(normals, i).z;
    const half = n / 2;
    let front = 0;
    let back = 0;
    for (let i = 0; i < half; i++) front += z(i);
    for (let i = half; i < n; i++) back += z(i);
    expect(front).toBeGreaterThan(0);
    expect(back).toBeLessThan(0);
    // the weave keeps its size: the UVs run in wood tiles
    const uv = g.getAttribute("uv");
    let most = 0;
    for (let i = 0; i < uv.count; i++) most = Math.max(most, uv.getY(i));
    expect(most).toBeCloseTo(1.5 / WOOD_M, 5);
  });
});

describe("the room's corner shot", () => {
  it("stands inside the room and looks across it with a wide lens", () => {
    const room = { w: 7, d: 4.5 };
    const p = cameraFor("Perspective", 15, 9, 2.6, [1, 2], room, 16 / 10);
    expect(Math.abs(p.pos[0])).toBeLessThan(room.w / 2);
    expect(Math.abs(p.pos[2])).toBeLessThan(room.d / 2);
    // it looks from its corner towards the far one
    expect(p.at[0]).toBeLessThan(p.pos[0]);
    expect(p.at[2]).toBeLessThan(p.pos[2]);
    expect(p.fov).toBe(FOV.room);
    // the overviews keep the narrower lens
    expect(cameraFor("Front", 15, 9, 2.6, [1, 2], room).fov).toBe(FOV.overview);
    expect(walkStart(7, 4.5).fov).toBe(FOV.room);
  });
  it("is taken from the side facing the window, away from the doors", () => {
    // the living room: its window north, its entry door and the
    // kitchen's sliding door east of its middle: the south-west corner,
    // which has the window, the bookwall and the entry organiser in view
    const flat = useRoom.getInitialState();
    const living = flat.rooms.find((r) => r.id === SHOWCASE_ROOMS.living)!;
    const corner = cornerOf(
      openingsOf(flat, living),
      living.width,
      living.depth,
    );
    expect(corner).toEqual([-1, 1]);
    const p = cameraFor("Perspective", 15, 9, 2.6, [0, 0], {
      w: 7,
      d: 4.5,
      corner,
    });
    expect(p.pos[0]).toBeLessThan(0);
    expect(p.pos[2]).toBeGreaterThan(0);
    // the walk starts there too, looking to the far corner
    const walk = walkStart(7, 4.5, 16 / 10, corner);
    expect(walk.pos[0]).toBeLessThan(0);
    expect(walk.at[0]).toBeGreaterThan(walk.pos[0]);
    // a window on the west wall: the camera stands on the east side
    expect(
      cornerOf(
        [{ kind: "window", wall: "west", at: null, width: 1200 }],
        3000,
        3000,
      )[0],
    ).toBe(1);
    // no window: the south-east
    expect(cornerOf([], 3000, 3000)).toEqual([1, 1]);
  });
  it("opens the lens on a tall screen, within bounds", () => {
    expect(roomFov(16 / 10)).toBe(FOV.room);
    expect(roomFov(1)).toBeGreaterThan(FOV.room);
    expect(roomFov(0.45)).toBe(FOV.widest);
  });
});

describe("a room item's tone", () => {
  it("is its own for a rug, a bed and a wardrobe, else the quiet one", () => {
    expect(roomItemHex("Rug")).not.toBe(ROOM_ITEM_HEX);
    expect(roomItemHex("Single bed")).not.toBe(ROOM_ITEM_HEX);
    expect(roomItemHex("Wardrobe 2")).not.toBe(ROOM_ITEM_HEX);
    // a bedside cabinet is not a bed, a bath mat not a rug
    expect(roomItemHex("Bedside cabinet")).toBe(ROOM_ITEM_HEX);
    expect(roomItemHex("Bath mat")).toBe(ROOM_ITEM_HEX);
  });
});
