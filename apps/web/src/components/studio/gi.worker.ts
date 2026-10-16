/// <reference lib="webworker" />
import { bakeGi, halves, type GiJob } from "./gi-bake";

/** the bounce bake's worker: a room's job in, its light out as the
    texture takes it (half floats), with how long it took (GiBake.tsx
    asks) */
self.onmessage = (e: MessageEvent<{ id: number; job: GiJob }>) => {
  const t0 = performance.now();
  const result = bakeGi(e.data.job);
  const half = halves(result.irradiance);
  (self as unknown as Worker).postMessage(
    { id: e.data.id, half, mean: result.mean, ms: performance.now() - t0 },
    [half.buffer],
  );
};
