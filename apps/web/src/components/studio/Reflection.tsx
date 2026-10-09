"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import {
  CubeCamera,
  CubeReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Mesh,
  type Scene,
  type Texture,
} from "three";
import {
  getParallaxCorrectNormal,
  pmremTexture,
  reflectVector,
  vec3,
} from "three/tsl";
import {
  CubeRenderTarget,
  MeshStandardNodeMaterial,
  type WebGPURenderer,
} from "three/webgpu";
import { type StillState, stillOf } from "./capture";

/**
 * The room in its floor: one picture of the room taken from its
 * middle, each reflection projected on the room's box so a window or
 * a piece lands on the floor where it stands, filtered by the floor's
 * roughness. The picture is taken again when the room, its pieces or
 * its light change, a moment after the last change.
 */

/** the sides of the room's picture, px */
const CUBE = 256;
/** a change waits this long before the picture is taken again, ms */
const SETTLE_MS = 400;
/** how near and how far the picture sees, m */
const NEAR = 0.05;
const FAR = 50;

/** the floor's material and, when it reflects, the picture it reflects:
    the room's box (w, h, d) stands on the floor's plane about the origin;
    a floor that does not reflect takes the surroundings like the rest */
/** the floor's picture of the room, for a mirror that is not the one
    reflector in view (Mirror.tsx) to reflect */
export const floorCube: { current: CubeRenderTarget | null } = {
  current: null,
};

export const useFloorMaterial = (
  w: number,
  h: number,
  d: number,
  reflects: boolean,
) => {
  const target = useMemo(() => {
    if (!reflects) return null;
    const t = new CubeRenderTarget(CUBE, {
      type: HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
    });
    t.texture.mapping = CubeReflectionMapping;
    return t;
  }, [reflects]);
  useEffect(() => {
    floorCube.current = target;
    return () => {
      if (floorCube.current === target) floorCube.current = null;
      target?.dispose();
    };
  }, [target]);
  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    if (target) {
      m.envNode = pmremTexture(
        target.texture,
        getParallaxCorrectNormal(
          reflectVector,
          vec3(w, h, d),
          vec3(0, h / 2, 0),
        ),
      );
    }
    return m;
  }, [target, w, h, d]);
  useEffect(() => () => material.dispose(), [material]);
  return { material, target };
};

/** the picture taken: the floor out of it, the surroundings in through
    the open top, then the filtered copy the floor samples is made anew */
const take = (
  renderer: WebGPURenderer,
  scene: Scene,
  camera: CubeCamera,
  floor: Mesh | null,
) => {
  const background = scene.background;
  scene.background = scene.environment;
  try {
    stillOf(scene, [floor], () => camera.update(renderer, scene));
  } finally {
    scene.background = background;
  }
  camera.renderTarget.texture.pmremVersion++;
};

export function FloorReflection({
  target,
  floor,
  h,
  stamp,
  onState,
}: {
  target: CubeRenderTarget;
  /** the floor, kept out of its own picture */
  floor: RefObject<Mesh | null>;
  /** the room's height: the picture is taken from mid-height */
  h: number;
  /** what the picture shows: a change here takes it again */
  stamp: string;
  /** whether a picture is on its way or the floor shows the last change */
  onState: (state: StillState) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useMemo(() => new CubeCamera(NEAR, FAR, target), [target]);
  const due = useRef(0);
  const seen = useRef<Texture | null>(null);
  useEffect(() => {
    due.current = performance.now() + SETTLE_MS;
    onState("pending");
    invalidate();
  }, [camera, stamp, invalidate, onState]);
  useFrame((state) => {
    // the surroundings arrive on their own time: a new map starts over
    if (state.scene.environment !== seen.current) {
      seen.current = state.scene.environment;
      due.current = performance.now() + SETTLE_MS;
      onState("pending");
    }
    if (!due.current) return;
    if (performance.now() < due.current) {
      state.invalidate();
      return;
    }
    due.current = 0;
    camera.position.set(0, h / 2, 0);
    take(
      state.gl as unknown as WebGPURenderer,
      state.scene,
      camera,
      floor.current,
    );
    onState("ready");
    state.invalidate();
  });
  return null;
}
