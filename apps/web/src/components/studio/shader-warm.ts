import {
  BackSide,
  type Camera,
  DoubleSide,
  FrontSide,
  type Light,
  type Material,
  type Object3D,
  type Scene,
  type Side,
} from "three";
import type { PassNode, WebGPURenderer } from "three/webgpu";
import { BUILD_WAIT_MS, within } from "./gpu-fallback";

/**
 * The scene's shaders built ahead of the frames that need them. A
 * material the renderer has not drawn before needs its shader built,
 * and a frame that meets twenty of them builds the twenty in one go:
 * opening a furnished room, or the photographed wood arriving and
 * changing every board's material, held the page for seconds. Here the
 * parts with a material not seen before are found each frame (a cheap
 * walk), and three builds their shaders one part at a time
 * (`renderer.compileAsync`), giving the page back between parts and,
 * where the device can (`KHR_parallel_shader_compile`, WebGPU), linking
 * them off the main thread; the post chain draws no frame meanwhile, so
 * none builds the rest at once.
 */

/** the texture slots whose being filled or not changes a shader */
const SLOTS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "alphaMap",
  "bumpMap",
  "envMap",
  "lightMap",
  "clearcoatMap",
  "sheenColorMap",
] as const;

/** what a material's shader depends on, as far as a frame can see it
    cheaply: which material it is, the texture slots filled, and the
    switches that change code (not its version, which some parts bump
    as their pictures update, and a frame would wait on for ever) */
export const shaderKey = (m: Material) => {
  const any = m as unknown as Record<string, unknown>;
  let slots = 0;
  SLOTS.forEach((s, i) => {
    if (any[s]) slots |= 1 << i;
  });
  return `${m.uuid}.${slots}.${any.vertexColors ? 1 : 0}.${m.transparent ? 1 : 0}.${m.side}`;
};

type Drawn = Object3D & { material?: Material | Material[] };

type Grid = Light & { isLightProbeGrid?: boolean; texture?: unknown };

/** what every shader in the scene depends on beside its material: the
    lights (each kind, whether it casts a shadow, and for a probe grid
    whether it has been baked), the environment and the fog. A light
    added or a shadow turned on changes them all */
export const lightingKey = (scene: Scene) => {
  const lights: string[] = [];
  scene.traverseVisible((o) => {
    const light = o as Grid;
    if (light.isLight)
      lights.push(
        `${light.type}${light.castShadow ? "s" : ""}${light.isLightProbeGrid && light.texture ? "t" : ""}`,
      );
  });
  return `${lights.sort().join(",")}|${scene.environment?.uuid ?? ""}|${scene.fog ? 1 : 0}`;
};

/** whether a probe grid in the scene has yet to be baked: a material
    built before the grid has its picture never samples it (Probes.tsx),
    so nothing is built until it has */
export const probesPending = (scene: Scene) => {
  let pending = false;
  scene.traverseVisible((o) => {
    const grid = o as Grid;
    if (grid.isLightProbeGrid && !grid.texture) pending = true;
  });
  return pending;
};

/** the parts shown whose materials' shaders have not been built (by
    the keys `warmed` holds for them), with the keys they have now */
export const unwarmed = (
  scene: Object3D,
  warmed: WeakMap<Object3D, string>,
) => {
  const out: { part: Object3D; key: string }[] = [];
  scene.traverseVisible((o) => {
    const material = (o as Drawn).material;
    if (!material) return;
    const key = Array.isArray(material)
      ? material.map(shaderKey).join("|")
      : shaderKey(material);
    if (warmed.get(o) !== key) out.push({ part: o, key });
  });
  return out;
};

/** a part's materials that three draws in two passes, the back faces
    and then the front (a see-through thing shown from both sides). The
    build queues both passes but builds them after the material is two-
    sided again, so the shaders the frame needs are built here a side
    at a time instead */
const twoPassOf = (part: Object3D) => {
  const material = (part as Drawn).material;
  const all = Array.isArray(material) ? material : material ? [material] : [];
  return all.filter(
    (m) => m.transparent && m.side === DoubleSide && !m.forceSinglePass,
  );
};

/** whether a build is under way: the scene pass's target and outputs
    are the renderer's own until it is done (three reads the outputs as
    it builds each material, after the build has given the page back),
    so nothing else draws meanwhile (the probes' bake and the floor's
    picture wait on it: drawn with the pass's outputs, their pictures
    would be wrong, and on WebGPU their pipelines refused) */
let building = false;
export const warming = () => building;

/** the parts' shaders built for the scene pass (its target and its
    outputs), one part at a time; a part out of view is built too, so it
    costs nothing when the camera turns to it. The build stops once it
    has run `budget` ms (after the part under way): the picture is held
    while it runs, and a slow device draws the rest as it meets them,
    as it did before, rather than show a picture that stands still */
export const warmParts = async (
  renderer: WebGPURenderer,
  pass: PassNode,
  parts: readonly Object3D[],
  scene: Scene,
  camera: Camera,
  budget = Infinity,
) => {
  // the target is read as a build starts and the outputs as it makes
  // each material, so both stand for the whole of a part's build: a
  // material made without the pass's outputs has a shader that writes
  // fewer of them than the pass holds, which WebGPU refuses
  const build = async (part: Object3D) => {
    const target = renderer.getRenderTarget();
    const mrt = renderer.getMRT();
    renderer.setRenderTarget(pass.renderTarget);
    renderer.setMRT(pass.getMRT());
    try {
      // a build that never finishes (a GPU stuck on a pipeline) ends the
      // warm-up: the frames draw what is left as they meet it, and
      // the stage never waits on it for ever (gpu-fallback.ts)
      if (
        (await within(
          renderer.compileAsync(part, camera, scene).then(() => true),
          BUILD_WAIT_MS,
          false,
        )) === false
      )
        throw new Error("a shader's build did not finish");
    } finally {
      renderer.setRenderTarget(target);
      renderer.setMRT(mrt);
    }
  };
  building = true;
  try {
    await warmEach(parts, build, performance.now() + budget);
  } finally {
    building = false;
  }
};

const warmEach = async (
  parts: readonly Object3D[],
  build: (part: Object3D) => Promise<void>,
  until: number,
) => {
  for (const part of parts) {
    if (performance.now() > until) return;
    const culled = part.frustumCulled;
    part.frustumCulled = false;
    const twoPass = twoPassOf(part);
    try {
      if (!twoPass.length) {
        await build(part);
        continue;
      }
      // a change of side is a change three is told of, or it keeps the
      // build it made for the first side
      const sided = (side: Side) => {
        for (const m of twoPass) {
          m.side = side;
          m.needsUpdate = true;
        }
      };
      for (const side of [BackSide, FrontSide] as Side[]) {
        sided(side);
        try {
          await build(part);
        } finally {
          sided(DoubleSide);
        }
      }
    } finally {
      part.frustumCulled = culled;
    }
  }
};
