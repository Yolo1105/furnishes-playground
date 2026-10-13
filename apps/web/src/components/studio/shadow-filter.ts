import {
  add,
  float,
  Fn,
  frameId,
  interleavedGradientNoise,
  reference,
  renderGroup,
  screenCoordinate,
  texture,
  vec2,
  vogelDiskSample,
} from "three/tsl";
import type { LightShadow } from "three";
import type { Node } from "three/webgpu";

/**
 * A soft shadow's edge without its grain. three's PCF filter (r186,
 * ShadowFilterNode's PCFShadowFilter) takes five samples on a disc
 * turned at each pixel by a noise fixed to the screen: the same turn
 * every frame, so the frames the picture settles over (TRAA) average
 * nothing away, and the penumbra under a table or along a sofa's foot
 * stayed a field of dark specks, sand. Here the disc turns a little
 * further each frame as well, with eight samples, so the settle frames
 * average the grain into a smooth gradient; a still picture keeps the
 * last of them. The same inputs as three's own filter (`shadow.filterNode`).
 */
const SAMPLES = 8;
/** how far the disc turns each frame, a share of a turn: the golden
    ratio's, so no two of the settle frames repeat a turn */
const STEP = 0.618034;

type Inputs = {
  depthTexture: { isArrayTexture?: boolean } & object;
  shadowCoord: Node<"vec3">;
  shadow: LightShadow;
  depthLayer?: Node<"int">;
};

export const settlingPCF = Fn(
  ({ depthTexture, shadowCoord, shadow, depthLayer }: Inputs) => {
    const sample = (uv: Node<"vec2">) => {
      let d = texture(depthTexture as never, uv);
      if (depthTexture.isArrayTexture && depthLayer) d = d.depth(depthLayer);
      return d.compare(shadowCoord.z);
    };
    // the shadow's own size and softness, read each frame as three's own
    // filter reads them (its typings leave out setGroup)
    type Grouped<T> = T & { setGroup: (g: typeof renderGroup) => T };
    const mapSize = (
      reference("mapSize", "vec2", shadow) as unknown as Grouped<Node<"vec2">>
    ).setGroup(renderGroup);
    const radius = (
      reference("radius", "float", shadow) as unknown as Grouped<Node<"float">>
    ).setGroup(renderGroup);
    const scaled = radius.mul(vec2(1).div(mapSize).x);
    const phi = interleavedGradientNoise(screenCoordinate.xy)
      .add(float(frameId).mul(STEP))
      .fract()
      .mul(Math.PI * 2);
    const disc = vogelDiskSample as unknown as (
      i: number,
      n: number,
      phi: Node<"float">,
    ) => Node<"vec2">;
    const taps = Array.from({ length: SAMPLES }, (_, i) =>
      sample(
        (shadowCoord.xy as unknown as Node<"vec2">).add(
          disc(i, SAMPLES, phi).mul(scaled),
        ),
      ),
    );
    return (add as (...n: unknown[]) => Node<"float">)(...taps).mul(
      1 / SAMPLES,
    );
  },
);
