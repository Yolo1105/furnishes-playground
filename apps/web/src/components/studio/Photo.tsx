"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { type Camera, type Scene, Vector2 } from "three";
import type { WebGPURenderer } from "three/webgpu";
import type { Tier } from "./Post";
import { useStudio } from "./studio-store";

/**
 * The photo: on a browser with WebGPU, Render traces the light through
 * the room (three-gpu-pathtracer) instead of grading the view, then
 * runs the denoiser (Open Image Denoise, its weights served by the
 * app), and presents the picture on the canvas; Export's PNG reads it.
 * One tracer serves the renderer for its life (making one a shot leaks
 * in 0.0.26), the bounces are fixed before the first sample, the loop
 * is paused while the tracer presents, and a drawing buffer too small
 * to trace is refused. A failure falls back to the graded view.
 */

/** samples per pixel by tier: a desktop's GPU takes more in the time */
const SAMPLES: Record<Tier, number> = { desktop: 256, laptop: 64, phone: 64 };
/** light bounces, set before the first sample and never after */
const BOUNCES = 8;
/** the drawing buffer a trace needs, px a side (three-gpu-pathtracer
    #868: a first sample at a tiny buffer breaks the kernels) */
const MIN_BUFFER = 64;
/** the denoiser's weights, served by the app */
const WEIGHTS = "/oidn/rt_hdr_alb_nrm.tza";
/** frames between two readings of the sample count */
const COUNT_EVERY = 8;

type Tracer = Awaited<ReturnType<typeof tracerFor>>;
type Module = typeof import("three-gpu-pathtracer/webgpu");

/** the one tracer and denoiser per renderer, made on the first photo */
const tracers = new WeakMap<
  WebGPURenderer,
  Promise<{
    tracer: InstanceType<Module["WebGPUPathTracer"]>;
    denoiser: InstanceType<Module["OIDNDenoiser"]>;
  }>
>();
const tracerFor = (renderer: WebGPURenderer) => {
  let made = tracers.get(renderer);
  if (!made) {
    made = (async () => {
      const [{ WebGPUPathTracer, OIDNDenoiser }, { initUNetFromURL }] =
        await Promise.all([
          import("three-gpu-pathtracer/webgpu"),
          import("oidn-web"),
        ]);
      const tracer = new WebGPUPathTracer(renderer);
      tracer.maxBounces = BOUNCES;
      tracer.dynamicLowRes = false;
      tracer.renderDelay = 0;
      tracer.fadeDuration = 0;
      tracer.minSamples = 1;
      tracer.stableNoise = true;
      const denoiser = new OIDNDenoiser({
        initUNetFromURL,
        auxWeightsUrl: WEIGHTS,
        maxTileSize: 512,
        dynamicTile: false,
      });
      tracer.setDenoiser(denoiser);
      return { tracer, denoiser };
    })();
    tracers.set(renderer, made);
  }
  return made;
};

/** a trace to its end, or until stopped: one sample a frame, the count
    reported now and then, the denoiser run by the tracer once the
    samples are in */
const trace = (
  { tracer, denoiser }: Tracer,
  scene: Scene,
  camera: Camera,
  samples: number,
  onCount: (samples: number) => void,
  onDenoise: () => void,
  stopped: () => boolean,
) =>
  new Promise<void>((resolve, reject) => {
    tracer.maxSamples = samples;
    tracer.setScene(scene, camera);
    let frames = 0;
    let denoising = false;
    const tick = () => {
      if (stopped()) return resolve();
      try {
        tracer.renderSample();
      } catch (error) {
        return reject(error);
      }
      if (denoiser.complete) {
        // one more frame presents the denoised picture
        tracer.renderSample();
        return resolve();
      }
      if (++frames % COUNT_EVERY === 0) {
        void tracer.getSampleCountsAsync().then((c) => {
          onCount(c.min);
          if (c.min >= samples && !denoising) {
            denoising = true;
            onDenoise();
          }
        });
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

/** the view as it stands, for the before side of the compare */
const snapshot = (canvas: HTMLCanvasElement) =>
  canvas.toDataURL("image/jpeg", 0.9);

export function Photo({ tier }: { tier: Tier }) {
  const taking = useStudio(
    (s) => s.mode === "preview" && s.loading === "photo",
  );
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (!taking) return;
    const { gl, scene, camera, setFrameloop, invalidate } = get();
    const renderer = gl as unknown as WebGPURenderer;
    const { setPhoto, setWork, endLoading } = useStudio.getState();
    const plan = ["scene", "trace", "denoise"] as const;
    const at = (step: (typeof plan)[number], done = 0, of = 0) =>
      setWork({ plan, step, done, of });
    let stopped = false;
    const give = (why: unknown) => {
      // the graded view stands in: the line runs on as a render's
      console.warn(
        "The photo could not be taken; the view is graded instead.",
        why,
      );
      useStudio.setState({ loading: "render", photo: null });
    };
    void (async () => {
      const buffer = renderer.getDrawingBufferSize(new Vector2());
      if (buffer.x < MIN_BUFFER || buffer.y < MIN_BUFFER) {
        return give("the drawing buffer is too small");
      }
      setPhoto({
        before: snapshot(gl.domElement),
        samples: 0,
        of: SAMPLES[tier],
      });
      at("scene");
      setFrameloop("never");
      try {
        const made = await tracerFor(renderer);
        if (stopped) return;
        at("trace", 0, SAMPLES[tier]);
        await trace(
          made,
          scene,
          camera,
          SAMPLES[tier],
          (samples) => {
            setPhoto({ samples });
            at("trace", samples, SAMPLES[tier]);
          },
          () => at("denoise"),
          () => stopped,
        );
        if (!stopped) endLoading();
      } catch (error) {
        setFrameloop("demand");
        invalidate();
        give(error);
      }
    })();
    return () => {
      stopped = true;
      setFrameloop("demand");
      invalidate();
    };
  }, [taking, tier, get]);
  return null;
}
