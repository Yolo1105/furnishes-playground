import {
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";
import { lightingKey, probesPending, shaderKey, unwarmed } from "./shader-warm";

describe("the shaders built ahead of the frame", () => {
  const room = () => {
    const scene = new Scene();
    const material = new MeshStandardMaterial();
    const board = new Mesh(new BoxGeometry(), material);
    scene.add(board);
    return { scene, material, board };
  };
  it("finds the parts whose materials have not been built", () => {
    const { scene, board } = room();
    const warmed = new WeakMap();
    const cold = unwarmed(scene, warmed);
    expect(cold.map((c) => c.part)).toEqual([board]);
    for (const c of cold) warmed.set(c.part, c.key);
    expect(unwarmed(scene, warmed)).toEqual([]);
  });
  it("builds a part again when a picture arrives on its material", () => {
    const { scene, material } = room();
    const warmed = new WeakMap();
    for (const c of unwarmed(scene, warmed)) warmed.set(c.part, c.key);
    material.map = new Texture();
    expect(unwarmed(scene, warmed)).toHaveLength(1);
  });
  it("leaves a part alone when only its colour or version changes", () => {
    const { scene, material } = room();
    const warmed = new WeakMap();
    for (const c of unwarmed(scene, warmed)) warmed.set(c.part, c.key);
    const before = shaderKey(material);
    material.color.set("#556b5d");
    material.needsUpdate = true;
    expect(shaderKey(material)).toBe(before);
    expect(unwarmed(scene, warmed)).toEqual([]);
  });
  it("skips what is hidden", () => {
    const { scene, board } = room();
    board.visible = false;
    expect(unwarmed(scene, new WeakMap())).toEqual([]);
  });
  it("waits for a probe grid's first picture, which changes every shader", () => {
    const { scene } = room();
    expect(probesPending(scene)).toBe(false);
    const grid = Object.assign(new DirectionalLight(), {
      isLightProbeGrid: true,
      texture: null as Texture | null,
    });
    scene.add(grid);
    expect(probesPending(scene)).toBe(true);
    const before = lightingKey(scene);
    grid.texture = new Texture();
    expect(probesPending(scene)).toBe(false);
    expect(lightingKey(scene)).not.toBe(before);
  });
  it("tells a change of lighting, which changes every shader", () => {
    const { scene } = room();
    const before = lightingKey(scene);
    const sun = new DirectionalLight();
    scene.add(sun);
    const lit = lightingKey(scene);
    expect(lit).not.toBe(before);
    sun.castShadow = true;
    expect(lightingKey(scene)).not.toBe(lit);
  });
});
