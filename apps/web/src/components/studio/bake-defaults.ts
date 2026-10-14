import { type BufferGeometry, Float32BufferAttribute } from "three";

/**
 * The bake's attributes as a part is first drawn, before any bake
 * (lightmap.ts, Bake.tsx): its second UV set on the atlas's white
 * corner, and its vertices' `lm` open (it holds what is taken away, so
 * a part never baked reads none taken). Kept apart from the atlas, so
 * the geometry code and its tests need not make one.
 */

/** the atlas's side, texels, and its white corner's */
export const ATLAS_SIZE = 2048;
export const WHITE = 4;
/** the white corner's middle, as a UV */
export const WHITE_UV = WHITE / 2 / ATLAS_SIZE;

export const withBakeDefaults = (g: BufferGeometry) => {
  const count = g.getAttribute("position").count;
  if (!g.getAttribute("uv1"))
    g.setAttribute(
      "uv1",
      new Float32BufferAttribute(new Float32Array(count * 2).fill(WHITE_UV), 2),
    );
  if (!g.getAttribute("lm"))
    g.setAttribute(
      "lm",
      new Float32BufferAttribute(new Float32Array(count * 2), 2),
    );
  if (!g.getAttribute("edge"))
    g.setAttribute(
      "edge",
      new Float32BufferAttribute(new Float32Array(count * 4), 4),
    );
  return g;
};
