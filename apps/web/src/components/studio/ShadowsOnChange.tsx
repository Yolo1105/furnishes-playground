"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useScene } from "./scene-store";
import type {
  Light,
  LightShadow,
  Material,
  Mesh,
  Object3D,
  Texture,
} from "three";

/** a light that casts, with its shadow; or one of the sun's cascades
    (Sun.tsx), a stand-in with a shadow but no light of its own */
type Caster = Light & { shadow: LightShadow };

/** a number that changes when anything a shadow map shows changes:
    each caster's place, size and turn in the world, whether it is
    shown, the layers it is drawn on, its geometry and what its
    materials cut out of it; each casting light's place and its shadow
    camera's box */
const signatureOf = (scene: Object3D, lights: Caster[], camera: Object3D) => {
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
  // the cascades follow the camera: their maps change as it moves
  if (lights.some((l) => !l.isLight))
    for (const e of camera.matrixWorld.elements) add(e * 1000);
  for (const l of lights) {
    add(l.id);
    add(l.castShadow ? 1 : 2);
    add(l.intensity > 0 ? 1 : 2);
    for (const e of l.matrixWorld.elements) add(e * 1000);
    const c = l.shadow.camera as unknown as Record<string, number>;
    for (const k of ["left", "right", "top", "bottom", "near", "far"])
      add((c[k] ?? 0) * 1000);
    add(l.shadow.mapSize.x);
  }
  return sum;
};

/** under a drag, the least time between two drawings of the maps, ms:
    each is every caster in the flat into every casting light (a lamp's
    six faces among them), a stall the hand felt five times a second */
const DRAG_EVERY_MS = 450;

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
  const drawnAt = useRef(0);
  const dragging = useRef(false);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    const off = useScene.subscribe((s) => {
      dragging.current = s.dragFrom !== null;
    });
    return () => {
      off();
      if (pending.current !== null) window.clearTimeout(pending.current);
    };
  }, []);
  useFrame(({ scene, camera, invalidate }) => {
    // under a drag the maps follow a few times a second, not every
    // frame: each drawing is every caster in the flat, and drawn on
    // every frame of a drag it was what made a drag heavy; the frame
    // after the drag ends (and a frame asked for here) catches up
    const at = performance.now();
    const wait = drawnAt.current + DRAG_EVERY_MS - at;
    if (dragging.current && wait > 0) {
      // one frame asked for when the wait is over, for a piece held
      // still mid-drag
      pending.current ??= window.setTimeout(() => {
        pending.current = null;
        invalidate();
      }, wait);
      return;
    }
    const lights: Caster[] = [];
    scene.traverse((o) => {
      const l = o as Caster;
      if ((l.isLight || l.castShadow) && l.shadow) {
        l.shadow.autoUpdate = false;
        lights.push(l);
      }
    });
    scene.updateMatrixWorld();
    const now = signatureOf(scene, lights, camera);
    if (now === last.current) return;
    last.current = now;
    drawnAt.current = at;
    // a light that is off (a lamp by day: it stays in the scene at
    // nothing, so its coming on builds no shader) keeps its map as it
    // stands: a lamp's is six pictures of every caster in the flat,
    // drawn for nothing at every change of the day
    for (const l of lights)
      l.shadow.needsUpdate = !l.isLight || l.intensity > 0;
  });
  return null;
}
