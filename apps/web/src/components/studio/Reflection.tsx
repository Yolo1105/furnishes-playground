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
  float,
  getParallaxCorrectNormal,
  materialColor,
  mx_noise_float,
  pmremTexture,
  positionWorld,
  reflectVector,
  uniform,
  vec3,
} from "three/tsl";
import {
  CubeRenderTarget,
  MeshStandardNodeMaterial,
  type Node,
  type NodeBuilder,
  TempNode,
  type WebGPURenderer,
} from "three/webgpu";
import { Vector3 } from "three";
import { create } from "zustand";
import { type StillState, stillOf, wakeAt } from "./capture";
import { warming } from "./shader-warm";

/**
 * The room in its floor: one picture of the room taken from its
 * middle, each reflection projected on the room's box so a window or
 * a piece lands on the floor where it stands, filtered by the floor's
 * roughness. The picture is taken again when the room, its pieces or
 * its light change, a moment after the last change.
 */

/** the sides of the room's picture, px */
const CUBE = 256;
/** the floor's slow unevenness: its scale, per m, and how far it
    moves the tone either way */
const FLOOR_VARIATION = { scale: 0.45, depth: 0.07 };
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

/** the room's box the glossy things' reflection is projected on, m:
    its size and its middle, uniforms so a new size moves no shader */
const ROOM_BOX = uniform(new Vector3(1, 1, 1));
const ROOM_MID = uniform(new Vector3(0, 0.5, 0));

/**
 * The room in a glossy thing (a television's glass, a lacquered front,
 * a pane): the floor's picture of the room, box-projected as the floor
 * takes it, so a window lands where it stands. Reflection only: asked
 * for the light a surface gathers from all round (its irradiance, which
 * the environment asks for at the roughest level), it gives none, as
 * the probes already carry the room's bounce and would be counted
 * twice. One node, shared by every glossy material, so they share
 * their shaders too.
 */
class RoomReflectionNode extends TempNode {
  constructor(private readonly picture: CubeRenderTarget["texture"]) {
    super("vec3");
  }
  override setup(builder: NodeBuilder): Node {
    const context = builder.context as {
      getUV?: (node: Node, builder: NodeBuilder) => Node;
      getTextureLevel?: (node: Node) => Node;
    };
    const level = context.getTextureLevel?.(this) as
      (Node & { isConstNode?: boolean; value?: number }) | undefined;
    if (level?.isConstNode && level.value === 1) return vec3(0, 0, 0);
    const direction = context.getUV?.(this, builder) ?? reflectVector;
    const uv = getParallaxCorrectNormal(direction, ROOM_BOX, ROOM_MID);
    return level
      ? pmremTexture(this.picture, uv, level)
      : pmremTexture(this.picture, uv);
  }
}

/** the room's reflection while the room has its picture (the tiers that
    take one), else none: glossy things then reflect the surroundings */
export const useRoomReflection = create<{ node: Node | null }>(() => ({
  node: null,
}));

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
    const node = target ? new RoomReflectionNode(target.texture) : null;
    useRoomReflection.setState({ node });
    return () => {
      if (floorCube.current === target) floorCube.current = null;
      if (useRoomReflection.getState().node === node)
        useRoomReflection.setState({ node: null });
      target?.dispose();
    };
  }, [target]);
  useEffect(() => {
    ROOM_BOX.value.set(w, h, d);
    ROOM_MID.value.set(0, h / 2, 0);
  }, [w, h, d]);
  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    // a slow, faint unevenness across the floor (boards from different
    // trees, a little wear), so its tile never reads as a repeat
    m.colorNode = materialColor.mul(
      float(1).add(
        mx_noise_float(positionWorld.xz.mul(FLOOR_VARIATION.scale)).mul(
          FLOOR_VARIATION.depth,
        ),
      ),
    );
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
  const wake = useRef(0);
  // the wake let go with the component: a stale one would keep wakeAt
  // from setting the next (a fast refresh keeps the refs)
  useEffect(
    () => () => {
      window.clearTimeout(wake.current);
      wake.current = 0;
    },
    [],
  );
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
    // the room's shaders being built hold the renderer's outputs: the
    // picture is taken once they are (the post chain asks for the frame)
    if (warming()) return;
    // a frame is asked for when the wait is over, not drawn each frame
    // of it: the room stood still is drawn once
    if (wakeAt(wake, due.current, state.invalidate)) return;
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
