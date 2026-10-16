import {
  Color,
  DataArrayTexture,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  type Light,
} from "three";
import {
  attribute,
  float,
  Fn,
  lights,
  max,
  mix,
  select,
  texture,
  uniform,
  uniformArray,
} from "three/tsl";
import { IrradianceNode, NodeMaterial, type Node } from "three/webgpu";

/**
 * The room's bounced light on its own surfaces (round 9, Part 1d). A
 * shell surface the bake has reached carries `giuv`: its place in the
 * room's layer of the light's texture (x, y) and the room's slot (z).
 * Every lit node material reads it where its geometry has it (three
 * keeps a shader for each set of a geometry's attributes, so the rest
 * are drawn as before):
 *
 * - the baked irradiance is the surface's light map (three adds a light
 *   map to the light arriving, as the bake measured it);
 * - and the lights the bake already holds are left out of its sum: the
 *   sky's fill (the hemisphere), the windows' area lights and the
 *   probes. The sun (with its shadow) and the lamps stay real time, so a
 *   piece moved shows its shadow at once.
 *
 * Patched onto `NodeMaterial` itself, three 0.186.1 (pinned): the plain
 * materials the shell is drawn with are made node materials by the
 * renderer, past any one material's reach. Check `setupLightMap` and
 * `setupLighting` on an upgrade.
 */

/** the rooms a flat has room for, and the texture's size a layer */
export const GI_ROOMS = 12;
/** a layer's side: the desktop's, and a phone's or a software
    renderer's */
export const GI_SIDE = { fine: 512, plain: 256 } as const;

/** the layers: one a room, and one spare a new bake comes in on */
export const SPARE = GI_ROOMS;
const layers = GI_ROOMS + 1;

let side: number = GI_SIDE.fine;
/** the texture, made at the side the tier asks for (the first call
    decides; a later call at another size starts it again) */
let tex: DataArrayTexture | null = null;
export const giTexture = (want: number = side) => {
  if (tex && side === want) return tex;
  tex?.dispose();
  side = want;
  const data = new Uint16Array(side * side * 4 * layers);
  tex = new DataArrayTexture(data, side, side, layers);
  tex.format = RGBAFormat;
  tex.type = HalfFloatType;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
};
export const giSide = () => side;

/** each room's share of the spare layer: 0 its own, 1 the spare's (a
    new bake fading in) */
export const GI_FADE = uniformArray(
  new Array<number>(GI_ROOMS).fill(0),
  "float",
);
/** the whole bake's strength (0 off, 1 as baked) */
export const GI_STRENGTH = uniform(1);
/** the light on a shell face that looks into no room (a wall's outside,
    its cut top): the sky's fill it had before the bake (GiBake sets it
    with the look) */
export const GI_OUTSIDE = uniform(new Color(0, 0, 0));

const giuv = attribute("giuv", "vec3");
/** the irradiance the bake left at a shell surface: the room's layer,
    and the spare where a new bake is fading in. Made as each shader is
    built, from the texture as it is then (a texture node keeps the
    texture it was made with) */
export const giIrradiance = Fn(() => {
  const t = giTexture();
  // a face of no room carries the slot −1
  const slot = max(giuv.z.add(0.5).floor(), float(0)).toInt();
  const own = texture(t, giuv.xy).depth(slot);
  const next = texture(t, giuv.xy).depth(float(SPARE).toInt());
  const share = GI_FADE.element(slot) as unknown as Node<"float">;
  const baked = mix(own.rgb, next.rgb, share);
  return select(giuv.z.lessThan(-0.5), GI_OUTSIDE, baked).mul(GI_STRENGTH);
})() as unknown as Node<"vec3">;

/** whether the bake has reached the surface being built */
type Builder = {
  geometry?: { hasAttribute?: (name: string) => boolean };
  lightsNode?: { getLights: () => Light[] } | null;
};
const reached = (builder: Builder) =>
  builder.geometry?.hasAttribute?.("giuv") === true;

/** the lights a reached surface still takes live: not the sky's fill,
    the windows' area lights or the probes, which the bake holds */
const held = (l: Light) =>
  (l as Light & { isHemisphereLight?: boolean }).isHemisphereLight === true ||
  (l as Light & { isRectAreaLight?: boolean }).isRectAreaLight === true ||
  (l as Light & { isLightProbeGrid?: boolean }).isLightProbeGrid === true ||
  (l as Light & { isAmbientLight?: boolean }).isAmbientLight === true;

let patched = false;
/** the patch, once */
export const patchGi = () => {
  if (patched) return;
  patched = true;
  const proto = NodeMaterial.prototype as unknown as {
    setupLightMap: (builder: Builder) => unknown;
    setupLighting: (builder: Builder) => unknown;
    lightsNode: unknown;
  };
  const lightMap = proto.setupLightMap;
  proto.setupLightMap = function (this: unknown, builder: Builder) {
    if (reached(builder)) return new IrradianceNode(giIrradiance);
    return lightMap.call(this, builder);
  };
  const lighting = proto.setupLighting;
  proto.setupLighting = function (
    this: { lightsNode: unknown },
    builder: Builder,
  ) {
    if (!reached(builder) || !builder.lightsNode)
      return lighting.call(this, builder);
    const had = this.lightsNode;
    this.lightsNode = lights(
      builder.lightsNode.getLights().filter((l) => !held(l)),
    );
    try {
      return lighting.call(this, builder);
    } finally {
      this.lightsNode = had;
    }
  };
};
