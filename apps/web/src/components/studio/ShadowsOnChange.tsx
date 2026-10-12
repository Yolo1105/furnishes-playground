"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type {
  Light,
  LightShadow,
  Material,
  Mesh,
  Object3D,
  Texture,
} from "three";

/** a light that casts, with its shadow */
type Caster = Light & { shadow: LightShadow };

/** a number that changes when anything a shadow map shows changes:
    each caster's place, size and turn in the world, whether it is
    shown, the layers it is drawn on, its geometry and what its
    materials cut out of it; each casting light's place and its shadow
    camera's box */
const signatureOf = (scene: Object3D, lights: Caster[]) => {
  let sum = 0;
  let n = 0;
  const add = (v: number) => {
    // a running sum weighted by the position in the walk, so two
    // changes that cancel in a plain sum still show
    n += 1;
    sum = (sum + v * ((n % 997) + 1)) % 1e9;
  };
  scene.traverseVisible((o) => {
    const m = o as Mesh;
    if (!m.castShadow || !m.isMesh) return;
    add(m.id);
    add(m.layers.mask);
    for (const e of m.matrixWorld.elements) add(e * 1000);
    // the shape it casts: its geometry, changed in place too, and what
    // its materials cut out of it (a leaf's alpha, a side, an opacity),
    // which change as their pictures arrive
    const g = m.geometry;
    add(g.id);
    add(
      (g.attributes.position as { version?: number } | undefined)?.version ?? 0,
    );
    add(g.index?.version ?? 0);
    add(g.drawRange.count);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const t = mat as Material & {
        id: number;
        map?: Texture | null;
        alphaMap?: Texture | null;
      };
      add(t.id);
      add(t.version);
      add(t.side);
      add(t.alphaTest * 1000);
      add(t.opacity * 1000);
      add(t.visible ? 1 : 2);
      for (const tex of [t.map, t.alphaMap]) {
        add(tex?.id ?? 0);
        add(tex?.version ?? 0);
      }
    }
  });
  for (const l of lights) {
    add(l.id);
    add(l.castShadow ? 1 : 2);
    for (const e of l.matrixWorld.elements) add(e * 1000);
    const c = l.shadow.camera as unknown as Record<string, number>;
    for (const k of ["left", "right", "top", "bottom", "near", "far"])
      add((c[k] ?? 0) * 1000);
    add(l.shadow.mapSize.x);
  }
  return sum;
};

/**
 * The shadow maps drawn when what they show changes, not every frame.
 * A light's shadow map was drawn again for every frame and for every
 * camera that frame drew with (the probes' bake and the floor's picture
 * draw with their own), every caster in the flat each time, though a
 * move of the camera changes nothing in it. Each frame now reads the
 * casters and the casting lights as one number; the maps are drawn
 * again on the frame it changes (a piece moved, turned, added or taken
 * out, a model arrived, a wall cut for the camera, the sun moved) and
 * stand as they are otherwise.
 */
export function ShadowsOnChange() {
  const last = useRef<number | null>(null);
  useFrame(({ scene }) => {
    const lights: Caster[] = [];
    scene.traverse((o) => {
      const l = o as Caster;
      if (l.isLight && l.shadow) {
        l.shadow.autoUpdate = false;
        lights.push(l);
      }
    });
    scene.updateMatrixWorld();
    const now = signatureOf(scene, lights);
    if (now === last.current) return;
    last.current = now;
    for (const l of lights) l.shadow.needsUpdate = true;
  });
  return null;
}
