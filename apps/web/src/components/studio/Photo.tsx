"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { type Scene, Vector2 } from "three";
import type { WebGPURenderer } from "three/webgpu";
import { devParam } from "./dev-flags";
import { photoPixels, type PhotoSize } from "./photo-size";
import type { Tier } from "./Post";
import { type Copy, copyForExport } from "./scene-copy";
import { useStudio } from "./studio-store";

/**
 * The photo: on a browser with WebGPU, Render traces the light through
 * the room (three-gpu-pathtracer) instead of grading the view, then
 * runs the denoiser (Open Image Denoise, its weights served by the
 * app), and presents the picture on the canvas; Export's PNG reads it.
 * The tracer is given a copy of the room, not the live scene
 * (scene-copy.ts): the helpers out, the node materials made classic,
 * each window's outside a glowing picture of the sky with an area
 * light in the opening facing in, the sun kept and the raster's fills
 * left out, the surroundings as they are. The copy is kept until the
 * room or the pieces change, so a second photo of the same room
 * rebuilds nothing. The photo is traced at the size asked for (View
 * settings > Photo): the drawing buffer is set to it for the shot and
 * the tracer follows, so Export's PNG reads the full picture.
 *
 * One tracer serves the renderer for its life (making one a shot
 * leaks in 0.0.26; 0.0.27, out on 2026-10-08, says it releases its
 * compute kernels on every reset, scene change and dispose, and takes
 * three's SunLight: a bump to it waits for the word), the bounces are
 * fixed before the first sample, the loop is paused while the tracer
 * presents, and a drawing buffer too small to trace is refused. A
 * failure falls back to the graded view. The stage says where the
 * photo stands (`data-photo`, its samples, its time and its size), and
 * `?bench=photo` takes three photos at 1080p back to back and leaves
 * their times on `window.__photoBench`.
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
/** the bench's photos: how many, at what size, with how many samples */
const BENCH = { shots: 3, size: "1080p" as PhotoSize, samples: 256 };

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

/** the copy the tracer is given, kept while the room and the pieces
    stand as they did (the stamp), let go when they change */
let kept: { stamp: string; copy: Copy } | null = null;
const copyFor = (scene: Scene, stamp: string) => {
  if (kept?.stamp !== stamp) {
    kept?.copy.dispose();
    kept = { stamp, copy: copyForExport(scene, { purpose: "trace" }) };
  }
  return kept.copy.root;
};

/** a trace to its end, or until stopped: one sample a frame, the count
    reported now and then, the denoiser run by the tracer once the
    samples are in; the time the denoiser took is handed back */
const trace = (
  { tracer, denoiser }: Tracer,
  scene: Scene,
  camera: Parameters<Tracer["tracer"]["setScene"]>[1],
  samples: number,
  onCount: (samples: number) => void,
  onDenoise: () => void,
  stopped: () => boolean,
) =>
  new Promise<{ denoiseMs: number }>((resolve, reject) => {
    tracer.maxSamples = samples;
    tracer.setScene(scene, camera);
    let frames = 0;
    let denoising = false;
    let denoiseFrom = 0;
    const tick = () => {
      if (stopped()) return resolve({ denoiseMs: 0 });
      try {
        tracer.renderSample();
      } catch (error) {
        return reject(error);
      }
      if (denoiser.complete) {
        // one more frame presents the denoised picture
        tracer.renderSample();
        return resolve({
          denoiseMs: denoiseFrom ? performance.now() - denoiseFrom : 0,
        });
      }
      if (++frames % COUNT_EVERY === 0) {
        void tracer.getSampleCountsAsync().then((c) => {
          onCount(c.min);
          if (c.min >= samples && !denoising) {
            denoising = true;
            denoiseFrom = performance.now();
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

/** the drawing buffer set to the photo's size for the shot, at one
    device pixel a pixel (the stage's own size is its buffer at the
    device's ratio); null when the device cannot hold the size */
const sizeFor = (renderer: WebGPURenderer, choice: PhotoSize, max: number) => {
  const buffer = renderer.getDrawingBufferSize(new Vector2());
  const px = photoPixels(choice, buffer.x, buffer.y, max);
  if (!px) return null;
  if (px.width !== buffer.x || px.height !== buffer.y) {
    renderer.setPixelRatio(1);
    renderer.setSize(px.width, px.height, false);
  }
  return px;
};

export function Photo({ tier, stamp }: { tier: Tier; stamp: string }) {
  const taking = useStudio(
    (s) => s.mode === "preview" && s.loading === "photo",
  );
  const shown = useStudio((s) => s.photo !== null);
  const get = useThree((s) => s.get);
  // whether the buffer stands at a photo's size, to be put back
  const resized = useRef(false);
  useEffect(() => {
    if (!taking) return;
    const { gl, scene, camera, setFrameloop, invalidate, size, viewport } =
      get();
    const renderer = gl as unknown as WebGPURenderer;
    const {
      setPhoto,
      setWork,
      endLoading,
      scene: look,
      photoMax,
    } = useStudio.getState();
    const plan = ["scene", "trace", "denoise"] as const;
    const at = (step: (typeof plan)[number], done = 0, of = 0) =>
      setWork({ plan, step, done, of });
    let stopped = false;
    const restore = () => {
      if (!resized.current) return;
      resized.current = false;
      renderer.setPixelRatio(viewport.dpr);
      renderer.setSize(size.width, size.height, false);
    };
    const give = (why: unknown) => {
      // the graded view stands in: the line runs on as a render's
      console.warn(
        "The photo could not be taken; the view is graded instead.",
        why,
      );
      restore();
      setPhoto({ state: "failed" });
      useStudio.setState({ loading: "render", photo: null });
    };
    void (async () => {
      const t0 = performance.now();
      const before = snapshot(gl.domElement);
      const px = sizeFor(renderer, look.photoSize, photoMax);
      if (!px) return give(`the device cannot hold a ${look.photoSize} photo`);
      resized.current =
        px.width !== size.width * viewport.dpr ||
        px.height !== size.height * viewport.dpr;
      const buffer = renderer.getDrawingBufferSize(new Vector2());
      if (buffer.x < MIN_BUFFER || buffer.y < MIN_BUFFER) {
        return give("the drawing buffer is too small");
      }
      setPhoto({
        before,
        samples: 0,
        of: SAMPLES[tier],
        state: "scene",
        ms: 0,
        width: px.width,
        height: px.height,
      });
      at("scene");
      setFrameloop("never");
      try {
        const made = await tracerFor(renderer);
        if (stopped) return;
        const copy = copyFor(scene, stamp);
        at("trace", 0, SAMPLES[tier]);
        setPhoto({ state: "trace" });
        let count = 0;
        const { denoiseMs } = await trace(
          made,
          copy,
          camera,
          SAMPLES[tier],
          (samples) => {
            count = samples;
            setPhoto({ samples, ms: Math.round(performance.now() - t0) });
            at("trace", samples, SAMPLES[tier]);
          },
          () => {
            setPhoto({ state: "denoise" });
            at("denoise");
          },
          () => stopped,
        );
        if (stopped) return;
        const ms = Math.round(performance.now() - t0);
        setPhoto({ state: "done", ms, samples: count });
        console.info(
          `photo ${px.width}x${px.height}, ${count} spp, ${ms} ms, denoise ${Math.round(denoiseMs)} ms`,
        );
        endLoading();
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
  }, [taking, tier, stamp, get]);
  // the buffer back to the stage's size once the photo is edited away
  useEffect(() => {
    if (shown || !resized.current) return;
    const { gl, size, viewport, invalidate } = get();
    const renderer = gl as unknown as WebGPURenderer;
    resized.current = false;
    renderer.setPixelRatio(viewport.dpr);
    renderer.setSize(size.width, size.height, false);
    invalidate();
  }, [shown, get]);
  return null;
}

/** `?bench=photo`: three photos at 1080p back to back, their times,
    the memory and the adapter left on `window.__photoBench` to copy
    out; nothing on a browser without WebGPU */
export function PhotoBench() {
  const backend = useStudio((s) => s.backend);
  const loading = useStudio((s) => s.loading);
  const run = useRef<{
    shots: { ms: number; samples: number; size: string }[];
  } | null>(null);
  useEffect(() => {
    if (devParam("bench") !== "photo" || backend !== "webgpu") return;
    const st = useStudio.getState();
    if (!run.current) {
      run.current = { shots: [] };
      st.setScene({ photoSize: BENCH.size, quality: "full" });
      st.setMode("preview");
      return;
    }
    if (loading !== null) return;
    const photo = st.photo;
    if (photo?.state === "done")
      run.current.shots.push({
        ms: photo.ms,
        samples: photo.samples,
        size: `${photo.width}x${photo.height}`,
      });
    if (run.current.shots.length < BENCH.shots) {
      st.setMode("edit");
      st.setMode("preview");
      return;
    }
    const memory = (
      performance as unknown as {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
      }
    ).memory;
    const gpu = (
      navigator as unknown as {
        gpu?: { requestAdapter: () => Promise<{ info?: unknown } | null> };
      }
    ).gpu;
    void (gpu?.requestAdapter() ?? Promise.resolve(null)).then((adapter) => {
      (window as unknown as { __photoBench?: unknown }).__photoBench = {
        shots: run.current?.shots,
        memory,
        adapter: adapter?.info ?? null,
        at: new Date().toISOString(),
      };
      console.info(
        "photo bench",
        (window as unknown as { __photoBench?: unknown }).__photoBench,
      );
    });
  }, [backend, loading]);
  return null;
}
