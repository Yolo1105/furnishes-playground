import { describe, expect, it } from "vitest";
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh } from "three";
import { baseShareOf, LEAST, MOST } from "./model-base";

const boxOf = (o: Group) => new Box3().setFromObject(o);

describe("how much of its footprint a model's base fills", () => {
  it("a sofa's base fills it", () => {
    const sofa = new Group();
    const body = new Mesh(new BoxGeometry(2, 0.8, 0.9));
    body.position.y = 0.4;
    sofa.add(body);
    const [x, z] = baseShareOf(sofa, boxOf(sofa));
    expect(x).toBe(MOST);
    expect(z).toBe(MOST);
  });
  it("a plant on a narrow pot keeps the old box", () => {
    const plant = new Group();
    const pot = new Mesh(new CylinderGeometry(0.12, 0.1, 0.3));
    pot.position.y = 0.15;
    const leaves = new Mesh(new BoxGeometry(0.9, 0.8, 0.9));
    leaves.position.y = 0.9;
    plant.add(pot, leaves);
    const [x, z] = baseShareOf(plant, boxOf(plant));
    expect(x).toBe(LEAST);
    expect(z).toBe(LEAST);
  });
  it("a chair's legs at its corners span it", () => {
    const chair = new Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new Mesh(new BoxGeometry(0.03, 0.45, 0.03));
      leg.position.set(sx! * 0.22, 0.225, sz! * 0.22);
      chair.add(leg);
    }
    const seat = new Mesh(new BoxGeometry(0.5, 0.05, 0.5));
    seat.position.y = 0.47;
    chair.add(seat);
    const [x] = baseShareOf(chair, boxOf(chair));
    expect(x).toBeGreaterThan(0.85);
  });
});
