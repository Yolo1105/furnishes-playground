import { dFdx, dFdy, Fn, materialRoughness, normalView } from "three/tsl";
import type { Node } from "three/webgpu";

/**
 * A glossy surface's roughness widened where its normal changes faster
 * than a pixel can show (Kaplanyan and Hoffman's specular
 * anti-aliasing, the screen-space form of Toksvig's): far off, a
 * lacquered panel's orange-peel or the floor's grain packs many bumps
 * into a pixel, each turning the highlight its own way, and the
 * highlight sparkles and crawls as the camera moves. The normal's own
 * change across the pixel (with its normal map, `normalView` as the
 * lighting reads it) says how much, and the roughness grows by it, so
 * a far highlight goes soft and stays put. three already does this for
 * the geometry's normal (getGeometryRoughness); this adds the maps'.
 */

/** the most the roughness² grows by, so a near-flat far surface is not
    turned matt */
export const SPEC_AA = { kappa: 0.18 };

/** a roughness widened so (`filtered(r)`), for a finish whose own
    roughness is worked out in its material (finish.tsx's drift) */
export const filtered = (r: Node<"float">): Node<"float"> =>
  Fn(() => {
    const dx = dFdx(normalView);
    const dy = dFdy(normalView);
    const variance = dx.dot(dx).add(dy.dot(dy)).mul(0.25);
    const kernel = variance.mul(2).min(SPEC_AA.kappa);
    return r.mul(r).add(kernel).clamp(0, 1).sqrt();
  })() as unknown as Node<"float">;

export const filteredRoughness: Node<"float"> = filtered(
  materialRoughness as unknown as Node<"float">,
);
