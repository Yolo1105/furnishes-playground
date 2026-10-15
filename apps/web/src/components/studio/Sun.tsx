"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  MathUtils,
  type Camera,
  type DirectionalLight,
  type Light,
  type PerspectiveCamera,
  type Vector3Tuple,
} from "three";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import {
  float,
  Fn,
  If,
  lightShadowMatrix,
  positionWorld,
  vec4,
} from "three/tsl";
import type { Node, NodeBuilder, NodeFrame } from "three/webgpu";
import { settlingPCF } from "./shadow-filter";
import { SHADOW_LAYER } from "./walls-standing";

/** how far from the flat's middle the sun's light stands, m, and the
    evening's hour (the sun at dusk, a few degrees over the horizon);
    the one map's bias, m */
export const SUN = { distance: 30, dusk: 18.8, bias: 0.003 };
/** the sun's one map, px, and its soft edge, texels */
const MAP = 2048;
const SOFT = 3;

/** the sun's cascades: how many follow the camera, and how far from it
    they reach, m (a room from any of its views); how far behind each
    one's box its shadow camera stands, m (any caster between the sun and
    the box: the flat is a storey high); and how near the edge of a
    cascade's map a pixel may fall and still be read from it, a share of
    the map (the soft edge's samples stay on it) */
export const CASCADES = {
  following: 2,
  far: 12,
  margin: 40,
  edge: 0.01,
} as const;
/** the maps in all: those following the camera, and one over the flat */
export const CASCADE_MAPS = CASCADES.following + 1;
/** the near plane of a following cascade's shadow camera, m */
const CASCADE_NEAR = 0.5;

/** the splits of the reach between the following cascades, as shares of
    the far end: halfway between even and logarithmic (CSM's own
    "practical"), the last one to the far end; the cascade over the flat
    takes no share of it */
const splits = (
  _cascades: number,
  near: number,
  far: number,
  breaks: number[],
) => {
  for (let i = 1; i < CASCADES.following; i++) {
    const even = near + ((far - near) * i) / CASCADES.following;
    const log = near * (far / near) ** (i / CASCADES.following);
    breaks.push(MathUtils.lerp(even, log, 0.5) / far);
  }
  breaks.push(1, 1);
};

/** a shadow with its own soft edge (shadow-filter.ts), which a cascade
    made from the sun's shadow does not take with it */
type Filtered = { filterNode?: unknown };
type Cascade = CSMShadowNode["lights"][number] & {
  shadow: DirectionalLight["shadow"];
};

/**
 * The sun's cascades, each picture's pixel reading the finest whose map
 * holds it, the last standing over the whole flat as the one map did.
 * three's own node (r186 `CSMShadowNode`) picks a cascade by the pixel's
 * depth from the camera it was made for; a probe's picture, the floor's
 * and a mirror's are taken by cameras of their own, whose pixels it
 * read from a cascade that never held them, and the sun came through
 * the walls in them. Read by where a pixel falls in each map, the
 * cascades serve any camera, with no light swapped and no shader built
 * again for the pictures.
 */
class Cascades extends CSMShadowNode {
  constructor(light: DirectionalLight) {
    super(light, {
      cascades: CASCADE_MAPS,
      maxFar: CASCADES.far,
      mode: "custom",
      lightMargin: CASCADES.margin,
      customSplitsCallback: splits,
    });
  }
  private get sun() {
    return this.light as DirectionalLight;
  }
  private get cascadeLights() {
    return this.lights as Cascade[];
  }
  /** the following cascades see from their stand back to past their
      box's far side, with the one map's bias in metres, a cascade's
      texels as wide again for each step out; the last stands where the
      sun does with the one map's box, soft edge and bias */
  private place() {
    const sun = this.sun;
    const one = sun.shadow.camera;
    const metres = -sun.shadow.bias * (one.far - one.near);
    const all = this.cascadeLights;
    all.forEach((lw, i) => {
      (lw.shadow as Filtered).filterNode = (sun.shadow as Filtered).filterNode;
      const c = lw.shadow.camera;
      c.layers.mask = one.layers.mask;
      if (i < CASCADES.following) {
        c.near = CASCADE_NEAR;
        c.far = CASCADES.margin + 2 * CASCADES.far;
        lw.shadow.bias = (-metres * (i + 1)) / (c.far - c.near);
      } else {
        c.left = one.left;
        c.right = one.right;
        c.top = one.top;
        c.bottom = one.bottom;
        c.near = one.near;
        c.far = one.far;
        lw.shadow.bias = sun.shadow.bias;
        lw.position.setFromMatrixPosition(sun.matrixWorld);
        lw.target.position.setFromMatrixPosition(sun.target.matrixWorld);
        lw.updateMatrixWorld();
        lw.target.updateMatrixWorld();
      }
      c.updateProjectionMatrix();
    });
  }
  override setup(builder: NodeBuilder) {
    this.place();
    return super.setup(builder);
  }
  override updateFrustums() {
    super.updateFrustums();
    this.place();
  }
  override updateBefore(frame: NodeFrame) {
    const done = super.updateBefore(frame);
    this.place();
    return done;
  }
  /** the pixel's shadow from the finest cascade whose map holds it */
  _setupStandard() {
    const edge = CASCADES.edge;
    const nodes = (this as unknown as { _shadowNodes: Node<"vec4">[] })
      ._shadowNodes;
    const matrices = this.cascadeLights.map((lw) =>
      lightShadowMatrix(lw as unknown as Light),
    );
    const last = matrices.length - 1;
    return Fn((builder: NodeBuilder) => {
      (
        this as unknown as { setupShadowPosition: (b: NodeBuilder) => void }
      ).setupShadowPosition(builder);
      const shadow = vec4(1, 1, 1, 1).toVar("shadowValue");
      const found = float(0).toVar("cascadeFound");
      matrices.forEach((m, i) => {
        // the cascades' cameras are orthographic: no divide by w
        const at = m.mul(vec4(positionWorld, 1)).xy;
        const held =
          i === last
            ? found.equal(0)
            : found
                .equal(0)
                .and(at.x.greaterThan(edge))
                .and(at.x.lessThan(1 - edge))
                .and(at.y.greaterThan(edge))
                .and(at.y.lessThan(1 - edge));
        If(held, () => {
          shadow.assign(nodes[i]!);
          found.assign(1);
        });
      });
      return shadow;
    })();
  }
}

/** each light's cascades, made for the picture's camera of the moment
    (the node otherwise takes the camera of whatever builds it first, a
    probe's or the floor's) and kept for the light's life: its shaders
    keep the shadow node they were first built with, so one made again
    was in no shader and the one they held went with its maps, and the
    sun stood without a shadow. An effect's cleanup is no light's end (a
    tree that suspends again is hidden, its effects run out and in, its
    light kept), so they go when the light does: R3F disposes a light
    it takes out */
const made = new WeakMap<DirectionalLight, Cascades>();
const cascadesOf = (
  l: DirectionalLight,
  camera: Camera,
  renderer: unknown,
): Cascades => {
  const kept = made.get(l);
  if (kept) return kept;
  const csm = new Cascades(l);
  (
    csm as unknown as {
      _init: (b: { camera: Camera; renderer: unknown }) => void;
    }
  )._init({ camera, renderer });
  (l.shadow as unknown as { shadowNode: Cascades }).shadowNode = csm;
  made.set(l, csm);
  const own = l.dispose.bind(l);
  l.dispose = () => {
    csm.dispose();
    made.delete(l);
    own();
  };
  return csm;
};

/** the sun aimed at the flat's middle, its one map's box round the whole
    flat and the room's shadow layer in it (the ceiling that stops it at
    the open top, a near wall taken out of the picture), its bias in
    metres and its edge settling smooth (shadow-filter.ts) */
const aim = (
  l: DirectionalLight,
  [x, z]: readonly [number, number],
  reach: number,
) => {
  l.target.position.set(x, 0, z);
  l.target.updateMatrixWorld();
  const c = l.shadow.camera;
  c.layers.enable(SHADOW_LAYER);
  c.left = -reach;
  c.right = reach;
  c.top = reach;
  c.bottom = -reach;
  c.near = Math.max(0.5, SUN.distance - reach - 3);
  c.far = SUN.distance + reach + 3;
  c.updateProjectionMatrix();
  l.shadow.bias = -SUN.bias / (c.far - c.near);
  (l.shadow as { filterNode?: unknown }).filterNode = settlingPCF;
  l.shadow.needsUpdate = true;
};

/**
 * The sun: one light for the flat, its shadow in one map, or on the
 * desktop tier in cascades (round 8, Part 5). One map over the whole flat
 * gave a vase or a book a shadow a few texels across, soft to nothing;
 * two maps split along the view near the camera give the near things
 * their own (each snapped to its texels, so its edges hold still as the
 * camera moves), and a third over the flat holds the rest and every
 * picture taken from elsewhere (`Cascades`). The splits follow the
 * picture's camera and lens (a Corner view narrows it).
 *
 * The light, its aim and its cascades are set up here, in that order, as
 * the light is made and before any frame builds a shader with it: the
 * light's shaders keep the shadow node they were first built with, so a
 * node made again later (for a new camera) was in no shader, the one
 * they held was let go with its maps, and the sun stood without a
 * shadow; and set up from the scene above, a light made after it was
 * never aimed. The caller mounts it afresh (a key) when `cascaded`
 * changes, so the shaders are built again with the cascades or without.
 */
export function Sun({
  from,
  centre,
  reach,
  intensity,
  colour,
  cascaded,
  soft,
}: {
  /** where the light stands, m */
  from: Vector3Tuple;
  /** the flat's middle on the floor, m (x, z) */
  centre: readonly [number, number];
  /** the half-width of the one map's box, m */
  reach: number;
  intensity: number;
  colour: string;
  cascaded: boolean;
  soft: boolean;
}) {
  const light = useRef<DirectionalLight>(null);
  const get = useThree((s) => s.get);
  const [cx, cz] = centre;
  useLayoutEffect(() => {
    if (light.current) aim(light.current, [cx, cz], reach);
    get().invalidate();
  }, [cx, cz, reach, get]);
  // the cascades made once for the light's life (cascadesOf)
  const node = useRef<Cascades | null>(null);
  useLayoutEffect(() => {
    const l = light.current;
    if (!l || !cascaded) return;
    const { gl, camera, invalidate } = get();
    node.current = cascadesOf(l, camera, gl);
    invalidate();
    return () => {
      node.current = null;
    };
  }, [cascaded, get]);
  // the camera and its lens as the cascades were last split for
  const lens = useRef("");
  useFrame(({ camera }) => {
    const csm = node.current;
    if (!csm) return;
    const c = camera as PerspectiveCamera;
    const now = `${c.uuid}:${c.fov}:${c.aspect}:${c.near}:${c.far}`;
    if (now === lens.current) return;
    lens.current = now;
    csm.camera = camera;
    csm.updateFrustums();
  });
  return (
    <directionalLight
      ref={light}
      position={from}
      intensity={intensity}
      color={colour}
      castShadow
      shadow-mapSize={[MAP, MAP]}
      shadow-radius={soft ? SOFT : 0}
      shadow-normalBias={0.02}
    />
  );
}
