import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  type RectAreaLight,
  Scene,
  Texture,
} from "three";
import { describe, expect, it } from "vitest";
import { copyForExport } from "./scene-copy";

/**
 * The copy for export keeps the room and the pieces as named meshes in
 * classic materials, in world space, and drops everything else: a
 * helper under a piece, an untagged mesh, a line, a hidden piece, and
 * a node material that becomes a Standard one with its maps.
 */
/** a stand-in for a node material: what the floor's is to a reader */
const nodeMaterial = () => {
  const m = new MeshStandardMaterial({ color: "#c59b6b", roughness: 0.6 });
  (m as Material & { isNodeMaterial?: boolean }).isNodeMaterial = true;
  return m;
};

const room = () => {
  const scene = new Scene();
  const shell = new Group();
  shell.userData.export = "room";
  const floor = new Mesh(new PlaneGeometry(4, 3), nodeMaterial());
  floor.userData.name = "Floor";
  floor.rotation.x = -Math.PI / 2;
  const wall = new Mesh(
    new BoxGeometry(4, 2.6, 0.1),
    new MeshStandardMaterial(),
  );
  wall.position.set(0, 1.3, -1.5);
  const window = new Group();
  const outlook = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
  outlook.userData.export = "outlook";
  outlook.userData.outlook = { evening: false, sun: [3, 6, -4] };
  window.add(outlook);
  shell.add(floor, wall, window);
  const pieces = new Group();
  pieces.userData.export = "piece";
  const bookwall = new Group();
  bookwall.userData.name = "Bookwall";
  bookwall.position.set(1, 0, -1);
  const panel = new Mesh(
    new BoxGeometry(0.8, 2, 0.3),
    new MeshPhysicalMaterial({ clearcoat: 0.2 }),
  );
  panel.position.y = 1;
  const halo = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial());
  halo.userData.export = "helper";
  const edges = new LineSegments();
  bookwall.add(panel, halo, edges);
  const hidden = new Group();
  hidden.visible = false;
  hidden.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  pieces.add(bookwall, hidden);
  const grid = new Mesh(new PlaneGeometry(9, 9), new MeshBasicMaterial());
  const sun = new DirectionalLight("#fff3e2", 7);
  sun.position.set(3, 6, 4);
  const skyShadow = new DirectionalLight("#e0e7ee", 1);
  skyShadow.userData.export = "helper";
  scene.add(shell, pieces, grid, sun, skyShadow);
  return scene;
};

const meshesOf = (g: Object3D) => {
  const out: Mesh[] = [];
  g.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
};

describe("the copy for export", () => {
  it("keeps the room and the pieces, named, in classic materials, and drops the rest", () => {
    const { root, dispose } = copyForExport(room(), { purpose: "gltf" });
    const meshes = meshesOf(root);
    const names = meshes.map((m) => m.name).sort();
    expect(names).toEqual(
      ["Bookwall", "Floor", "Room part", "Window outside"].sort(),
    );
    for (const m of meshes) {
      const mat = m.material as Material & { isNodeMaterial?: boolean };
      expect(mat.isNodeMaterial).toBeFalsy();
      expect(
        (mat as MeshStandardMaterial).isMeshStandardMaterial ||
          (mat as MeshPhysicalMaterial).isMeshPhysicalMaterial,
      ).toBe(true);
    }
    expect(root.getObjectByName("Pieces")!.children).toHaveLength(1);
    expect(root.getObjectByName("Room")!.children).toHaveLength(3);
    dispose();
  });
  it("places a copy where its source stands in the world", () => {
    const { root } = copyForExport(room(), { purpose: "gltf" });
    const panel = root.getObjectByName("Bookwall")!;
    expect(panel.position.toArray()).toEqual([1, 1, -1]);
    const floor = root.getObjectByName("Floor")!;
    expect(floor.rotation.x).toBeCloseTo(-Math.PI / 2);
  });
  it("turns a node material into a Standard one with its colour", () => {
    const { root } = copyForExport(room(), { purpose: "gltf" });
    const floor = root.getObjectByName("Floor") as Mesh;
    const m = floor.material as MeshStandardMaterial;
    expect(m.isMeshStandardMaterial).toBe(true);
    expect(m.color.getHexString()).toBe(new Color("#c59b6b").getHexString());
    expect(m.roughness).toBe(0.6);
  });
  it("keeps a piece's clear coat", () => {
    const { root } = copyForExport(room(), { purpose: "gltf" });
    const panel = root.getObjectByName("Bookwall") as Mesh;
    expect((panel.material as MeshPhysicalMaterial).clearcoat).toBe(0.2);
  });
  it("carries the cameras and the sun asked for in a glTF copy", () => {
    const { root } = copyForExport(room(), {
      purpose: "gltf",
      cameras: [{ name: "Front", position: [0, 3, 6], at: [0, 1, 0] }],
      sun: { position: [3, 6, 4], colour: "#fff3e2", intensity: 7 },
    });
    expect(root.getObjectByName("Front")).toBeDefined();
    const sun = root.getObjectByName("Sun") as DirectionalLight;
    expect(sun.isDirectionalLight).toBe(true);
    expect(sun.intensity).toBe(7);
  });
  it("keeps the scene's sun in a tracing copy, not the sky's shadow, and leaves the cameras out", () => {
    const { root } = copyForExport(room(), { purpose: "trace" });
    const lights = root.getObjectByName("Lights")!;
    expect(lights.children).toHaveLength(1);
    expect(root.getObjectByName("Cameras")).toBeUndefined();
  });
  it("lights a window's opening for the tracer, facing in", () => {
    const { root } = copyForExport(room(), { purpose: "trace" });
    const light = root.getObjectByName("Window light") as RectAreaLight;
    expect(light.isRectAreaLight).toBe(true);
    expect(light.width).toBeCloseTo(1);
    expect(light.intensity).toBeGreaterThan(0);
    // a glTF copy has no such light
    const glb = copyForExport(room(), { purpose: "gltf" });
    expect(glb.root.getObjectByName("Window light")).toBeUndefined();
  });
  it("is a scene with the live surroundings for the tracer", () => {
    const live = room();
    const env = new Texture();
    live.environment = env;
    const { root } = copyForExport(live, { purpose: "trace" });
    expect(root.isScene).toBe(true);
    expect(root.environment).toBe(env);
  });
  it("makes a window's outside glow", () => {
    const { root } = copyForExport(room(), { purpose: "gltf" });
    const outside = root.getObjectByName("Window outside") as Mesh;
    const m = outside.material as MeshStandardMaterial;
    expect(m.emissiveIntensity).toBeGreaterThan(1);
  });
});
