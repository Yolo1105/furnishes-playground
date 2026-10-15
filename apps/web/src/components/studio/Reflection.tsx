"use client";

import { filteredRoughness } from "./spec-aa";
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
  Vector3,
} from "three";
import {
  float,
  getParallaxCorrectNormal,
  materialColor,
  mix,
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
import { create } from "zustand";
import { PICTURE_FADE_MS, type StillState, stillOf, wakeAt } from "./capture";
import { devFlag } from "./dev-flags";
import { useScene } from "./scene-store";
import { warming } from "./shader-warm";
import { withWallsStanding } from "./walls-standing";

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

/** the room's two pictures: the one shown and the one the next is taken
    into, faded in over it once taken; how much of the second shows */
type Pictures = readonly [CubeRenderTarget, CubeRenderTarget];
const SECOND = uniform(0);
/** the room as its pictures show it along `uv`, at a roughness level or
    the material's own */
const pictured = (pictures: Pictures, uv: Node, level?: Node) =>
  mix(
    level
      ? pmremTexture(pictures[0].texture, uv, level)
      : pmremTexture(pictures[0].texture, uv),
    level
      ? pmremTexture(pictures[1].texture, uv, level)
      : pmremTexture(pictures[1].texture, uv),
    SECOND,
  );

/** the floor's material and, when it reflects, the picture it reflects:
    the room's box (w, h, d) stands on the floor's plane about the origin;
    a floor that does not reflect takes the surroundings like the rest */
/** the floor's pictures of the room, for a mirror that is not the one
    reflector in view (Mirror.tsx) to reflect */
const floorPictures: { current: Pictures | null } = {
  current: null,
};
/** the room as a mirror sees it in the floor's pictures, or none */
export const floorPicture = () => {
  const pictures = floorPictures.current;
  return pictures ? pictured(pictures, reflectVector) : null;
};

/** the room's box the glossy things' reflection is projected on, m:
    its size and its middle, uniforms so a new size moves no shader */
/** the level a material asks an environment at for the light it
    gathers from all round (three's irradiance lookup), not a reflection */
const IRRADIANCE_LEVEL = 1;
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
  constructor(private readonly pictures: Pictures) {
    super("vec3");
  }
  override setup(builder: NodeBuilder): Node {
    const context = builder.context as {
      getUV?: (node: Node, builder: NodeBuilder) => Node;
      getTextureLevel?: (node: Node) => Node;
    };
    const level = context.getTextureLevel?.(this) as
      (Node & { isConstNode?: boolean; value?: number }) | undefined;
    if (level?.isConstNode && level.value === IRRADIANCE_LEVEL)
      return vec3(0, 0, 0);
    const direction = context.getUV?.(this, builder) ?? reflectVector;
    const uv = getParallaxCorrectNormal(direction, ROOM_BOX, ROOM_MID);
    return pictured(this.pictures, uv, level);
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
  const target = useMemo((): Pictures | null => {
    if (!reflects) return null;
    const make = () => {
      const t = new CubeRenderTarget(CUBE, {
        type: HalfFloatType,
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
      });
      t.texture.mapping = CubeReflectionMapping;
      return t;
    };
    return [make(), make()];
  }, [reflects]);
  useEffect(() => {
    floorPictures.current = target;
    const node = target ? new RoomReflectionNode(target) : null;
    useRoomReflection.setState({ node });
    return () => {
      if (floorPictures.current === target) floorPictures.current = null;
      if (useRoomReflection.getState().node === node)
        useRoomReflection.setState({ node: null });
      for (const t of target ?? []) t.dispose();
    };
  }, [target]);
  useEffect(() => {
    ROOM_BOX.value.set(w, h, d);
    ROOM_MID.value.set(0, h / 2, 0);
  }, [w, h, d]);
  const material = useMemo(() => {
    const m = new MeshStandardNodeMaterial();
    // the boards' sheen held still far off, where the grain's bumps are
    // finer than a pixel (spec-aa.ts)
    m.roughnessNode = filteredRoughness;
    // a slow, faint unevenness across the floor (boards from different
    // trees, a little wear), so its tile never reads as a repeat
    // (off for diagnosis with `?nouneven`, dev-flags.ts)
    if (!devFlag("nouneven"))
      m.colorNode = materialColor.mul(
        float(1).add(
          mx_noise_float(positionWorld.xz.mul(FLOOR_VARIATION.scale)).mul(
            FLOOR_VARIATION.depth,
          ),
        ),
      );
    // the room's box as the uniforms hold it (set above), so a change
    // of the room's size builds no shader
    if (target) {
      m.envNode = pictured(
        target,
        getParallaxCorrectNormal(reflectVector, ROOM_BOX, ROOM_MID),
      );
    }
    return m;
  }, [target]);
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
    stillOf(scene, [floor], () =>
      withWallsStanding(() => camera.update(renderer, scene)),
    );
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
  /** the two pictures (useFloorMaterial) */
  target: Pictures;
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
  const cameras = useMemo(
    () => target.map((t) => new CubeCamera(NEAR, FAR, t)),
    [target],
  );
  // which picture shows (SECOND's end), whether any has been taken (the
  // first is shown at once: there is none to fade from), and a fade
  // under way: when it began and the picture it brings in
  const shown = useRef<0 | 1>(0);
  const taken = useRef(false);
  const fade = useRef<{ from: number; into: 0 | 1 } | null>(null);
  useEffect(() => {
    shown.current = 0;
    taken.current = false;
    fade.current = null;
    SECOND.value = 0;
  }, [target]);
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
  }, [cameras, stamp, invalidate, onState]);
  useFrame((state) => {
    // a new picture fading in: the share of the second follows the time
    const f = fade.current;
    if (f) {
      const t = Math.min(1, (performance.now() - f.from) / PICTURE_FADE_MS);
      SECOND.value = f.into === 1 ? t : 1 - t;
      if (t < 1) state.invalidate();
      else {
        fade.current = null;
        shown.current = f.into;
        onState("ready");
      }
    }
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
    // a piece in hand: its six faces are not taken mid-drag (a pause in
    // a drag stalled the hand for them); the drop is a change of its
    // own, and the picture follows it
    if (useScene.getState().dragFrom !== null) {
      due.current = performance.now() + SETTLE_MS;
      return;
    }
    // a frame is asked for when the wait is over, not drawn each frame
    // of it: the room stood still is drawn once
    if (wakeAt(wake, due.current, state.invalidate)) return;
    due.current = 0;
    // a fade under way ends where it was going: the next comes over it
    if (fade.current) {
      shown.current = fade.current.into;
      SECOND.value = shown.current;
      fade.current = null;
    }
    // the first picture into the one shown; each after into the other,
    // faded in over it
    const into = (taken.current ? 1 - shown.current : shown.current) as 0 | 1;
    const camera = cameras[into]!;
    camera.position.set(0, h / 2, 0);
    take(
      state.gl as unknown as WebGPURenderer,
      state.scene,
      camera,
      floor.current,
    );
    if (taken.current) {
      fade.current = { from: performance.now(), into };
    } else {
      taken.current = true;
      onState("ready");
    }
    state.invalidate();
  });
  return null;
}
