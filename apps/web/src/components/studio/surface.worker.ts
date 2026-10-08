import { paintMaps, type SurfaceMaps, type SurfaceSpec } from "./surface-paint";

/**
 * The surface worker: a grown surface painted off the main thread
 * (surface-paint.ts), so the studio opens at once with a flat stand-in
 * and takes each surface as it is ready. A request names its key; the
 * answer carries the same, with the maps handed over, not copied.
 */
export type SurfaceRequest = { key: string; spec: SurfaceSpec };
export type SurfaceAnswer = { key: string; maps: SurfaceMaps };

self.onmessage = (e: MessageEvent<SurfaceRequest>) => {
  const maps = paintMaps(e.data.spec);
  const answer: SurfaceAnswer = { key: e.data.key, maps };
  self.postMessage(answer, {
    transfer: [maps.colour.buffer, maps.normal.buffer, maps.rough.buffer],
  });
};
