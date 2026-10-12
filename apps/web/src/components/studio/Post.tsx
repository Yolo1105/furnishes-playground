"use client";

import { recordPost } from "./bench";
import { devFlag } from "./dev-flags";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  NeutralToneMapping,
  type Camera,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  SRGBColorSpace,
  Vector2,
  Vector4,
} from "three";
import type { Node, PassNode, TextureNode } from "three/webgpu";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { ssgi } from "three/examples/jsm/tsl/display/SSGINode.js";
import { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import {
  float,
  Fn,
  max,
  metalness,
  mix,
  mrt,
  normalView,
  output,
  pass,
  pow,
  renderOutput,
  roughness,
  rtt,
  screenUV,
  smoothstep,
  toneMappingExposure,
  uniform,
  vec2,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";
import { wakeAt } from "./capture";
import { lightingKey, probesPending, unwarmed, warmParts } from "./shader-warm";
import type { Backend, Quality } from "./studio-store";

/**
 * The picture after the scene is drawn: ambient occlusion (the dark
 * seam where a piece meets the floor or a wall, from the depth the
 * scene pass keeps) laid over the lighting, the frame tone-mapped and
 * set on the page's own backdrop, and the edges resolved over frames
 * (TRAA), all through three's render pipeline. A desktop draws the
 * occlusion at full size, a laptop at half, and a phone skips it and
 * smooths its edges in one pass (SMAA). Every frame is guarded: should
 * a stage fail on a device, the room is drawn plain and the stage says
 * so.
 */
export type Tier = "desktop" | "laptop" | "phone";
/** how long the shaders built ahead may hold the picture, ms: the room's
    first picture, behind the loading line, and a change to a room on
    show; past it the rest are built as they are drawn */
const OPEN_BUDGET_MS = 6_000;
/** how long the first picture waits on the probes' first bake, ms; past
    it the room is drawn without them, and built again when they come
    (the lighting key notes the grid's picture) */
const PROBE_WAIT_MS = 1_500;
const CHANGE_BUDGET_MS = 3_000;
/** the scene's shaders: being built ahead of the first frame, or ready */
export type ShaderState = "building" | "ready";

/** the tone mapping of the picture: Khronos PBR Neutral keeps a white
    wall white and a colour its own (AgX, before it, laid a grey over
    every pale surface: the flat read grey however warm its paint) */
export const TONE_MAPPING = NeutralToneMapping;

/** the memory a browser that does not say is taken to have, GB */
const MEMORY_UNSAID = 8;
/** a fine pointer with WebGPU and this much memory is a desktop */
const DESKTOP_GB = 8;

/** the tier a device gets on its own: a finger means a phone or a
    tablet, and so does a software GPU; WebGPU with enough memory a
    desktop; the rest a laptop. View settings can pick one instead, or
    none (plain: the room as drawn) */
export const tierOf = (
  quality: Quality,
  coarse: boolean,
  backend: Backend,
): Tier | null => {
  if (quality === "full") return "desktop";
  if (quality === "light") return "laptop";
  if (quality === "plain") return null;
  if (coarse || backend === "software") return "phone";
  const memory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
    MEMORY_UNSAID;
  return backend === "webgpu" && memory >= DESKTOP_GB ? "desktop" : "laptop";
};

/** the tiers from the most the picture does to the least */
const TIERS: readonly Tier[] = ["desktop", "laptop", "phone"];
/** a tier taken `steps` down, never below the phone's: a device whose
    frames came slow while the camera moved is given a lighter picture */
export const tierBelow = (tier: Tier | null, steps: number): Tier | null =>
  tier === null
    ? null
    : TIERS[
        Math.min(TIERS.indexOf(tier) + Math.max(0, steps), TIERS.length - 1)
      ]!;

/** which backend a renderer came up on, and whether its GPU is a
    software one (SwiftShader, llvmpipe), which gets the phone's tier */
/** the largest side a texture can have on the device, px, read from
    the WebGPU device's limits or the WebGL context */
export const textureSideOf = (renderer: unknown): number => {
  const r = renderer as {
    backend?: {
      device?: { limits?: { maxTextureDimension2D?: number } };
      gl?: WebGL2RenderingContext;
    };
  };
  const gpu = r.backend?.device?.limits?.maxTextureDimension2D;
  if (gpu) return gpu;
  const gl = r.backend?.gl;
  const side = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0;
  return side > 0 ? side : 4096;
};

export const backendOf = (renderer: unknown): Backend => {
  const r = renderer as {
    backend?: { isWebGPUBackend?: boolean; gl?: WebGL2RenderingContext };
  };
  if (r.backend?.isWebGPUBackend) return "webgpu";
  const gl = r.backend?.gl;
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  const name = info
    ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : "";
  return /swiftshader|llvmpipe|software/i.test(name) ? "software" : "webgl";
};

/** the occlusion's reach, m, and how dark it goes */
const AO = { radius: 0.6, scale: 1.4 };
/** the desktop extras: screen-space reflections and bounce light,
    each behind a View setting (Reflections, Bounce light) */
export type Effects = { reflections: boolean; bounce: boolean };
export type EffectState = "on" | "off" | "unsupported";
export type EffectStates = { ssr: EffectState; ssgi: EffectState };
export const EFFECTS_OFF: EffectStates = { ssr: "off", ssgi: "off" };
/** the reflections' reach, m, how thick a surface is taken to be for a
    hit, m, their share of the picture, and the share of the stage's
    size they are traced at */
const SSR = { maxDistance: 6, thickness: 0.05, intensity: 0.6, scale: 0.5 };
/** a glossy dielectric reflects too: its weight is this much of its
    glossiness squared (a metal's is its metalness) */
const SSR_GLOSS = 0.35;
/** the bounce light: slices and steps a pixel (the node's medium
    preset with temporal filtering), its reach, m, and the share of it
    laid over the picture (conservative; the bench judges more) */
const SSGI = { slices: 2, steps: 8, radius: 2.5, share: 0.5 };
/** the bytes a sample of colour attachments must hold for the scene
    pass with its normals and material beside the colour and motion:
    four half-float attachments, packed (the bounce light needs no
    more than the reflections do); WebGPU's floor is this much */
export const MRT_BYTES = 32;
/** the frames a still picture takes to settle: TRAA blends each new
    frame into its history, so a change is followed by this many more */
const SETTLE_FRAMES = 16;

/** a colour as CSS computes it, `rgb(r, g, b)`, as three fractions */
const rgbOf = (css: string) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(css);
  return m ? m.slice(1, 4).map((c) => Number(c) / 255) : null;
};

/** the page behind the room: the body's gradient, fixed to the window,
    read from the computed style so its colours stay the design's; a
    page that paints something else gives its flat colour */
type Backdrop = {
  angle: number;
  stops: { at: number; rgb: number[] }[];
};
const backdropOf = (): Backdrop => {
  const body = getComputedStyle(document.body);
  const m = /^linear-gradient\((-?[\d.]+)deg,\s*(.+)\)$/.exec(
    body.backgroundImage,
  );
  const stops = m
    ? [...m[2]!.matchAll(/(rgba?\([^)]+\))\s*([\d.]+)%/g)].flatMap((s) => {
        const rgb = rgbOf(s[1]!);
        return rgb ? [{ at: Number(s[2]) / 100, rgb }] : [];
      })
    : [];
  if (m && stops.length >= 2) return { angle: Number(m[1]), stops };
  const flat = rgbOf(body.backgroundColor) ??
    rgbOf(getComputedStyle(document.documentElement).backgroundColor) ?? [
      0, 0, 0,
    ];
  return { angle: 0, stops: [{ at: 0, rgb: flat }] };
};

/** where the canvas sits in the window, CSS px (x, y, width, height),
    and the window's size: the backdrop is drawn from the page's frame */
type Place = { canvas: Vector4; window: Vector2 };

/** the backdrop as CSS would paint it under the canvas: the gradient
    line through the window's middle at its angle, the stops mixed in
    turn, in the page's own (sRGB) values */
const backdropNode = (b: Backdrop, place: Place): Node<"vec3"> => {
  const canvas = uniform(place.canvas);
  const window = uniform(place.window);
  return Fn(() => {
    const rad = (b.angle * Math.PI) / 180;
    const dir = vec2(Math.sin(rad), -Math.cos(rad));
    const length = window.x
      .mul(Math.abs(Math.sin(rad)))
      .add(window.y.mul(Math.abs(Math.cos(rad))))
      .max(1);
    const at = canvas.xy.add(screenUV.mul(canvas.zw));
    const t = at.sub(window.mul(0.5)).dot(dir).div(length).add(0.5);
    let colour: Node<"vec3"> = vec3(...b.stops[0]!.rgb);
    for (let i = 1; i < b.stops.length; i++) {
      const from = b.stops[i - 1]!.at;
      const span = Math.max(b.stops[i]!.at - from, 1e-6);
      colour = mix(
        colour,
        vec3(...b.stops[i]!.rgb),
        t.sub(from).div(span).clamp(),
      );
    }
    return colour;
  })();
};

/** the windows' glow into the frame (the desktop tier): only what is
    well past white after the exposure blooms, faintly, so the glass
    and the sun's patch shine a little and nothing else does (at a
    threshold of 1 a room exposed for its walls hazed over: its white
    walls stand past 1 too) */
const GLOW = { strength: 0.06, radius: 0.2, threshold: 2 };
/** a lens's fall-off at the frame's corners, a share of the light */
const VIGNETTE = { depth: 0.065, from: 0.4, to: 0.72 };

/** the scene pass darkened by the occlusion where there is one,
    tone-mapped and laid over the backdrop: the frame as the page shows
    it, opaque, which the edge passes then resolve. The room's silhouette
    is where the depth pass wrote (the pass's own alpha cannot be read
    beside another texture on the WebGL backend); TRAA's jitter softens
    that edge over the settle frames */
const frameOf = (
  scenePass: PassNode,
  depth: TextureNode,
  occlusion: Node<"float"> | null,
  backdrop: Node<"vec3">,
  /** light added before the tone mapping: reflections, bounce */
  added: Node<"vec3"> | null = null,
  /** the windows' glow (the desktop tier) */
  glows = false,
) => {
  const shaded = occlusion ? scenePass.rgb.mul(occlusion) : scenePass.rgb;
  const lit = added ? shaded.add(added) : shaded;
  // the glow is found in the exposed picture and handed back unexposed,
  // so the tone mapping takes it with the rest
  // the renderer's exposure as a float node (its reference is typed
  // apart from the float the arithmetic takes)
  const exposure = toneMappingExposure as unknown as Node<"float">;
  const glow = glows
    ? bloom(
        vec4(lit.mul(exposure), 1),
        GLOW.strength,
        GLOW.radius,
        GLOW.threshold,
      )
    : null;
  const withGlow = glow ? lit.add(glow.rgb.div(exposure)) : lit;
  // the lens darkens the room's corners a little, not the page behind
  const lens = float(1).sub(
    smoothstep(VIGNETTE.from, VIGNETTE.to, screenUV.sub(0.5).length()).mul(
      VIGNETTE.depth,
    ),
  );
  const frame = rtt(
    vec4(
      mix(
        backdrop,
        renderOutput(vec4(withGlow, 1), TONE_MAPPING, SRGBColorSpace).rgb.mul(
          lens,
        ),
        depth.r.lessThan(1).select(1, 0),
      ),
      1,
    ),
  );
  return { frame, glow };
};

type Chain = {
  render: () => void;
  /** the parts' shaders built for the scene pass ahead of the frame
      that draws them (shader-warm.ts), for at most `budget` ms */
  warm: (parts: readonly Object3D[], budget: number) => Promise<void>;
  dispose: () => void;
  place: Place;
  /** whether the picture is built over frames and needs them to settle */
  temporal: boolean;
  /** which of the desktop extras the chain draws */
  fx: EffectStates;
};

/** the passes for a tier, in three's render pipeline: the scene drawn
    once, its depth and motion kept beside the colour */
const build = (
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  tier: Tier,
  effects: Effects,
  bytesPerSample: number,
): Chain => {
  const pipeline = new RenderPipeline(renderer);
  // the frame carries the page's values already: nothing more at the end
  pipeline.outputColorTransform = false;
  const place: Place = { canvas: new Vector4(), window: new Vector2() };
  const backdrop = backdropNode(backdropOf(), place);
  const scenePass = pass(scene, camera);
  // no multisampling under the passes: TRAA resolves the edges, and SMAA
  // does the phone's
  scenePass.options.samples = 0;
  const depth = scenePass.getTextureNode("depth");
  // every tier draws a frame and builds the scene's shaders alike: the
  // frame timed for the bench, the shaders for the scene pass
  const render = () => {
    const t0 = performance.now();
    pipeline.render();
    recordPost(performance.now() - t0);
  };
  const warm: Chain["warm"] = (parts, budget) =>
    warmParts(renderer, scenePass, parts, scene, camera, budget);
  if (tier === "phone") {
    const { frame } = frameOf(scenePass, depth, null, backdrop);
    const edges = smaa(frame);
    pipeline.outputNode = edges;
    return {
      render,
      warm,
      dispose: () => {
        edges.dispose();
        frame.dispose();
        scenePass.dispose();
        pipeline.dispose();
      },
      place,
      temporal: false,
      fx: EFFECTS_OFF,
    };
  }
  // the desktop extras need the scene's normals and its material beside
  // the colour and the motion: the normal with the metalness in its
  // fourth channel, the roughness in the motion's third, so the pass
  // stays within the bytes a sample may hold on any device
  const extras = tier === "desktop" && (effects.reflections || effects.bounce);
  const fits = bytesPerSample >= MRT_BYTES;
  const wantSsr = extras && effects.reflections && fits;
  const wantSsgi = extras && effects.bounce && fits;
  if (extras && fits)
    scenePass.setMRT(
      mrt({
        output,
        velocity: vec4(velocity as unknown as Node<"vec2">, roughness, 0),
        normal: vec4(normalView, metalness),
      }),
    );
  else scenePass.setMRT(mrt({ output, velocity }));
  // the occlusion from the depth alone (its normals are read back from
  // it), so the room is drawn once a frame
  // the occlusion can be switched off for diagnosis (dev-flags.ts)
  const occlusion = devFlag("noao")
    ? null
    : ao(depth, null as unknown as Node, camera);
  if (occlusion) {
    occlusion.resolutionScale = tier === "desktop" ? 1 : 0.5;
    occlusion.radius.value = AO.radius;
    occlusion.scale.value = AO.scale;
    occlusion.useTemporalFiltering = true;
  }
  // the reflections: a single mirror ray a pixel, softened by the
  // roughness, on metals by their metalness and on glossy dielectrics
  // (the satin panels, the floor) by their glossiness; added before the
  // tone mapping. The floor's own box-projected picture stays under
  // them, which fills where a ray leaves the screen
  let added: Node<"vec3"> | null = null;
  let reflections: ReturnType<typeof ssr> | null = null;
  let bounce: ReturnType<typeof ssgi> | null = null;
  if (wantSsr || wantSsgi) {
    const normalTex = scenePass.getTextureNode("normal");
    const motionTex = scenePass.getTextureNode("velocity");
    if (wantSsr) {
      const weight = max(
        normalTex.a,
        pow(motionTex.b.oneMinus(), 2).mul(SSR_GLOSS),
      );
      reflections = ssr(
        scenePass.getTextureNode("output"),
        depth,
        // the node samples the normals itself: the texture, not a swizzle
        normalTex as unknown as Node<"vec3">,
        {
          metalnessNode: weight,
          roughnessNode: motionTex.b,
          reflectNonMetals: true,
          camera,
        },
      );
      reflections.maxDistance.value = SSR.maxDistance;
      reflections.thickness.value = SSR.thickness;
      reflections.intensity.value = SSR.intensity;
      reflections.resolutionScale = SSR.scale;
      added = reflections.rgb;
    }
    // the bounce light: screen-space GI with temporal filtering, which
    // the TRAA after it settles; a conservative share of it is added
    if (wantSsgi) {
      bounce = ssgi(
        scenePass.getTextureNode("output"),
        depth,
        normalTex,
        camera as PerspectiveCamera,
      );
      bounce.sliceCount.value = SSGI.slices;
      bounce.stepCount.value = SSGI.steps;
      bounce.radius.value = SSGI.radius;
      bounce.useTemporalFiltering = true;
      const gi = bounce.getGINode().rgb.mul(float(SSGI.share));
      added = added ? added.add(gi) : gi;
    }
  }
  const { frame, glow } = frameOf(
    scenePass,
    depth,
    occlusion ? occlusion.getTextureNode().sample(screenUV).r : null,
    backdrop,
    added,
    tier === "desktop",
  );
  const resolve = traa(
    frame,
    depth,
    scenePass.getTextureNode("velocity"),
    camera,
  );
  resolve.useSubpixelCorrection = false;
  pipeline.outputNode = resolve;
  return {
    render,
    warm,
    dispose: () => {
      resolve.dispose();
      frame.dispose();
      glow?.dispose();
      reflections?.dispose();
      bounce?.dispose();
      occlusion?.dispose();
      scenePass.dispose();
      pipeline.dispose();
    },
    place,
    temporal: true,
    fx: {
      ssr:
        !extras || !effects.reflections ? "off" : fits ? "on" : "unsupported",
      ssgi: !extras || !effects.bounce ? "off" : fits ? "on" : "unsupported",
    },
  };
};

/** where the canvas sits in the window right now */
const placeOf = (canvas: HTMLCanvasElement, place: Place) => {
  const r = canvas.getBoundingClientRect();
  place.canvas.set(r.left, r.top, r.width, r.height);
  place.window.set(window.innerWidth, window.innerHeight);
};

export function Post({
  tier,
  effects = { reflections: false, bounce: false },
  bytesPerSample = MRT_BYTES,
  onFailed,
  onSettle,
  onEffects,
  onShaders,
}: {
  tier: Tier;
  /** the desktop extras asked for (View settings) */
  effects?: Effects;
  /** what a sample of colour attachments may hold on this device */
  bytesPerSample?: number;
  /** a stage failed on this device: the room is drawn plain from now on */
  onFailed: (error: unknown) => void;
  /** how many settle frames remain after a change, 0 once the picture
      has settled */
  onSettle?: (remaining: number) => void;
  /** which extras the chain draws, once built */
  onEffects?: (fx: EffectStates) => void;
  /** whether the scene's shaders are still being built ahead of the
      chain's first frame, or ready */
  onShaders?: (state: ShaderState) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  // the passes are built on the first frame that needs them and let go
  // when the tier or the extras change or the room leaves
  const key = `${tier}:${effects.reflections}:${effects.bounce}:${bytesPerSample}`;
  const kept = useRef<{ key: string; chain: Chain } | null>(null);
  // the parts whose shaders the chain has built, by the key their
  // materials had, and whether a build is under way
  const warmed = useRef(new WeakMap<Object3D, string>());
  const warming = useRef(false);
  // whether the chain has drawn a picture yet
  const drawnOnce = useRef(false);
  // when the chain began to wait on the probes' first bake
  const probeWait = useRef(0);
  const probeWake = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(probeWake.current);
      probeWake.current = 0;
    },
    [],
  );
  // the lighting the built shaders were built for
  const lit = useRef("");
  useEffect(() => {
    invalidate();
    return () => {
      kept.current?.chain.dispose();
      kept.current = null;
    };
  }, [key, invalidate]);
  const settle = useRef(0);
  // this takes the frame over from the canvas: the pipeline draws, or the
  // renderer alone after one of its stages fails
  useFrame((state) => {
    let have = kept.current;
    try {
      if (!have || have.key !== key) {
        have?.chain.dispose();
        have = {
          key,
          chain: build(
            state.gl as unknown as WebGPURenderer,
            state.scene,
            state.camera,
            tier,
            effects,
            bytesPerSample,
          ),
        };
        kept.current = have;
        onEffects?.(have.chain.fx);
        // a new chain draws to its own target: its shaders are its own
        warmed.current = new WeakMap();
        if (devFlag("nowarm")) onShaders?.("ready");
      }
      // the probes' first picture comes before any shader is built, for
      // a few seconds at most: a first visit is never left without a room
      if (!devFlag("nowarm") && probesPending(state.scene)) {
        const now = performance.now();
        if (!probeWait.current) probeWait.current = now;
        if (now - probeWait.current < PROBE_WAIT_MS) {
          if (!warming.current) onShaders?.("building");
          // asked again, so the wait ends even if nothing else draws
          wakeAt(probeWake, now + 500, state.invalidate);
          return;
        }
      } else probeWait.current = 0;
      // a change of lighting changes every shader: all are built again
      const lighting = lightingKey(state.scene);
      if (!warming.current && lighting !== lit.current) {
        lit.current = lighting;
        warmed.current = new WeakMap();
      }
      const cold = devFlag("nowarm")
        ? []
        : unwarmed(state.scene, warmed.current);
      if (warming.current || cold.length) {
        // the parts with a material not drawn before have their shaders
        // built before the chain draws them, a part at a time: a frame
        // drawn meanwhile would build them all in one go, so none is
        if (!warming.current) {
          warming.current = true;
          onShaders?.("building");
          const map = warmed.current;
          const done = () => {
            for (const c of cold) map.set(c.part, c.key);
            warming.current = false;
            onShaders?.("ready");
            invalidate();
          };
          // the first picture is behind the loading line and may wait
          // longer; a change to a room on show holds it a moment at most
          const budget = drawnOnce.current ? CHANGE_BUDGET_MS : OPEN_BUDGET_MS;
          void have.chain
            .warm(
              cold.map((c) => c.part),
              budget,
            )
            .then(done, done);
        }
        return;
      }
      placeOf(state.gl.domElement, have.chain.place);
      have.chain.render();
      drawnOnce.current = true;
    } catch (error) {
      onFailed(error);
      state.gl.render(state.scene, state.camera);
      return;
    }
    if (!have.chain.temporal) {
      onSettle?.(0);
      return;
    }
    if (settle.current === 0) settle.current = SETTLE_FRAMES;
    settle.current -= 1;
    onSettle?.(settle.current);
    if (settle.current > 0) state.invalidate();
  }, 1);
  return null;
}
