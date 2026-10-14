/// <reference lib="webworker" />
import { bake, type BakeJob } from "./lightmap-bake";

/** the bake worker: a piece's job in, its light out (lightmap.ts asks) */
self.onmessage = (e: MessageEvent<{ id: number; job: BakeJob }>) => {
  const result = bake(e.data.job);
  (self as unknown as Worker).postMessage({ id: e.data.id, result }, [
    result.atlas.buffer,
    result.points.buffer,
    result.foot.buffer,
  ]);
};
