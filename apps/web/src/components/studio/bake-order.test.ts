import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
} from "three";
import { roomSignature } from "./gi-collect";

/**
 * Round 10, Part 3: the bakes run in one order, pieces → the room's
 * bounce → the probes, and a later one never sends an earlier one back.
 * A piece's own bake lays its footprint on the floor (Bake.tsx), and
 * that footprint once changed the room's signature, so each piece's
 * bake arriving baked its room's bounce again, and the probes after it.
 */
const room = () => {
  const g = new Group();
  const floor = new Mesh(
    new PlaneGeometry(4, 4),
    new MeshStandardMaterial({ color: "#b08a64" }),
  );
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const piece = new Group();
  piece.position.set(1, 0, -1.2);
  piece.add(
    new Mesh(
      new BoxGeometry(0.8, 2, 0.4),
      new MeshStandardMaterial({ color: "#d9c4a0" }),
    ),
  );
  g.add(piece);
  g.updateMatrixWorld(true);
  return { g, piece };
};
const sig = (g: Group) => {
  g.updateMatrixWorld(true);
  return roomSignature(g, [0, 0, 0], 0);
};

describe("a piece's bake and its room's bounce", () => {
  it("a piece's footprint arriving leaves the room's signature as it was", () => {
    const { g, piece } = room();
    const before = sig(g);
    // as Bake.tsx lays it, once the piece's own bake is done
    const foot = new Mesh(
      new PlaneGeometry(1, 0.6),
      new MeshStandardMaterial({ color: "#000000", transparent: true }),
    );
    foot.userData = { name: "Footprint" };
    foot.rotation.x = -Math.PI / 2;
    piece.add(foot);
    expect(sig(g)).toBe(before);
    // and its going again, a new bake on its way, the same
    piece.remove(foot);
    expect(sig(g)).toBe(before);
  });
  it("a helper (a halo, a ring) changes nothing either", () => {
    const { g, piece } = room();
    const before = sig(g);
    const halo = new Mesh(new BoxGeometry(1, 1, 1));
    halo.userData = { export: "helper" };
    piece.add(halo);
    expect(sig(g)).toBe(before);
  });
  it("a piece moved, recoloured or a lamp lit bakes the room again", () => {
    const { g, piece } = room();
    const before = sig(g);
    piece.position.x += 0.3;
    const moved = sig(g);
    expect(moved).not.toBe(before);
    const board = piece.children[0] as Mesh;
    (board.material as MeshStandardMaterial).color.set("#5a4636");
    expect(sig(g)).not.toBe(moved);
    const lit = sig(g);
    const lamp = new PointLight("#ffd9a8", 2);
    lamp.position.set(0, 1.5, 0);
    g.add(lamp);
    expect(sig(g)).not.toBe(lit);
  });
  it("a model's near copy taking over from its far one changes nothing", () => {
    const { g } = room();
    const item = new Group();
    item.userData = { giItem: true };
    item.position.set(-1, 0, 0.5);
    const far = new Mesh(
      new BoxGeometry(0.5, 0.5, 0.5),
      new MeshStandardMaterial({ color: "#cccccc" }),
    );
    far.scale.setScalar(0.51);
    item.add(far);
    g.add(item);
    const before = sig(g);
    // the near copy, in its own scale and colour, fades in; the far goes
    const near = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: "#f0e8dd" }),
    );
    near.position.y = 0.5;
    item.add(near);
    expect(sig(g)).toBe(before);
    item.remove(far);
    expect(sig(g)).toBe(before);
    // the item moved is a change
    item.position.x += 0.4;
    expect(sig(g)).not.toBe(before);
  });
});
