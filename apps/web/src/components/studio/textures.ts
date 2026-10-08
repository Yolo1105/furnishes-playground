import {
  DataTexture,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";
import { type SurfaceMaps, type SurfaceSpec } from "./surface-paint";
import type { SurfaceAnswer, SurfaceRequest } from "./surface.worker";

export { CLOTH_M, PLASTER_M, TILE_M, WOOD_M } from "./surface-paint";

/**
 * The grown surfaces as textures. The maps are painted off the main
 * thread (surface-paint.ts in surface.worker.ts) and arrive here as
 * bytes, made into textures that repeat; until they arrive a flat
 * stand-in of one pixel holds the material's colour, so the studio
 * opens at once and the surfaces fill in as each is ready.
 */

/** a surface's three maps, sharing their wrap and repeat */
export type Surface = {
  map: DataTexture;
  normalMap: DataTexture;
  roughnessMap: DataTexture;
};

/** a hex colour lightened (dl > 0) or darkened (dl < 0), with its hue kept */
export const shade = (hex: string, dl: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + dl * 255)));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

const textureOf = (
  data: Uint8ClampedArray,
  size: number,
  colorSpace: string,
) => {
  const tex = new DataTexture(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    size,
    size,
    RGBAFormat,
    UnsignedByteType,
  );
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
};

/** the painted maps as a surface; light values alone are not a colour,
    so an untinted map is read as it is and the material's colour is
    multiplied by it */
export const surfaceOf = (maps: SurfaceMaps, tinted: boolean): Surface => ({
  map: textureOf(
    maps.colour,
    maps.size,
    tinted ? SRGBColorSpace : NoColorSpace,
  ),
  normalMap: textureOf(maps.normal, maps.size, NoColorSpace),
  roughnessMap: textureOf(maps.rough, maps.size, NoColorSpace),
});

/** the stand-in while a surface is painted: one flat pixel in the tint
    (or white, for light values), facing straight out, matt */
export const flatSurface = (tint: string | null): Surface => {
  const t = tint ? parseInt(tint.slice(1), 16) : 0xffffff;
  const px = (r: number, g: number, b: number) =>
    new Uint8ClampedArray([r, g, b, 255]);
  return {
    map: textureOf(
      px(t >> 16, (t >> 8) & 255, t & 255),
      1,
      tint ? SRGBColorSpace : NoColorSpace,
    ),
    normalMap: textureOf(px(128, 128, 255), 1, NoColorSpace),
    roughnessMap: textureOf(px(200, 200, 200), 1, NoColorSpace),
  };
};

/* ---------- the worker ---------- */

let worker: Worker | null = null;
const waiting = new Map<string, (maps: SurfaceMaps) => void>();

const workerOf = () => {
  if (worker) return worker;
  worker = new Worker(new URL("./surface.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<SurfaceAnswer>) => {
    const take = waiting.get(e.data.key);
    waiting.delete(e.data.key);
    take?.(e.data.maps);
  };
  return worker;
};

/** the maps of a surface painted in the worker, one request a key */
export const paintedMaps = (key: string, spec: SurfaceSpec) =>
  new Promise<SurfaceMaps>((resolve) => {
    waiting.set(key, resolve);
    const ask: SurfaceRequest = { key, spec };
    workerOf().postMessage(ask);
  });
