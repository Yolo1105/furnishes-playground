"use client";

import { toMetres } from "@furnishes/scene";
import { WebGPURenderer } from "three/webgpu";
import { Html, OrbitControls } from "@react-three/drei";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useEvent } from "./use-event";
import {
  Canvas,
  type CanvasProps,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import {
  type ComponentProps,
  memo,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Camera,
  CanvasTexture,
  type Group,
  type PerspectiveCamera,
  PCFShadowMap,
  Plane,
  Vector3,
  type Vector3Tuple,
  type WebGLRenderer,
  type DirectionalLight,
  type SpotLight,
} from "three";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { Furniture3D } from "./Furniture3D";
import { ArrowLeftIcon, LockIcon } from "./icons";
import { CameraMotion, SlowFrames, sharpDpr } from "./camera-motion";
import {
  ADAPTER_WAIT_MS,
  fellBackFor,
  FIRST_PICTURE_WAIT_MS,
  INIT_WAIT_MS,
  shun,
  shunnedFor,
  startOverOnWebGL,
  within,
} from "./gpu-fallback";
import { ShadowsOnChange } from "./ShadowsOnChange";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { GapReadout, PieceBar } from "./PieceBar";
import { useWallItems } from "./wall-items";
import { WallItems3D } from "./WallItems3D";
import {
  ACCENT_HEX,
  colourHex,
  DANGER_HEX,
  footprint,
  isRug,
  roomItemHex,
  type PieceProps,
} from "./piece-detail";
import { FLOOR_TONES, WALL_TONES, type Floor, widestWindow } from "./room-data";
import { settle, wallGaps, type Rect } from "./room-layout";
import { insideOutline, WALL_MM } from "./room-geometry";
import type { Point } from "./room-templates";
import {
  activeOf,
  footprintOf,
  openingsOf,
  roomAt,
  roomOverlaps,
  type RoomSpec,
  sharedOf,
  sheetBox,
  useActiveRoom,
  useRoom,
  type RoomConfig,
} from "./room-store";
import { Photo, PhotoBench } from "./Photo";
import {
  backendOf,
  EFFECTS_OFF,
  type EffectStates,
  MRT_BYTES,
  Post,
  type ShaderState,
  textureSideOf,
  tierBelow,
  tierOf,
  TONE_MAPPING,
  WHITE_BALANCE,
} from "./Post";
import { Probes } from "./Probes";
import { type StillState, wakeAt } from "./capture";
import { loadMaterials, useMaterials } from "./materials";
import { ceilingAt, RoomLight, RoomShell } from "./Room3D";
import { SHADOW_LAYER } from "./walls-standing";
import { usePartStore } from "./part-client";
import {
  type Box,
  cameraFor,
  CLIP,
  type Corner,
  cornerOf,
  type Framing,
  openCorner,
  EYE,
  FOV,
  type Shot,
  shotCorner,
  walkStart,
  windowSide,
} from "./camera-bookmarks";
import { shownNow } from "./last-frame";
import { setLive } from "./scene-handle";
import { recordFrame, recorder } from "./bench";
import { devFlag, devParam } from "./dev-flags";
import { settlingPCF } from "./shadow-filter";
import { SUN_TIMES, sunDirection } from "./sun-position";
import { type LitRoom, panesOf } from "./window-light";
import { WindowLights } from "./WindowLights";
import { balanceGain, EVENING_LIGHT, LAMP_BULB } from "./white-balance";
import { propsOf, useScene } from "./scene-store";
import { type GestureEvent, readWheel, useCoarse } from "./input";
import {
  minRenderMs,
  onLeave3d,
  useStudio,
  exposureOf,
  type Angle,
  type WorkStep,
} from "./studio-store";

/** the frame's shape the Corner view's foreground is checked over,
    across ÷ high: its middle, square, where a piece cut by the frame
    reads worst (the stage's own shape is the canvas's, not known here;
    a piece at a wide frame's side is cut by its edge, as in a photo) */
const SHOT_ASPECT = 1;

/**
 * The room in 3D: the floor and the walls from the Room tab's outline and
 * finish, and each piece built from what it is (panel carcasses for the
 * Furnishes pieces, simple forms for the room items), at its place and
 * turn from the shared layout. Select picks a piece and drags it over
 * the floor (snapped, flush to a near wall, one undo step); a picked
 * piece shows its turn handle; Inspect raises its actions; a piece over
 * another is outlined in the accent. The cube's angles move the camera
 * with a short glide; Walk puts the camera at eye height: W A S D move,
 * a drag looks around, a click on the floor goes there, Escape leaves.
 * A piece in focus stands alone on a blank ground.
 */

/** the renderer: three's WebGPU one, on WebGPU where the browser has it
    and on its WebGL 2 backend elsewhere, made once per canvas and
    initialised before the first frame (React Three Fiber waits for the
    promise). On the WebGL backend the drawing buffer is kept, so Export
    can read the canvas as a picture; on WebGPU it is kept by the
    platform. Anti-aliasing is the hardware's on a mouse and off under a
    finger. The tone mapping (Post.tsx) rolls the window's highlights off. */
const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;
type RendererProps = Parameters<
  Extract<NonNullable<CanvasProps["gl"]>, (...args: never[]) => unknown>
>[0];
const makeRenderer = async (
  props: RendererProps,
  antialias: boolean,
  forceWebGL = false,
): Promise<WebGLRenderer> => {
  const canvas = props.canvas as HTMLCanvasElement;
  // the browser may have the API and no adapter behind it: ask first,
  // so the WebGL backend gets its own context with the buffer kept. A
  // WebGPU given up on lately is not asked (gpu-fallback.ts), nor one
  // whose adapter does not answer
  const tryGPU = hasWebGPU() && !forceWebGL && shunnedFor() === null;
  const asked = tryGPU
    ? await within(
        navigator.gpu.requestAdapter().catch(() => null),
        ADAPTER_WAIT_MS,
        "late" as const,
      )
    : null;
  if (asked === "late") shun("adapter");
  const adapter = asked === "late" ? null : asked;
  const webgl = !adapter;
  // the desktop extras draw the scene with four attachments a sample
  // (32 bytes, the floor every device has); more is asked for where the
  // adapter allows it, as headroom for a fifth
  const bytes = adapter?.limits.maxColorAttachmentBytesPerSample ?? 0;
  const renderer = new WebGPURenderer({
    canvas,
    antialias,
    alpha: true,
    powerPreference: "high-performance",
    forceWebGL: webgl,
    ...(bytes >= 2 * MRT_BYTES
      ? { requiredLimits: { maxColorAttachmentBytesPerSample: 2 * MRT_BYTES } }
      : {}),
    // the frame bench reads the GPU's time per frame where the device
    // has the timestamp query (WebGPUBackend: trackTimestamp)
    trackTimestamp: devParam("bench") === "walk",
    ...(webgl
      ? {
          context:
            canvas.getContext("webgl2", {
              antialias,
              alpha: true,
              depth: true,
              stencil: false,
              preserveDrawingBuffer: true,
              powerPreference: "high-performance",
            }) ?? undefined,
        }
      : {}),
  });
  if (!webgl) {
    // a device lost starts the page over on WebGL, once
    const lost = renderer.onDeviceLost.bind(renderer);
    renderer.onDeviceLost = (info) => {
      lost(info);
      startOverOnWebGL("lost");
    };
    // a device that does not answer, or refuses: the canvas has no
    // WebGPU context until it answers, so the WebGL backend takes the
    // same canvas
    if (
      !(await within(
        renderer.init().then(
          () => true,
          () => false,
        ),
        INIT_WAIT_MS,
        false,
      ))
    ) {
      shun("device");
      return makeRenderer(props, antialias, true);
    }
    return renderer as unknown as WebGLRenderer;
  }
  await renderer.init();
  return renderer as unknown as WebGLRenderer;
};
const makeRendererFine = (props: RendererProps) => makeRenderer(props, true);
const makeRendererCoarse = (props: RendererProps) => makeRenderer(props, false);
/** the shadow map the WebGPU renderer keeps (it dropped the soft one) */
const SHADOWS = { type: PCFShadowMap } as const;

/** the first frame drawn: the canvas is kept clear until then and
    fades up on it, so the room comes in over the shell rather than
    popping up whole once its first frame (the shaders built, the
    materials made) is through */
function FirstFrame({ onDrawn }: { onDrawn: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    // the state lands after this frame's render, which runs in the
    // same turn as the frame's callbacks
    onDrawn();
  });
  return null;
}

/** the export's tags: what a copy of the scene keeps and what it
    drops (scene-copy.ts) */
const PIECES_TAG = { export: "piece" } as const;
const HELPER_TAG = { export: "helper" } as const;

/** the live scene handed to code outside the canvas (the glTF export)
    while the room is on the stage, with its box and its sun */
function LiveHandle({
  w,
  d,
  h,
  spanW,
  spanD,
  centre,
  corner,
  shot,
  sun,
}: {
  w: number;
  d: number;
  h: number;
  /** the flat's box, m */
  spanW: number;
  spanD: number;
  centre: readonly [number, number];
  corner: Corner;
  shot: Shot;
  sun: { position: Vector3Tuple; colour: string; intensity: number };
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    setLive({
      scene,
      camera,
      w,
      d,
      h,
      span: { w: spanW, d: spanD },
      centre,
      corner,
      shot,
      sun,
    });
    // in development the scene and its camera are at hand in the
    // console too, for hiding one thing at a time when a defect is
    // hunted, and for a script to find where a thing is on screen
    if (process.env.NODE_ENV !== "production")
      Object.assign(window, { __scene: scene, __camera: camera });
    return () => setLive(null);
  }, [scene, camera, w, d, h, spanW, spanD, centre, corner, shot, sun]);
  return null;
}

/** the frame bench's hook: each frame's time by the wall clock while
    a bench runs, and the GPU's time read back where the device says */
function BenchFrames() {
  const gl = useThree((s) => s.gl);
  const last = useRef({ at: 0 });
  useEffect(() => {
    const info = (gl as unknown as { info: { memory: { programs?: number } } })
      .info;
    recorder.programs = () => info.memory.programs ?? 0;
    return () => {
      recorder.programs = null;
    };
  }, [gl]);
  useFrame(() => {
    if (!recorder.running) {
      last.current.at = 0;
      return;
    }
    const dt = stepOf(last.current);
    if (dt <= 0) return;
    const r = gl as unknown as {
      info: { render: { timestamp: number } };
      resolveTimestampsAsync?: (type: string) => Promise<unknown>;
    };
    recordFrame(dt * 1000, r.info.render.timestamp || undefined);
    void r.resolveTimestampsAsync?.("render").catch(() => undefined);
  });
  return null;
}

/** the side of the small panel's picture, px */
const LAST_FRAME_W = 640;
/**
 * The view's picture as it stands, kept for the small panel when the
 * plan takes the main column. A WebGPU canvas is read only in the frame
 * that drew it (once shown, its picture is gone, and a read after reads
 * black), so the picture is taken as the view settles, in that frame:
 * a bitmap made smaller at once, encoded off the frame.
 */
const keepLastFrame = (canvas: HTMLCanvasElement) => {
  if (
    typeof createImageBitmap !== "function" ||
    typeof OffscreenCanvas === "undefined" ||
    !canvas.width
  )
    return;
  const w = Math.min(LAST_FRAME_W, canvas.width);
  const h = Math.max(1, Math.round((canvas.height * w) / canvas.width));
  createImageBitmap(canvas, {
    resizeWidth: w,
    resizeHeight: h,
    resizeQuality: "medium",
  })
    .then((bitmap) => {
      // a frame not drawn reads black: it is not kept
      const probe = new OffscreenCanvas(8, 8).getContext("2d", {
        willReadFrequently: true,
      });
      probe?.drawImage(bitmap, 0, 0, 8, 8);
      const px = probe?.getImageData(0, 0, 8, 8).data;
      let sum = 0;
      for (let i = 0; px && i < px.length; i += 4)
        sum += px[i]! + px[i + 1]! + px[i + 2]!;
      if (px && sum / (px.length / 4) < 24) {
        bitmap.close();
        throw new Error("blank");
      }
      const small = new OffscreenCanvas(w, h);
      small.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      return small.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    })
    .then(
      (blob) =>
        new Promise<string>((done, fail) => {
          const read = new FileReader();
          read.onload = () => done(String(read.result));
          read.onerror = fail;
          read.readAsDataURL(blob);
        }),
    )
    .then((url) => useStudio.setState({ lastFrame: { url, of: shownNow() } }))
    .catch(() => {
      /* the drawn stand-in stays */
    });
};

/** the view's picture kept for the small panel as the plan takes the
    main column: one frame drawn there and then and read in the same
    task (a WebGPU canvas is read only in the frame that drew it), before
    the store changes the view */
function LastFrame() {
  const advance = useThree((s) => s.advance);
  const gl = useThree((s) => s.gl);
  useEffect(
    () =>
      onLeave3d(() => {
        try {
          advance(performance.now());
          keepLastFrame(gl.domElement);
        } catch {
          /* the drawn stand-in stays */
        }
      }),
    [advance, gl],
  );
  return null;
}

/** which backend the renderer came up on, for the stage to say and
    the store to know */
function Backend() {
  const gl = useThree((s) => s.gl);
  const setBackend = useStudio((s) => s.setBackend);
  useEffect(() => {
    setBackend(backendOf(gl), textureSideOf(gl), bytesPerSampleOf(gl));
  }, [gl, setBackend]);
  return null;
}

/** no frame until the backend is known: the canvas would otherwise draw
    the scene itself (a frame subscriber at a priority takes the drawing
    over) and build every shader in it at once, before the post chain is
    there to build them a part at a time (shader-warm.ts) */
function HoldFrames() {
  useFrame(() => undefined, 1);
  return null;
}

/** a stage of the picture's finish failed: say so once, draw plain */
/** the bytes a sample of colour attachments may hold on the device:
    the WebGPU device's limit, or WebGPU's floor on the WebGL backend */
const bytesPerSampleOf = (renderer: unknown): number => {
  const r = renderer as {
    backend?: {
      device?: { limits?: { maxColorAttachmentBytesPerSample?: number } };
    };
  };
  return (
    r.backend?.device?.limits?.maxColorAttachmentBytesPerSample ?? MRT_BYTES
  );
};

const failPost = (set: (failed: boolean) => void) => (error: unknown) => {
  console.warn("The picture's finish is off on this device.", error);
  set(true);
};

/** the sun over the flat, the day's or an evening's (warmer and lower),
    and a whisper of the sky's fill from above against the floor's from
    below. A room is lit through its windows: the sun stands where it
    stands over Singapore at the hour asked (sun-position.ts), one sun
    for the whole flat, so it comes in only by the windows on its side
    and lays its patch on their floors; every window lets in the sky's
    soft light too (WindowLights), so a room is bright by its windows
    and falls off away from them; the probes carry the bounce to the
    ceiling and the far side (Probes.tsx), and the exposure is set for
    the walls with the windows let go white (studio-store's
    `SCENE_DEFAULT.exposure`, one for each light) */
const LIGHTS = {
  day: {
    sun: 11,
    colour: "#fff3e2",
    // the sky's fill only lifts the deepest shade a hair: the windows
    // carry the soft light now, and lit from every side at once a room
    // reads flat and milky, with no fall-off from its windows
    sky: 0.2,
    // the sky's fill: a little cooler than the sun, as daylight is,
    // but near neutral
    fill: "#ebe6dd",
  },
  // the evening: the sun low at the horizon and dim, the sky's fill
  // near gone, so the room is carried by its lamps (Lamp in
  // Furniture3D, CeilingLight here), warm pools with darker corners
  // between, the window dusk outside
  evening: {
    sun: 1.5,
    colour: "#ffc68c",
    // near gone: the corners away from the lamps fall dark; and the
    // lamps' colour, since what fills a lamp-lit room at night is the
    // lamps' light come back off its walls (a blue fill, under the
    // evening's white balance, turned the whole room blue)
    sky: 0.06,
    fill: LAMP_BULB,
  },
} as const;
/** how far from the flat's middle the sun's light stands, m, and the
    evening's hour (the sun at dusk, a few degrees over the horizon) */
const SUN = { distance: 30, dusk: 18.8, bias: 0.003 };
/** what the floor gives back to the undersides: a light floor's tone,
    as a light floor bounces light up */
const GROUND_HEX = "#d6cabb";

/** the picture's white balance for its look: by day as it is; in the
    evening set for the light a wall gets, the lamps' with the dusk's, as
    a camera's white balance lands, so a white wall reads a warm white
    and not orange, while the lamps' own pools stay warmer
    (white-balance.ts) */
const EVENING_BALANCE = balanceGain(EVENING_LIGHT);
function WhiteBalance({ evening }: { evening: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    WHITE_BALANCE.value.set(...(evening ? EVENING_BALANCE : NO_BALANCE));
    invalidate();
  }, [evening, invalidate]);
  return null;
}
const NO_BALANCE: Vector3Tuple = [1, 1, 1];

/** the room's ceiling light as a light: a spot under the flush
    diffuser (Room3D draws it), pointing down with a wide, soft edge,
    off by day and lit in the evening; intensity in candela. One, in
    the room being worked on, always there (at nothing by day), so the
    light count, and with it every shader, stays as it is */
const CEILING_LIGHT = {
  colour: "#ffc48a",
  evening: 20,
  angle: 1.15,
  penumbra: 1,
  drop: 0.05,
};
function CeilingLight({
  x,
  y,
  z,
  lit,
}: {
  x: number;
  y: number;
  z: number;
  lit: boolean;
}) {
  const spot = useRef<SpotLight>(null);
  useLayoutEffect(() => {
    const l = spot.current;
    if (!l) return;
    l.target.position.set(x, 0, z);
    l.target.updateMatrixWorld();
  }, [x, z]);
  return (
    <spotLight
      ref={spot}
      position={[x, y, z]}
      color={CEILING_LIGHT.colour}
      intensity={lit ? CEILING_LIGHT.evening : 0}
      angle={CEILING_LIGHT.angle}
      penumbra={CEILING_LIGHT.penumbra}
    />
  );
}

/** the renderer's tone mapping and exposure follow the look */
function Exposure({ value }: { value: number }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, invalidate } = get();
    // fiber sets its own tone mapping on a renderer made by a function:
    // the picture's is set here, with its exposure
    gl.toneMapping = TONE_MAPPING;
    gl.toneMappingExposure = value;
    invalidate();
  }, [get, value]);
  return null;
}
/** the floor grid's lines */
const GRID_HEX = "#b9a797";

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const GLIDE = 0.6; // s, the camera's move between angles
/** the opening: the whole flat from above at an isometric angle, held a
    moment once the room is drawn, then the camera eases in to the room's
    corner; once a page load, never under reduced motion or automation */
const INTRO = { hold: 1.1, glide: 2.6, elevation: 36, distance: 1.25 };
let introDone = false;
/** the next change of room keeps the view: a room taken up by a pick in
    3D, where the camera stays and only the scene's origin moves */
let viewHeld = false;
const holdView = () => {
  viewHeld = true;
};
/** a long camera move is wanted: not under reduced motion, and not in a
    driven browser (the tests), where a software renderer would spend a
    minute on it */
const motionWanted = () =>
  !reduced() && typeof navigator !== "undefined" && !navigator.webdriver;
const introWanted = () => !introDone && motionWanted();
/** the isometric pose over the whole flat, from the side of the room's
    corner, m */
const overviewPose = (
  w: number,
  d: number,
  centre: readonly [number, number],
  corner: Corner,
  aspect: number,
) => {
  const [sx, sz] = corner;
  const at = new Vector3(centre[0], 0.4, centre[1]);
  const span = Math.max(w, d) * Math.max(1, Math.sqrt(1.6 / aspect));
  const dist =
    (span * INTRO.distance) / Math.tan((FOV.overview * Math.PI) / 360) / 2;
  const up = (INTRO.elevation * Math.PI) / 180;
  // a little off the corner's diagonal, so the long walls read
  const yaw = Math.atan2(sx * 0.62, sz * 1);
  const pos = new Vector3(
    at.x + dist * Math.cos(up) * Math.sin(yaw),
    at.y + dist * Math.sin(up),
    at.z + dist * Math.cos(up) * Math.cos(yaw),
  );
  return { pos, at };
};
/** the seconds since the last frame, by the wall clock: the frame
    loop's own clock stands still between frames drawn on demand, so a
    slow renderer would creep through a glide one sliver a frame */
const stepOf = (last: { at: number }) => {
  const now = performance.now();
  const dt = last.at ? (now - last.at) / 1000 : 0;
  last.at = now;
  return dt;
};
const WALK_SPEED = 1.6; // m/s
const TOUR_SPEED = 0.9; // m/s, a slow walk to look about
const TOUR_INSET = 1.2; // m, the default round keeps this off the walls
const TOUR_CLEAR = 0.4; // m, the round keeps this off the pieces
const TOUR_NEAR = 0.8; // m, this close to what it looks at, it looks ahead
const TOUR_LOOK_AT = 0.9; // m, the height the tour's eye settles on
const DRAG_FROM_M = 0.03; // m, a press that travels less is a click
/** the longest step a frame may take, s: a slow frame (or the first after
    a pause) moves the camera this far at most, never a leap */
const FRAME_MAX = 0.25;

type WalkState = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  keys: Set<string>;
  goto: { x: number; z: number } | null;
  /** where a drag has the view looking: the heading eases to it */
  look: { yaw: number; pitch: number } | null;
  /** ask the scene for a frame: set by the walker while it is mounted */
  wake: () => void;
  /** the tour under way: its path in metres, how far along, and the
      time since progress was last reported */
  tour: {
    pts: { x: number; z: number }[];
    gone: number;
    total: number;
    since: number;
  } | null;
};

/** a piece's box on the floor, metres from the room's middle */
type Block = { x: number; z: number; w: number; d: number };
/** where the pieces are, taken together: the room's middle with none */
const middleOf = (blocks: Block[]) => {
  if (blocks.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const b of blocks) {
    x += b.x;
    z += b.z;
  }
  return { x: x / blocks.length, z: z / blocks.length };
};

/** how far up or down the walker looks, rad; how quickly the heading
    catches a drag up, per second */
const LOOK_PITCH = 1.1;
const LOOK_EASE = 18;
/** the walker's place and heading: one scene, one walker */
const WALK: WalkState = {
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  keys: new Set(),
  goto: null,
  look: null,
  wake: () => undefined,
  tour: null,
};

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** whether a project switch is being shown, written on the stage */
const switching = (stage: RefObject<HTMLDivElement | null>, on: boolean) => {
  const el = stage.current;
  if (el) el.dataset.switching = String(on);
};
/** the switch's glide: a moment over the flat, then into the room */
const SWITCH = { hold: 0.15, glide: 1.6 };
/** whether the opening is under way, written on the stage */
const intro = (stage: RefObject<HTMLDivElement | null>, on: boolean) => {
  const el = stage.current;
  if (el) el.dataset.intro = String(on);
};

/** the camera's place written on the stage, for the record and the tests */
const report = (stage: RefObject<HTMLDivElement | null>, p: Vector3) => {
  const el = stage.current;
  if (!el) return;
  const v = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
  if (el.dataset.cam !== v) el.dataset.cam = v;
};

/** whether the camera is on its way to an angle, written on the stage
    so a picture waits for it to arrive */
const reportGliding = (
  stage: RefObject<HTMLDivElement | null>,
  gliding: boolean,
) => {
  const el = stage.current;
  if (!el) return;
  const v = String(gliding);
  if (el.dataset.gliding !== v) el.dataset.gliding = v;
};

type Controls = {
  target: Vector3;
  update: () => void;
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
} | null;

/** the orbit held off (and true when it was on to be held), or let go */
const holdOrbit = (controls: unknown, hold: boolean) => {
  const c = controls as { enabled: boolean } | null;
  if (!c) return false;
  if (hold) {
    if (!c.enabled) return false;
    c.enabled = false;
    return true;
  }
  c.enabled = true;
  return false;
};

/** how far past the flat's box the view's centre may be moved, m */
const PAN_REACH = 1;
const ORIGIN = new Vector3();
/** the piece under the pointer, kept apart from the stage's state: the
    pointer crossing the room draws again the piece it enters and the one
    it leaves, not every piece in the flat */
const useHovered = create<{ id: string | null }>(() => ({ id: null }));
const hoverPiece = (id: string, on: boolean) =>
  useHovered.setState((s) => ({ id: on ? id : s.id === id ? null : s.id }));
/** a camera's lens, vertical degrees (the stage's camera is always a
    perspective one), and the lens set */
const lensOf = (camera: Camera) =>
  (camera as PerspectiveCamera).fov ?? FOV.overview;
const setLens = (camera: Camera, fov: number) => {
  const c = camera as PerspectiveCamera;
  if (!c.isPerspectiveCamera || c.fov === fov) return;
  c.fov = fov;
  c.updateProjectionMatrix();
};

/** the frame's shift down, a share of its height (a shift lens): the
    frustum moved down in the projection, after three has made it, so
    it stands with TRAA's jitter, which owns the camera's view offset
    and sets and clears it every frame */
const shiftOf = (camera: Camera) =>
  (camera.userData.shift as number | undefined) ?? 0;
const shifting = new WeakSet<PerspectiveCamera>();
const setShift = (camera: Camera, shift: number) => {
  const c = camera as PerspectiveCamera;
  if (!c.isPerspectiveCamera || Math.abs(shiftOf(c) - shift) < 1e-4) return;
  if (!shifting.has(c)) {
    shifting.add(c);
    const made = c.updateProjectionMatrix.bind(c);
    c.updateProjectionMatrix = () => {
      made();
      const s = shiftOf(c);
      if (!s) return;
      // a frustum moved down by `s` of its height: its top and bottom
      // both lower, so (top + bottom) / (top - bottom) less 2s
      c.projectionMatrix.elements[9]! -= 2 * s;
      c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
    };
  }
  c.userData.shift = shift;
  c.updateProjectionMatrix();
};

/** the camera glides to the angle's place */
function Rig({
  angle,
  w,
  d,
  h,
  centre,
  roomW,
  roomD,
  corner,
  framing,
  stage,
}: {
  angle: Angle;
  /** the flat's box, m, and its middle from the active room's */
  w: number;
  d: number;
  h: number;
  centre: readonly [number, number];
  /** the room being worked on, m: the perspective looks into it, from
      this corner */
  roomW: number;
  roomD: number;
  corner: Corner;
  /** the Corner view's step along its wall and its lens */
  framing?: Framing | undefined;
  stage: RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as Controls;
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const glide = useRef<{
    from: Vector3;
    fromAt: Vector3;
    to: Vector3;
    toAt: Vector3;
    /** the lens, vertical degrees, from and to */
    fromFov: number;
    toFov: number;
    /** the frame's shift, from and to */
    fromShift: number;
    toShift: number;
    t: number;
    /** the opening's: seconds to hold first, its own length, and whether
        it waits for the room to be drawn */
    hold?: number;
    length?: number;
    waits?: boolean;
    /** a project switch being shown */
    switching?: boolean;
  } | null>(null);
  const free = useStudio((s) => s.free);
  const switchedAt = useStudio((s) => s.switchedAt);
  const seenSwitch = useRef(switchedAt);
  // the view moved by hand since the camera last glided to its angle:
  // a new size for the canvas (a window or a panel resized, a phone
  // turned) keeps it; a new angle or room glides as ever
  const moved = useRef(false);
  const placed = useRef("");
  /** the flat's middle from the active room's as the view last stood */
  const shownCentre = useRef<readonly [number, number] | null>(null);
  useEffect(() => {
    // turned by hand: the camera stays where the cube or the canvas put
    // it; the angle picked again, free cleared, glides back to it
    if (free) return;
    // another project opened from the menu: shown from above and then
    // into the room, as the opening is, so the change is seen (the same
    // room at the same angle would otherwise glide nowhere)
    const switched = seenSwitch.current !== switchedAt;
    seenSwitch.current = switchedAt;
    if (switched) {
      placed.current = "";
      moved.current = false;
      viewHeld = false;
    }
    const key = JSON.stringify([angle, w, d, h, centre, roomW, roomD, corner]);
    const was = shownCentre.current;
    shownCentre.current = centre;
    if (viewHeld && was && placed.current) {
      // the room changed under a pick: the scene stands about the new
      // room's middle, so the camera moves with it and the picture holds
      viewHeld = false;
      const dx = centre[0] - was[0];
      const dz = centre[1] - was[1];
      const shift = new Vector3(dx, 0, dz);
      camera.position.add(shift);
      controls?.target.add(shift);
      controls?.update();
      glide.current = null;
      placed.current = key;
      moved.current = true;
      invalidate();
      return;
    }
    viewHeld = false;
    if (key === placed.current && moved.current) return;
    placed.current = key;
    moved.current = false;
    const aspect = size.height ? size.width / size.height : 1.5;
    const {
      pos,
      at,
      fov,
      shift = 0,
    } = cameraFor(
      angle,
      w,
      d,
      h,
      centre,
      { w: roomW, d: roomD, corner, ...(framing ? { framing } : {}) },
      aspect,
    );
    // a tall screen (a phone, a tablet upright) sees less across: an
    // overview stands further back so the flat still fits (the room's
    // corner shot opens its lens instead, standing in the room)
    const back =
      fov === FOV.overview ? Math.max(1, Math.sqrt(1.45 / aspect)) : 1;
    const toAt = new Vector3(...at);
    const to = new Vector3(...pos).sub(toAt).multiplyScalar(back).add(toAt);
    // the opening under way keeps going: a size or room settling as the
    // page loads moves only where it lands
    const g = glide.current;
    if (g?.waits) {
      g.to = to;
      g.toAt = toAt;
      g.toFov = fov;
      g.toShift = shift;
      invalidate();
      return;
    }
    // a switch without the move still says it was shown
    if (switched && !motionWanted()) switching(stage, false);
    if (
      (switched && motionWanted()) ||
      (angle === "Perspective" && introWanted())
    ) {
      // the opening: the camera stands over the whole flat first
      if (!switched) introDone = true;
      const o = overviewPose(w, d, centre, corner, aspect);
      camera.position.copy(o.pos);
      camera.lookAt(o.at);
      setLens(camera, FOV.overview);
      controls?.target.copy(o.at);
      controls?.update();
      glide.current = {
        from: o.pos.clone(),
        fromAt: o.at.clone(),
        to,
        toAt,
        fromFov: FOV.overview,
        toFov: fov,
        fromShift: 0,
        toShift: shift,
        t: 0,
        hold: switched ? SWITCH.hold : INTRO.hold,
        length: switched ? SWITCH.glide : INTRO.glide,
        waits: !switched,
        switching: switched,
      };
      if (switched) switching(stage, true);
      else intro(stage, true);
      invalidate();
      return;
    }
    glide.current = {
      from: camera.position.clone(),
      fromAt: controls?.target.clone() ?? new Vector3(0, h / 2, 0),
      to,
      toAt,
      fromFov: lensOf(camera),
      toFov: fov,
      fromShift: shiftOf(camera),
      toShift: shift,
      t: reduced() ? 1 : 0,
    };
    invalidate();
  }, [
    angle,
    stage,
    free,
    switchedAt,
    w,
    d,
    h,
    centre,
    roomW,
    roomD,
    corner,
    framing,
    camera,
    controls,
    invalidate,
    size,
  ]);
  // the cube's drag: the camera goes round its target at its distance
  const turn = useStudio((s) => s.turn);
  useEffect(() => {
    if (!turn) return;
    const at = controls?.target.clone() ?? new Vector3(0, h / 2, 0);
    const dist = camera.position.distanceTo(at);
    glide.current = null;
    camera.position.set(
      at.x + dist * Math.sin(turn.yaw) * Math.cos(turn.pitch),
      at.y + dist * Math.sin(turn.pitch),
      at.z + dist * Math.cos(turn.yaw) * Math.cos(turn.pitch),
    );
    camera.lookAt(at);
    controls?.update();
    invalidate();
  }, [turn, camera, controls, h, invalidate]);
  // the wheel, a pinch and two fingers on a trackpad, over the stage and
  // anything on it, before the orbit's own handlers: a pinch or a notch
  // zooms by as much as the fingers or the notch moved, two fingers on a
  // trackpad move the view (as on the plan), and the page never zooms
  const wheelMode = useStudio((s) => s.wheelMode);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ready = () => controls !== null && controls.enabled;
    const dolly = (factor: number) => {
      if (!controls) return;
      const at = controls.target;
      const v = camera.position.clone().sub(at);
      const len = Math.min(
        controls.maxDistance,
        Math.max(controls.minDistance, v.length() / factor),
      );
      camera.position.copy(at).add(v.setLength(len));
      settleView();
    };
    const pan = (dx: number, dy: number) => {
      if (!controls) return;
      const at = controls.target;
      const dist = camera.position.distanceTo(at);
      const fov = lensOf(camera);
      const k =
        (2 * dist * Math.tan((fov * Math.PI) / 360)) /
        Math.max(1, el.clientHeight);
      camera.updateMatrixWorld();
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const shift = right
        .multiplyScalar(-dx * k)
        .add(up.multiplyScalar(dy * k));
      at.add(shift);
      camera.position.add(shift);
      settleView();
    };
    const settleView = () => {
      keepIn();
      moved.current = true;
      controls?.update();
      invalidate();
    };
    // the view's centre stays over the flat: moved past its box, the
    // camera comes back with it
    const keepIn = () => {
      if (!controls) return;
      const at = controls.target;
      const was = at.clone();
      at.x = Math.min(
        centre[0] + w / 2 + PAN_REACH,
        Math.max(centre[0] - w / 2 - PAN_REACH, at.x),
      );
      at.z = Math.min(
        centre[1] + d / 2 + PAN_REACH,
        Math.max(centre[1] - d / 2 - PAN_REACH, at.z),
      );
      at.y = Math.min(h, Math.max(0, at.y));
      camera.position.add(at.clone().sub(was));
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ready()) return;
      if (glide.current?.waits) intro(stage, false);
      glide.current = null;
      const read = readWheel(e, wheelMode);
      if (read.kind === "zoom") dolly(read.factor);
      else pan(read.dx, read.dy);
    };
    // Safari's trackpad pinch
    let scale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      scale = 1;
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
      if (!ready()) return;
      const g = e as GestureEvent;
      glide.current = null;
      dolly(g.scale / scale);
      scale = g.scale;
    };
    // the orbit's own drags (a turn, the right button or two fingers to
    // move): kept over the flat, and counted as the view moved by hand
    const onStart = () => {
      moved.current = true;
      // a hand on the view ends the opening where it stands
      if (glide.current?.waits || glide.current?.switching) {
        glide.current = null;
        intro(stage, false);
        switching(stage, false);
        reportGliding(stage, false);
      }
    };
    // the corner's shift lens is for the still picture: once the view is
    // turned by hand it eases out over a few frames (left in, a turned
    // camera's verticals lean and its horizon tilts)
    const onChange = () => {
      keepIn();
      const shift = shiftOf(camera);
      if (moved.current && shift && !glide.current)
        setShift(camera, shift < 0.005 ? 0 : shift * 0.75);
    };
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("gesturestart", onGestureStart, { capture: true });
    el.addEventListener("gesturechange", onGesture, { capture: true });
    controls?.addEventListener("start", onStart);
    controls?.addEventListener("change", onChange);
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("gesturestart", onGestureStart, {
        capture: true,
      });
      el.removeEventListener("gesturechange", onGesture, { capture: true });
      controls?.removeEventListener("start", onStart);
      controls?.removeEventListener("change", onChange);
    };
  }, [stage, camera, controls, invalidate, wheelMode, w, d, h, centre]);
  const last = useRef({ at: 0 });
  const introWake = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(introWake.current);
      introWake.current = 0;
    },
    [],
  );
  useFrame(() => {
    // the clock runs while the scene rests: a frame after a pause steps
    // no further than a tenth of a second
    const dt = Math.min(stepOf(last.current), FRAME_MAX);
    const g = glide.current;
    // the opening waits for the room's first picture, then holds on the
    // whole flat a moment
    if (g?.waits && stage.current?.dataset.drawn !== "true") {
      wakeAt(introWake, performance.now() + 200, invalidate);
      return;
    }
    // the opening and a project switch hold on the flat a moment first
    if (g && (g.hold ?? 0) > 0) {
      g.hold = (g.hold ?? 0) - dt;
      invalidate();
      return;
    }
    if (g) {
      g.t = Math.min(1, g.t + dt / (g.length ?? GLIDE));
      // the opening eases in and out; a move between angles eases out
      const k = g.length
        ? g.t < 0.5
          ? 4 * g.t * g.t * g.t
          : 1 - Math.pow(-2 * g.t + 2, 3) / 2
        : 1 - Math.pow(1 - g.t, 3);
      camera.position.lerpVectors(g.from, g.to, k);
      setLens(camera, g.fromFov + (g.toFov - g.fromFov) * k);
      setShift(camera, g.fromShift + (g.toShift - g.fromShift) * k);
      const at = g.fromAt.clone().lerp(g.toAt, k);
      camera.lookAt(at);
      controls?.target.copy(at);
      controls?.update();
      if (g.t >= 1) {
        glide.current = null;
        if (g.waits) intro(stage, false);
        if (g.switching) switching(stage, false);
      } else invalidate();
      reportGliding(stage, g.t < 1);
    }
    report(stage, camera.position);
    // where the camera stands about its target, for the cube
    const at = controls?.target ?? ORIGIN;
    const dx = camera.position.x - at.x;
    const dy = camera.position.y - at.y;
    const dz = camera.position.z - at.z;
    useStudio.getState().reportCam({
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    });
  });
  return null;
}

/** the camera at eye height, moved by the keys and turned by a drag */
function Walker({
  w,
  d,
  outline,
  walkable,
  blocks,
  corner,
  stage,
}: {
  w: number;
  d: number;
  /** the corner the walk starts in, the room's picture's */
  corner: Corner;
  /** the room's outline, mm; the tour's round keeps inside it */
  outline: readonly (readonly [number, number])[];
  /** standing room: the rooms' floors and the doorways between them */
  walkable: (x: number, z: number) => boolean;
  /** the pieces on the floor, metres from the room's middle: the tour
      looks at them and its round keeps clear of them */
  blocks: Block[];
  stage: RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const touring = useStudio((s) => s.touring);
  // read when a tour starts and as it goes, without restarting it
  const live = useRef(blocks);
  useEffect(() => {
    live.current = blocks;
  }, [blocks]);
  useEffect(() => {
    // in from the room's corner, looking level into the room, with the
    // room's own lens and no shift (the corner shot's is its own)
    const s = WALK;
    const start = walkStart(
      w,
      d,
      gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight),
      corner,
    );
    [s.x, , s.z] = start.pos;
    s.yaw = Math.atan2(start.pos[0] - start.at[0], start.pos[2] - start.at[2]);
    s.pitch = Math.asin(start.at[1] - EYE);
    s.goto = null;
    s.look = null;
    s.wake = invalidate;
    camera.position.set(s.x, EYE, s.z);
    setLens(camera, start.fov);
    setShift(camera, 0);
    camera.rotation.set(0, 0, 0, "YXZ");
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      // a shortcut (⌘S, Ctrl+D) is not a step: and a Mac sends no key-up
      // for a letter let go while ⌘ is held, so it would walk for ever
      if (e.metaKey || e.ctrlKey || e.altKey) {
        s.keys.clear();
        return;
      }
      const key = e.key.toLowerCase();
      // the arrows walk; they do not scroll a list or move a slider too
      if (key.startsWith("arrow")) e.preventDefault();
      s.keys.add(key);
      // a key takes the walk over from the tour
      if (s.tour && !e.key.startsWith("Esc")) useStudio.getState().stopTour();
      invalidate();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") s.keys.clear();
      s.keys.delete(e.key.toLowerCase());
    };
    // the window left (another tab, an app switched to): nothing is held
    const release = () => s.keys.clear();
    // one pointer looks round at a time, the main button or a finger
    let look: { x: number; y: number; id: number } | null = null;
    const el = gl.domElement;
    const pdown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (look && look.id !== e.pointerId) return;
      look = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (s.tour) useStudio.getState().stopTour();
    };
    // the room is taken hold of and moved, as a photo sphere is: it
    // follows the hand, the point under it staying there (an angle a
    // pixel from the lens), and the heading eases after it
    const pmove = (e: PointerEvent) => {
      if (!look || look.id !== e.pointerId) return;
      const lens = camera as PerspectiveCamera;
      const k =
        ((lens.fov ?? 60) * Math.PI) / 180 / Math.max(1, el.clientHeight);
      const to = s.look ?? { yaw: s.yaw, pitch: s.pitch };
      s.look = {
        yaw: to.yaw + (e.clientX - look.x) * k,
        pitch: Math.max(
          -LOOK_PITCH,
          Math.min(LOOK_PITCH, to.pitch + (e.clientY - look.y) * k),
        ),
      };
      look = { x: e.clientX, y: e.clientY, id: e.pointerId };
      invalidate();
    };
    const pup = (e: PointerEvent) => {
      if (look?.id === e.pointerId) look = null;
    };
    // the right button looks for nothing here: no menu over the walk
    const menu = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointerdown", pdown);
    window.addEventListener("pointermove", pmove);
    window.addEventListener("pointerup", pup);
    window.addEventListener("pointercancel", pup);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    el.addEventListener("contextmenu", menu);
    return () => {
      s.keys.clear();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointerdown", pdown);
      window.removeEventListener("pointermove", pmove);
      window.removeEventListener("pointerup", pup);
      window.removeEventListener("pointercancel", pup);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      el.removeEventListener("contextmenu", menu);
    };
  }, [camera, gl, w, d, corner, invalidate]);
  // the tour: through the stops on the plan, or, with fewer than two, a
  // round of the room inset from its walls, each corner brought in off
  // the pieces; starting from where the walker stands
  useEffect(() => {
    const s = WALK;
    if (!touring) {
      s.tour = null;
      return;
    }
    // the stops are on the sheet; the walk is about the active room's middle
    const [px, pz] = activeOf(useRoom.getState()).pos;
    const toM = ([x, y]: readonly [number, number]) => ({
      x: toMetres(x - px) - w / 2,
      z: toMetres(y - pz) - d / 2,
    });
    const stops = useRoom.getState().stops.map(toM);
    const inset = Math.max(0.5, Math.min(TOUR_INSET, Math.min(w, d) / 2 - 0.3));
    const inRoom = walkable;
    // standing room: inside the walls with a little to spare, off the
    // pieces by the clearance
    const clear = (x: number, z: number) =>
      inRoom(x, z) &&
      inRoom(x - 0.3, z) &&
      inRoom(x + 0.3, z) &&
      inRoom(x, z - 0.3) &&
      inRoom(x, z + 0.3) &&
      !live.current.some(
        (b) =>
          Math.abs(x - b.x) < b.w / 2 + TOUR_CLEAR &&
          Math.abs(z - b.z) < b.d / 2 + TOUR_CLEAR,
      );
    // a corner, or the nearest standing room round it, searched in
    // rings; none within reach and the round skips that corner
    const corner = (x: number, z: number) => {
      if (clear(x, z)) return { x, z };
      for (let r = 0.2; r <= 2; r += 0.2)
        for (let i = 0; i < 16; i++) {
          const px = x + r * Math.cos((i * Math.PI) / 8);
          const pz = z + r * Math.sin((i * Math.PI) / 8);
          if (clear(px, pz)) return { x: px, z: pz };
        }
      return null;
    };
    const round = [
      [-w / 2 + inset, -d / 2 + inset],
      [w / 2 - inset, -d / 2 + inset],
      [w / 2 - inset, d / 2 - inset],
      [-w / 2 + inset, d / 2 - inset],
    ]
      .map(([x, z]) => corner(x!, z!))
      .filter((c) => c !== null);
    // the round comes back to where it began
    const path =
      stops.length >= 2
        ? stops
        : round.length > 2
          ? [...round, round[0]!]
          : round;
    const pts = [{ x: s.x, z: s.z }, ...path];
    let total = 0;
    for (let i = 1; i < pts.length; i++)
      total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
    s.tour = { pts, gone: 0, total: Math.max(total, 0.01), since: 0 };
    s.look = null;
    s.goto = null;
    useStudio.getState().setTourAt(0, 1, path.length);
    invalidate();
  }, [touring, w, d, outline, walkable, invalidate]);
  const last = useRef({ at: 0 });
  useFrame(() => {
    const dt = Math.min(stepOf(last.current), FRAME_MAX);
    const s = WALK;
    if (s.keys.size || s.goto || s.tour) invalidate();
    const t = s.tour;
    if (t) {
      // along the path at a slow walk, the heading eased towards each leg
      t.gone = Math.min(t.total, t.gone + TOUR_SPEED * dt);
      let left = t.gone;
      let seg = 1;
      while (seg < t.pts.length - 1) {
        const a = t.pts[seg - 1]!;
        const b = t.pts[seg]!;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (left <= len) break;
        left -= len;
        seg++;
      }
      const a = t.pts[seg - 1]!;
      const b = t.pts[seg] ?? a;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const k = Math.min(1, left / len);
      s.x = a.x + (b.x - a.x) * k;
      s.z = a.z + (b.z - a.z) * k;
      // the eye on the room: the middle of the pieces (the room's middle
      // when it is bare), a little down at it; when right by it, ahead
      // along the path instead, so the camera does not spin
      const at = middleOf(live.current);
      const away = Math.hypot(at.x - s.x, at.z - s.z);
      const to = away > TOUR_NEAR ? at : b;
      const want = Math.atan2(-(to.x - s.x), -(to.z - s.z));
      const down = Math.max(
        -0.5,
        Math.min(-0.08, Math.atan2(TOUR_LOOK_AT - EYE, Math.max(away, 1))),
      );
      let delta = want - s.yaw;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      s.yaw += delta * Math.min(1, dt * 2.5);
      s.pitch += (down - s.pitch) * Math.min(1, dt * 2);
      t.since += dt;
      if (t.since > 0.1) {
        t.since = 0;
        useStudio.getState().setTourAt(t.gone / t.total, seg);
      }
      if (t.gone >= t.total) {
        s.tour = null;
        useStudio.getState().setTourAt(1, seg);
        useStudio.getState().stopTour();
      }
      camera.position.set(s.x, EYE, s.z);
      camera.rotation.set(s.pitch, s.yaw, 0, "YXZ");
      report(stage, camera.position);
      return;
    }
    if (s.look) {
      const k = 1 - Math.exp(-dt * LOOK_EASE);
      s.yaw += (s.look.yaw - s.yaw) * k;
      s.pitch += (s.look.pitch - s.pitch) * k;
      if (
        Math.abs(s.look.yaw - s.yaw) < 1e-4 &&
        Math.abs(s.look.pitch - s.pitch) < 1e-4
      ) {
        s.yaw = s.look.yaw;
        s.pitch = s.look.pitch;
        s.look = null;
      } else invalidate();
    }
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    let mx = 0;
    let mz = 0;
    if (s.keys.has("w") || s.keys.has("arrowup")) {
      mx += fx;
      mz += fz;
    }
    if (s.keys.has("s") || s.keys.has("arrowdown")) {
      mx -= fx;
      mz -= fz;
    }
    if (s.keys.has("a") || s.keys.has("arrowleft")) {
      mx += fz;
      mz -= fx;
    }
    if (s.keys.has("d") || s.keys.has("arrowright")) {
      mx -= fz;
      mz += fx;
    }
    if (mx || mz) {
      const len = Math.hypot(mx, mz);
      s.x += (mx / len) * WALK_SPEED * dt;
      s.z += (mz / len) * WALK_SPEED * dt;
      s.goto = null;
    } else if (s.goto) {
      s.x += (s.goto.x - s.x) * Math.min(1, dt * 5);
      s.z += (s.goto.z - s.z) * Math.min(1, dt * 5);
      if (Math.hypot(s.goto.x - s.x, s.goto.z - s.z) < 0.02) s.goto = null;
    }
    s.x = Math.max(-w / 2 + 0.3, Math.min(w / 2 - 0.3, s.x));
    s.z = Math.max(-d / 2 + 0.3, Math.min(d / 2 - 0.3, s.z));
    // not through a wall of a room that is not a box: stay where it was
    const inside = insideOutline(
      (s.x + w / 2) * 1000,
      (s.z + d / 2) * 1000,
      outline,
    );
    if (!inside) {
      s.x = camera.position.x;
      s.z = camera.position.z;
      s.goto = null;
    }
    camera.position.set(s.x, EYE, s.z);
    camera.rotation.set(s.pitch, s.yaw, 0, "YXZ");
    report(stage, camera.position);
  });
  return null;
}

type PieceArgs = {
  /* every overlay goes into the scene's own layer: drei's default target,
     the canvas's parent, is not there yet for the first piece's labels */
  portal: RefObject<HTMLDivElement>;
  node: AssetNode;
  props: PieceProps;
  at: Vector3Tuple;
  /** radians about the vertical */
  turn: number;
  size: Vector3Tuple;
  colour: string;
  /** the parts' colours, one bay each, when the piece has parts */
  parts: string[];
  /** a render is taken: the picked piece shows no halo nor handles */
  rendering: boolean;
  clash: boolean;
  label: number;
  /** Select is on, the piece is not locked, nothing is in focus */
  canDrag: boolean;
  room: {
    W: number;
    D: number;
    w: number;
    d: number;
    outline: Point[];
    thickness: number;
  };
  /** the other pieces on the floor, in mm, which draw a dragged one too */
  others: (Rect & { id: string })[];
  actions: React.ReactNode;
  /** the picked piece's bar (PieceBar), when it may be arranged */
  bar: React.ReactNode;
  onPick: () => void;
  onDragging: (on: boolean) => void;
  /** the pointer over this piece gives it an outline, its name and the
      hand (not while a render is taken, nor in another room) */
  hoverable: boolean;
  /** the View settings: the name under the piece, edges on it */
  labels: boolean;
  edges: boolean;
};
/** the same numbers in two short lists */
const sameNums = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
/** two pieces' props the same field for field */
const sameProps = (a: PieceProps, b: PieceProps) =>
  a === b ||
  (Object.keys(a) as (keyof PieceProps)[]).every((k) => a[k] === b[k]);
/** under a drag, a piece that does not move is not drawn again: the room's
    list hands every piece a fresh place, size, closures and bar each
    frame, and every piece in the room, its labels and its forms were
    rendered again each frame of the drag. Mid-drag a piece is compared
    by what it shows (the one in hand moves, so it still renders); out
    of a drag every change renders as ever, so nothing it holds (its
    neighbours for the magnet, its bar) stands stale for the next one */
const samePieceMidDrag = (a: PieceArgs, b: PieceArgs) =>
  useScene.getState().dragFrom !== null &&
  a.node === b.node &&
  sameProps(a.props, b.props) &&
  sameNums(a.at, b.at) &&
  a.turn === b.turn &&
  sameNums(a.size, b.size) &&
  a.colour === b.colour &&
  a.parts.join() === b.parts.join() &&
  a.rendering === b.rendering &&
  a.clash === b.clash &&
  a.label === b.label &&
  a.canDrag === b.canDrag &&
  a.hoverable === b.hoverable &&
  a.labels === b.labels &&
  a.edges === b.edges &&
  a.room.W === b.room.W &&
  a.room.D === b.room.D &&
  a.room.outline === b.room.outline &&
  !a.actions === !b.actions;
const Piece = memo(PieceDrawn, samePieceMidDrag);

function PieceDrawn({
  portal,
  node,
  props,
  at,
  turn,
  size,
  colour,
  parts,
  rendering,
  clash,
  label,
  canDrag,
  room,
  others,
  actions,
  bar,
  onPick,
  onDragging,
  hoverable,
  labels,
  edges,
}: PieceArgs) {
  // a move under the pointer lands once a frame: a pointer
  // reports more often than the screen draws (a trackpad, 120 times a
  // second), and each report redrew everything that reads the scene
  const nextMove = useRef<(() => void) | null>(null);
  const moveFrame = useRef(0);
  const flushFrame = () => {
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = 0;
    const f = nextMove.current;
    nextMove.current = null;
    f?.();
  };
  const onFrame = (f: () => void) => {
    nextMove.current = f;
    if (!moveFrame.current)
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = 0;
        flushFrame();
      });
  };
  useEffect(() => () => cancelAnimationFrame(moveFrame.current), []);
  // the bar's place, worked out from the piece's size
  const placeBar = useMemo(() => aroundPiece(size), [size]);
  // in hand: its distance to the walls shows in place of its bar
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    hit: Vector3;
    x0: number;
    y0: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);
  // the orbit held off by a press on the piece, to be let go with it
  const held = useRef(false);
  const getThree = useThree((st) => st.get);
  const f = footprint(props);
  /** where it stands, mm from the room's north-west corner, against the
      room's walls */
  const gaps = () =>
    wallGaps(
      {
        x: (at[0] + room.w / 2) * 1000 - f.w / 2,
        y: (at[2] + room.d / 2) * 1000 - f.d / 2,
      },
      f,
      room.outline,
    );
  const hitFloor = (e: ThreeEvent<PointerEvent>) => {
    const p = new Vector3();
    return e.ray.intersectPlane(FLOOR, p) ? p : null;
  };
  // every handler on a three object is held stable: fiber takes a
  // re-created handler as a changed prop and asks for a frame, and a
  // frame per render would keep the stage from ever settling
  const onDown = useEvent((e: ThreeEvent<PointerEvent>) => {
    if (!canDrag || e.button !== 0) return;
    const hit = hitFloor(e);
    if (!hit) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    moved.current = false;
    // a press on a piece is the piece's: the view does not turn under it
    // for the first steps of a drag (the orbit hears the same press)
    held.current = holdOrbit(getThree().controls, true);
    // the spot is kept in mm from the room's north-west corner
    drag.current = {
      hit,
      x0: (at[0] + room.w / 2) * 1000 - f.w / 2,
      y0: (at[2] + room.d / 2) * 1000 - f.d / 2,
      moved: false,
    };
  });
  const onMove = useEvent((e: ThreeEvent<PointerEvent>) => {
    const dr = drag.current;
    if (!dr) return;
    const hit = hitFloor(e);
    if (!hit) return;
    const dx = hit.x - dr.hit.x;
    const dz = hit.z - dr.hit.z;
    if (!dr.moved) {
      if (Math.hypot(dx, dz) < DRAG_FROM_M) return;
      dr.moved = true;
      moved.current = true;
      useScene.getState().dragStart();
      onDragging(true);
      setDragging(true);
    }
    const to = settle(
      { x: dr.x0 + dx * 1000, y: dr.y0 + dz * 1000 },
      f,
      room,
      useStudio.getState().magnet,
      others.filter((o) => o.id !== node.id),
    );
    onFrame(() => useScene.getState().dragMove(node.id, to.x, to.y));
  });
  const onUp = useEvent(() => {
    if (held.current) holdOrbit(getThree().controls, false);
    held.current = false;
    const dr = drag.current;
    if (!dr) return;
    drag.current = null;
    // the last move lands before the drag ends
    flushFrame();
    if (dr.moved) {
      useScene.getState().dragEnd();
      onDragging(false);
      setDragging(false);
    }
  });
  const hovered = useHovered((s) => s.id === node.id) && hoverable;
  // read here, so a pick draws the piece let go and the one picked, not
  // the stage and every piece in the flat
  const selected = useScene((s) => s.selectedId === node.id) && !rendering;
  const onOver = useEvent((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (hoverable) hoverPiece(node.id, true);
  });
  const onOut = useEvent(() => hoverPiece(node.id, false));
  return (
    <group
      position={at}
      rotation={[0, turn, 0]}
      userData={{ name: node.name }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerOver={onOver}
      onPointerOut={onOut}
    >
      <Furniture3D
        edges={edges}
        hovered={hovered}
        node={node}
        size={size}
        colour={colour}
        parts={parts}
        texture={props.texture}
        doors={props.doors}
        accessories={props.accessories}
        panels={props.panels}
        editable={selected && !props.locked}
        selected={selected}
        clash={clash}
        onPick={() => {
          // the click after a drag is the drag's end, not a pick
          if (!moved.current) onPick();
        }}
      />
      {label >= 0 && (
        <Html
          portal={portal}
          position={[size[0] / 2, size[1] + 0.05, size[2] / 2]}
          center
          zIndexRange={[40, 30]}
        >
          <span
            className="stage-piece-tag stage-piece-tag-3d f-num"
            aria-label={`Label ${label + 1}`}
          >
            {label + 1}
          </span>
        </Html>
      )}
      {/* picked: a halo on the floor round the footprint says which piece
          is in hand; over it its bar, or its distance to the walls while
          it is dragged */}
      {selected && (
        <Halo size={size} colour={clash ? DANGER_HEX : ACCENT_HEX} />
      )}
      {canDrag && (dragging || (selected && bar && !actions)) && (
        <Html
          portal={portal}
          position={[0, 0, 0]}
          center
          zIndexRange={[45, 35]}
          calculatePosition={placeBar}
        >
          <div
            className="stage-piece-over stage-piece-over-3d"
            data-side="below"
          >
            {dragging ? <GapReadout {...gaps()} /> : bar}
          </div>
        </Html>
      )}
      {props.locked && (
        <Html
          portal={portal}
          position={[size[0] / 2, 0.08, size[2] / 2]}
          center
          zIndexRange={[20, 10]}
          style={{ pointerEvents: "none" }}
        >
          <span className="stage-3d-name" aria-hidden="true">
            <LockIcon size={10} />
          </span>
        </Html>
      )}
      {actions && (
        <Html
          portal={portal}
          position={[0, size[1] + 0.35, 0]}
          center
          zIndexRange={[60, 50]}
        >
          {actions}
        </Html>
      )}
      {/* the name floats just over the piece: the one under the pointer
          and the one picked carry theirs, every piece with the View
          setting on; a piece being turned shows its degrees instead */}
      {(labels || hovered || (selected && !bar)) && (
        <Html
          portal={portal}
          position={[0, size[1] + 0.05, 0]}
          center
          zIndexRange={[20, 10]}
          style={{ pointerEvents: "none" }}
        >
          <span className="stage-3d-name" aria-hidden="true">
            {node.name}
          </span>
        </Html>
      )}
    </group>
  );
}

/** the bar's place on the canvas: under the piece's outline as the
    camera sees it (its footprint's corners on the floor), or over its
    top where the shelf leaves no room below, so it never covers the
    piece; kept to the open stage between the side panels and under the
    top bar. The side it takes is written on the bar's holder */
const BAR_MARGIN = 8;
const BAR_GAP = 12;
const barCorner = new Vector3();
const aroundPiece =
  (
    size: Vector3Tuple,
  ): NonNullable<ComponentProps<typeof Html>["calculatePosition"]> =>
  (el, camera, view) => {
    const piece = el.parent ?? el;
    const onScreen = (x: number, y: number, z: number) => {
      barCorner.set(x, y, z);
      piece.localToWorld(barCorner).project(camera);
      return [
        ((barCorner.x + 1) / 2) * view.width,
        ((1 - barCorner.y) / 2) * view.height,
      ] as const;
    };
    const [w, h, d] = [size[0] / 2, size[1], size[2] / 2];
    const foot = [
      onScreen(-w, 0, -d),
      onScreen(w, 0, -d),
      onScreen(w, 0, d),
      onScreen(-w, 0, d),
    ];
    const head = [
      onScreen(-w, h, -d),
      onScreen(w, h, -d),
      onScreen(w, h, d),
      onScreen(-w, h, d),
    ];
    const all = [...foot, ...head];
    let x = all.reduce((t, p) => t + p[0], 0) / all.length;
    const below = Math.max(...all.map((p) => p[1])) + BAR_GAP;
    const above = Math.min(...all.map((p) => p[1])) - BAR_GAP;
    const holder = document.querySelector<HTMLElement>(
      ".stage-3d .stage-piece-over-3d",
    );
    const bar = holder?.firstElementChild as HTMLElement | null | undefined;
    const canvas = holder?.closest(".stage-3d")?.querySelector("canvas");
    if (!holder || !bar || !canvas) return [x, below];
    const c = canvas.getBoundingClientRect();
    const edge = (sel: string, side: "left" | "right" | "top" | "bottom") => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r && r.width > 0 ? r[side] : null;
    };
    const half = bar.offsetWidth / 2 + BAR_MARGIN;
    const lo = Math.max(c.left, edge(".shell-rail-left", "right") ?? c.left);
    const hi = Math.min(c.right, edge(".shell-rail-right", "left") ?? c.right);
    if (hi - lo > 2 * half)
      x = Math.min(hi - c.left - half, Math.max(lo - c.left + half, x));
    const top = Math.max(c.top, edge(".main-top", "bottom") ?? c.top) - c.top;
    const floor =
      Math.min(c.bottom, edge(".main-shelf", "top") ?? c.bottom) - c.top;
    const tall = bar.offsetHeight + BAR_MARGIN;
    // below when it fits there, else above, else as near as it can be
    const side =
      below + tall <= floor ? "below" : above - tall >= top ? "above" : "below";
    if (holder.dataset.side !== side) holder.dataset.side = side;
    const y =
      side === "below"
        ? Math.min(below, floor - tall)
        : Math.max(above, top + tall);
    return [x, y];
  };

/** the view seen again after the plan: one frame brings it up to what
    changed while it drew nothing */
function WakeWhenSeen({ seen }: { seen: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (seen) invalidate();
  }, [seen, invalidate]);
  return null;
}

/** the scene answers the pointer only once its picture is shown: behind
    the loading line the pieces are there but not seen, and a hover must
    not name them nor a click pick them */
function PointerWhen({ on }: { on: boolean }) {
  const setEvents = useThree((s) => s.setEvents);
  useEffect(() => {
    setEvents({ enabled: on });
  }, [on, setEvents]);
  return null;
}

/** drawn, never picked: a halo under the pointer leaves the pick to
    the piece */
const unpickable = () => null;
/** the height the halo lies at above the floor, m */
const HALO_Y = 0.006;
/** the halo's margin round the footprint, m, and its picture's size */
const HALO_OUT = 0.12;
const HALO_PX = 256;
const halos = new Map<string, CanvasTexture>();
/** a rounded rectangle in the colour, stroked and faintly filled, as
    the picture a halo lies on the floor as; kept by its proportion to
    a hundredth (the picture is stretched over the footprint, so two
    sizes of one shape share it), which keeps the set small however
    many sizes a piece is given */
const haloTexture = (w: number, d: number, colour: string) => {
  const aspect = Math.round((d / w) * 100) / 100;
  const key = `${aspect},${colour}`;
  const had = halos.get(key);
  if (had) return had;
  const c = document.createElement("canvas");
  const px = HALO_PX;
  c.width = px;
  c.height = Math.max(8, Math.round(px * aspect));
  const ctx = c.getContext("2d")!;
  const inset = px * 0.03;
  const r = px * 0.05;
  ctx.beginPath();
  ctx.roundRect(inset, inset, c.width - 2 * inset, c.height - 2 * inset, r);
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.12;
  ctx.fill();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = px * 0.014;
  ctx.strokeStyle = colour;
  ctx.stroke();
  const t = new CanvasTexture(c);
  t.anisotropy = 4;
  halos.set(key, t);
  return t;
};
function Halo({
  size: [w, , d],
  colour,
}: {
  size: Vector3Tuple;
  colour: string;
}) {
  const hw = w + 2 * HALO_OUT;
  const hd = d + 2 * HALO_OUT;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, HALO_Y, 0]}
      raycast={unpickable}
      userData={HELPER_TAG}
    >
      <planeGeometry args={[hw, hd]} />
      <meshBasicMaterial
        map={haloTexture(hw, hd, colour)}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/** what the active room does that the others do not: its pieces are
    dragged, named and hovered, its floor is walked on and reflects,
    and its pieces are the probes' and the export's */
type Working = {
  canDrag: boolean;
  labels: boolean;
  walk: boolean;
  onWalkTo: (x: number, z: number) => void;
  reflection: { stamp: string; onState: (state: StillState) => void } | null;
  onDragging: (on: boolean) => void;
  pieces: RefObject<Group | null>;
};
const NO_TAG = {} as const;

/**
 * A room of the flat, standing where it does on the sheet with the
 * active room at the origin: its shell and its pieces, to look at and
 * to pick. Every room is drawn by one of these, kept by its id, so
 * making another room the active one moves the rooms and changes what
 * two of them do (`working`), and builds no shell, piece or shader
 * again: a switch built both rooms anew, a second of shader building
 * and more on the software renderer.
 */
function FlatRoom({
  rm,
  from,
  working,
  focus,
  portal,
  edges,
  rendering,
  sun,
}: {
  rm: RoomSpec;
  from: RoomSpec;
  /** the active room's part, or null for another room */
  working: Working | null;
  /** a piece is looked at on its own: the shells stand aside, and only
      the active room shows it */
  focus: boolean;
  portal: RefObject<HTMLDivElement>;
  edges: boolean;
  rendering: boolean;
  /** the way to the sun, for the room's windows' outside */
  sun: Vector3Tuple;
}) {
  const a = usePieceActions(rm.id);
  const walking = useStudio((s) => s.walk);
  const canDragHere = a.tool === "select" && !a.focus && !rendering && !walking;
  // only the two slices the shell reads, so a point drawn elsewhere
  // does not redraw the room
  const st = useRoom(
    useShallow((s: RoomConfig) => ({ rooms: s.rooms, joins: s.joins })),
  );
  // the shell's shape, read once per room: a fresh array each render
  // would rebuild the walls' geometry and ask for a frame, and the
  // picture would never settle
  const outline = useMemo(() => footprintOf(rm), [rm]);
  const openings = useMemo(() => openingsOf(st, rm), [st, rm]);
  const shared = useMemo(() => sharedOf(st, rm), [st, rm]);
  // what hangs on its walls: its own list, or the suggestion for it
  const items = useWallItems(rm);
  const wallShape = useMemo(
    () => ({ id: rm.id, W: rm.width, D: rm.depth, outline, openings }),
    [rm.id, rm.width, rm.depth, outline, openings],
  );
  const w = toMetres(rm.width);
  const d = toMetres(rm.depth);
  const wall =
    WALL_TONES.find((t) => t.id === rm.wallTone)?.hex ?? WALL_TONES[0].hex;
  const floor = FLOOR_TONES[rm.floor as Floor] ?? FLOOR_TONES.Vinyl;
  const evening = useStudio((s) => s.scene.light === "evening");
  // from the active room's centre to this room's centre
  const dx =
    toMetres(rm.pos[0] - from.pos[0]) + w / 2 - toMetres(from.width) / 2;
  const dz =
    toMetres(rm.pos[1] - from.pos[1]) + d / 2 - toMetres(from.depth) / 2;
  // the pieces on the floor in mm, for the magnet between them
  const rects = a.shown
    .filter((n) => !isRug(n))
    .map((n) => ({
      id: n.id,
      ...a.spots.get(n.id)!,
      ...footprint(a.props.get(n.id)!),
    }));
  const shown = focus && !working ? [] : a.shown;
  return (
    <group position={[dx, 0, dz]}>
      {!focus && (
        <RoomShell
          r={{
            id: rm.id,
            W: rm.width,
            D: rm.depth,
            outline,
            openings,
            height: rm.height,
            thickness: rm.thickness,
            floor: rm.floor as Floor,
            floorHex: floor,
            wallHex: wall,
            evening,
            sun,
            shared,
          }}
          walk={working?.walk ?? false}
          onWalkTo={working?.onWalkTo ?? noWalk}
          onFloorTap={putDown}
          // another room's floor takes the surroundings: one picture is
          // the active room's
          reflection={working?.reflection ?? null}
        />
      )}
      {!focus && <WallItems3D r={wallShape} items={items} shared={shared} />}
      <group
        ref={working?.pieces ?? null}
        userData={working ? PIECES_TAG : NO_TAG}
      >
        {shown.map((n) => {
          const p = a.props.get(n.id)!;
          const at = a.spots.get(n.id)!;
          const f = footprint(p);
          const label = a.labelOf(n);
          return (
            <Piece
              key={n.id}
              portal={portal}
              node={n}
              props={p}
              at={
                a.focus
                  ? [0, 0, 0]
                  : [
                      -w / 2 + toMetres(at.x + f.w / 2),
                      0,
                      -d / 2 + toMetres(at.y + f.d / 2),
                    ]
              }
              turn={a.focus ? 0 : -(p.rotation * Math.PI) / 180}
              size={[toMetres(p.width), toMetres(p.height), toMetres(p.depth)]}
              colour={
                n.kind === "piece"
                  ? colourHex(p.colour)
                  : // an arrangement's own tone for a room item, a hex
                    p.colour?.startsWith("#")
                    ? p.colour
                    : roomItemHex(n.name)
              }
              parts={(n.children ?? []).map((c) =>
                colourHex(propsOf(c, a.overrides).colour),
              )}
              rendering={rendering}
              clash={a.clashes.has(n.id)}
              label={label}
              // a piece in any room is taken by the pointer at once: the
              // room it stands in need not be the one worked on
              canDrag={canDragHere && !p.locked}
              room={{
                W: rm.width,
                D: rm.depth,
                w,
                d,
                outline,
                thickness: rm.thickness,
              }}
              others={rects}
              onPick={() => {
                // a piece picked in another room makes that room the one
                // worked on, the view kept where it is
                if (!working) holdView();
                a.onPick(n);
              }}
              onDragging={working?.onDragging ?? noDrag}
              hoverable={!rendering}
              // a name behind the walls of the room worked on would float
              // over them: another room's pieces carry none
              labels={working?.labels ?? false}
              edges={edges}
              // the picked piece's bar, in whichever room it stands
              bar={
                <PieceBar
                  node={n}
                  rotation={p.rotation}
                  stack={a.stackOf(n)}
                  onPickOther={a.pickById}
                  onTurnTo={(r) => a.turnTo(n, r)}
                  onToWall={a.wallable(n) ? () => a.toWall(n) : null}
                  onDuplicate={() => a.duplicate(n)}
                  onRemove={() => a.remove(n)}
                />
              }
              actions={
                working && a.actionsFor === n.id ? (
                  <PieceActions
                    node={n}
                    label={label}
                    full={a.labelsFull(n)}
                    onDetails={() => a.details(n)}
                    onLabel={() => a.toggleLabel(n.id)}
                  />
                ) : null
              }
            />
          );
        })}
      </group>
    </group>
  );
}
const noWalk = () => undefined;
/** a click on the floor or on nothing: the piece in hand is put down */
const putDown = () => {
  if (useScene.getState().selectedId !== null) useScene.getState().select(null);
};
const noDrag = () => undefined;

export default function Scene3D() {
  const a = usePieceActions();
  const portal = useRef<HTMLDivElement>(null!);
  const stage = useRef<HTMLDivElement>(null);
  const angle = useStudio((s) => s.angle);
  // a panel's drag (its step opens on the press) holds the camera still
  const panelDrag = useScene((s) => s.dragFrom !== null);
  // the photographed materials that have arrived, for the stage to say
  const photographed = useMaterials((s) =>
    Object.keys(s.loaded).sort().join(" "),
  );
  // how many listed sets are still on their way (-1 before the index
  // is read): a picture taken before they land would be taken again
  const photo = useStudio((s) => s.photo);
  const materialsTotal = useMaterials((s) => s.listed?.length ?? 0);
  const materialsPending = useMaterials((s) =>
    s.listed === null ? -1 : s.listed.length - Object.keys(s.loaded).length,
  );
  useEffect(() => loadMaterials(), []);
  // the part worker's requests under way, for the stage to say
  const partsPending = usePartStore((s) => s.pending);
  const partBuilds = usePartStore((s) => s.builds);
  const walk = useStudio((s) => s.walk);
  // the plan in the main view: the 3D view stays mounted, hidden, so it
  // comes back at once, but draws nothing while nobody sees it (a piece
  // dragged on the plan drew the whole room, its light and its post
  // chain, on every move)
  const unseen = useStudio((s) => s.view !== "3d");
  const room = useActiveRoom();
  const rooms = useRoom((s) => s.rooms);
  const joins = useRoom((s) => s.joins);
  // the room's record itself, which stays the same object until the
  // room changes (useActiveRoom makes a fresh one each render): the
  // shell's shape, openings and shared stretches are read from it once,
  // since a fresh array would rebuild the walls and ask for a frame,
  // and the picture would never settle
  const spec = useRoom(activeOf);
  const outline = useMemo(() => footprintOf(spec), [spec]);
  const openings = useMemo(() => openingsOf({ joins }, spec), [joins, spec]);
  const shared = useMemo(() => sharedOf({ rooms }, spec), [rooms, spec]);
  // how many rooms the active one stands into, for the stage to say
  const roomsOver = roomOverlaps(rooms, room.id).length;
  // and how many things hang on its walls, outlets too
  const wallItems = useWallItems(spec);
  // the doors stood open, to show on the stage
  const doorsOpen = useStudio(
    (s) => Object.values(s.doorsOpen).filter(Boolean).length,
  );
  // standing room for the walk: any room's floor, or a doorway between
  // two, from a point in metres about the active room's middle
  const walkable = useMemo(() => {
    const gaps = joins
      .filter((j) => j.open)
      .map((j) => {
        const a = rooms.find((r) => r.id === j.a)!;
        const horizontal = j.wallA === "north" || j.wallA === "south";
        // the wall band between the outlines, over the doorway's width
        const across =
          (horizontal ? a.pos[1] : a.pos[0]) +
          (j.wallA === "south" || j.wallA === "east"
            ? horizontal
              ? a.depth
              : a.width
            : -WALL_MM);
        return horizontal
          ? {
              x0: j.at - j.width / 2,
              x1: j.at + j.width / 2,
              y0: across,
              y1: across + WALL_MM,
            }
          : {
              x0: across,
              x1: across + WALL_MM,
              y0: j.at - j.width / 2,
              y1: j.at + j.width / 2,
            };
      });
    return (x: number, z: number) => {
      const px = (x + toMetres(room.width) / 2) * 1000 + room.pos[0];
      const py = (z + toMetres(room.depth) / 2) * 1000 + room.pos[1];
      if (roomAt(rooms, [px, py])) return true;
      return gaps.some(
        (g) => px >= g.x0 && px <= g.x1 && py >= g.y0 && py <= g.y1,
      );
    };
  }, [joins, rooms, room.width, room.depth, room.pos]);
  // the flat's box on the sheet, and its middle from the active room's
  // centre (the origin), so the camera frames every room; a piece in
  // focus stands alone at the origin, and the camera looks there
  const box = sheetBox(rooms);
  const focused = a.focus !== null;
  const centre = useMemo(
    (): readonly [number, number] =>
      focused
        ? [0, 0]
        : [
            toMetres(box.x + box.w / 2 - room.pos[0] - room.width / 2),
            toMetres(box.y + box.h / 2 - room.pos[1] - room.depth / 2),
          ],
    [focused, box.x, box.y, box.w, box.h, room.pos, room.width, room.depth],
  );
  const [dragging, setDragging] = useState(false);
  // a click on the floor while walking: go there
  const walkTo = useEvent((x: number, z: number) => {
    WALK.goto = { x, z };
    WALK.wake();
  });
  // the piece under the pointer: the canvas shows a hand over one that
  // can be dragged, a finger over one that can only be picked. Set on
  // the stage as the pointer moves (useHovered), so a hover does not
  // draw the whole stage again; the reading follows this render's state
  const hoverOf = (id: string | null) =>
    id === null || rendering
      ? "none"
      : canDrag && !a.props.get(id)?.locked && !walk
        ? "grab"
        : "pick";
  const readHover = useRef(hoverOf);
  useLayoutEffect(() => {
    readHover.current = hoverOf;
    const el = stage.current;
    if (!el) return;
    const show = () => {
      el.dataset.hover = readHover.current(useHovered.getState().id);
    };
    show();
    return useHovered.subscribe(show);
  });
  const w = toMetres(room.width);
  const d = toMetres(room.depth);
  const h = toMetres(room.height);
  const wall =
    WALL_TONES.find((t) => t.id === room.wallTone)?.hex ?? WALL_TONES[0].hex;
  const floor = FLOOR_TONES[room.floor as Floor] ?? FLOOR_TONES.Vinyl;
  // Render is for looking: the handles rest, as in a picture; the picture
  // itself comes with the sweep, once the line has run
  const rendering = useStudio((s) => s.mode === "preview");
  const rendered = useStudio(
    (s) => s.mode === "preview" && s.preview !== "generating",
  );
  const canDrag = a.tool === "select" && !a.focus && !rendering;
  // the pieces on the floor for the walk: a rug is walked over
  const blocks: Block[] = a.focus
    ? []
    : a.shown
        .filter((n) => !isRug(n))
        .map((n) => {
          const f = footprint(a.props.get(n.id)!);
          const at = a.spots.get(n.id)!;
          return {
            x: -w / 2 + toMetres(at.x + f.w / 2),
            z: -d / 2 + toMetres(at.y + f.d / 2),
            w: toMetres(f.w),
            d: toMetres(f.d),
          };
        });
  // a finger means a phone or a tablet: fewer pixels, no shadows unless
  // the View settings ask for them
  const coarse = useCoarse();
  const scene = useStudio((s) => s.scene);
  const immersive = useStudio((s) => s.uiHidden);
  // a shared room is small on its page: the names would pile up
  const readOnly = useStudio((s) => s.readOnly);
  // a render has its shadows whatever the View settings, and no names,
  // grid or edges over the picture
  const shadows =
    !devFlag("noshadows") &&
    (rendered || (scene.shadows === "auto" ? !coarse : scene.shadows === "on"));
  const labels = scene.labels && !readOnly && !rendered;
  const grid = scene.grid && !rendered;
  const edges = scene.edges && !rendered;
  const light = LIGHTS[scene.light];
  // one sun for the flat, turned by the plan's north: it stays where it
  // is as the active room changes
  const north = useRoom((s) => s.north);
  const sunDir = useMemo(
    () =>
      sunDirection(
        scene.light === "evening" ? SUN.dusk : SUN_TIMES[scene.sunTime],
        north,
      ),
    [scene.light, scene.sunTime, north],
  );
  const sunFrom = useMemo(
    (): Vector3Tuple => [
      centre[0] + sunDir[0] * SUN.distance,
      sunDir[1] * SUN.distance,
      centre[1] + sunDir[2] * SUN.distance,
    ],
    [centre, sunDir],
  );
  // the windows' soft light: the active room's first, then the nearest
  const panes = useMemo(
    () =>
      panesOf(
        rooms.map((rm): LitRoom => ({
          id: rm.id,
          pos: rm.pos,
          W: rm.width,
          D: rm.depth,
          outline: footprintOf(rm),
          openings: openingsOf({ joins }, rm),
        })),
        room.id,
      ),
    [rooms, joins, room.id],
  );
  // the corner the room is photographed from, and walked in from: kept
  // by its value, so a render that rebuilds the openings does not put
  // the camera back in its corner
  const [cornerX, cornerZ] = cornerOf(openings, room.width, room.depth);
  const corner = useMemo((): Corner => [cornerX, cornerZ], [cornerX, cornerZ]);
  // the corner the room is seen from above (the perspective, and the
  // opening's way in to it): on its outside walls, where no other
  // room stands between the camera and it
  const [viewX, viewZ] = openCorner(
    room,
    rooms.filter((r) => r.id !== room.id),
    corner,
  );
  const viewCorner = useMemo((): Corner => [viewX, viewZ], [viewX, viewZ]);
  // the corner the room's photograph is taken from: the photographed
  // corner unless a piece would stand cut in its foreground
  // a rug lies flat: it stands in no foreground
  const boxes: Box[] = a.shown
    .filter((n) => !isRug(n))
    .map((n) => {
      const p = a.props.get(n.id)!;
      const at = a.spots.get(n.id)!;
      const f = footprint(p);
      return {
        x: toMetres(at.x + f.w / 2 - room.width / 2),
        z: toMetres(at.y + f.d / 2 - room.depth / 2),
        w: toMetres(f.w),
        d: toMetres(f.d),
      };
    });
  const shotFound = shotCorner(
    toMetres(room.width),
    toMetres(room.depth),
    boxes,
    corner,
    SHOT_ASPECT,
    windowSide(openings),
    widestWindow(openings) !== undefined,
  );
  // (`?shot=x,z` in development: the Corner view from a given corner,
  // to compare one view's crops before and after a change)
  const forced = devParam("shot")?.split(",").map(Number);
  const shotNow: Shot =
    forced?.length === 2 && forced.every((n) => n === 1 || n === -1)
      ? { ...shotFound, corner: [forced[0], forced[1]] as unknown as Corner }
      : shotFound;
  // the corner holds while a piece is dragged: a piece brought near the
  // camera would otherwise send it gliding to another corner mid-drag;
  // it is chosen afresh once the piece is let go of
  const [shot, setShot] = useState<Shot>(shotNow);
  if (
    !dragging &&
    !panelDrag &&
    JSON.stringify(shot) !== JSON.stringify(shotNow)
  )
    setShot(shotNow);
  const backend = useStudio((s) => s.backend);
  // the picture's finish follows the device once the backend is known; a
  // render has it whatever the View settings; a stage that fails on this
  // device turns it off for good
  const [postFailed, setPostFailed] = useState(false);
  // which of the desktop extras the chain draws (Post.tsx says)
  const [fx, setFx] = useState<EffectStates>(EFFECTS_OFF);
  const bytesPerSample = useStudio((s) => s.bytesPerSample);
  // the tiers taken down because the frames came slow (SlowFrames), on
  // the auto picture alone: a picture asked for is kept
  const [slower, setSlower] = useState(0);
  const onSlow = useEvent(() => setSlower((n) => n + 1));
  const tier = backend
    ? tierBelow(
        tierOf(scene.quality, coarse, backend),
        scene.quality === "auto" ? slower : 0,
      )
    : null;
  // the studio reads the tier too (the machining's cuts follow it)
  useEffect(() => useStudio.getState().setTier(tier), [tier]);
  const cutsOn = useStudio((s) => s.cutsOn());
  const post = tier && !postFailed ? tier : null;
  // the room's own bounce light, from probes over the shell: not on a
  // phone, and not for a piece looked at on its own
  const probes =
    tier !== null && tier !== "phone" && !a.focus && !devFlag("noprobes");
  // what the probes see: the shell, its finish and its light
  const probeStamp = JSON.stringify([
    room.id,
    w,
    d,
    h,
    room.thickness,
    outline,
    openings,
    shared,
    floor,
    wall,
    scene.light,
    scene.sunTime,
    north,
    scene.sky,
    shadows,
    // the photographed sets on the walls and the floor: with the fills a
    // whisper the probes carry the room's light, and a bake taken before
    // a set arrived lit the room another way than one taken after
    materialsPending > 0 ? "pending" : photographed,
  ]);
  const pieces = useRef<Group>(null);
  // the sun's shadow sees the room's shadow layer too: the ceiling that
  // stops it at the open top, and a near wall taken out of the picture
  const sunLight = useRef<DirectionalLight>(null);
  useLayoutEffect(() => {
    sunLight.current?.shadow.camera.layers.enable(SHADOW_LAYER);
  });
  // the sun aims at the flat's middle, its shadow's box round the whole
  // flat, and its shadow's edge settles smooth (shadow-filter.ts)
  const sunReach = Math.hypot(box.w, box.h) / 2000 + 1;
  useLayoutEffect(() => {
    const l = sunLight.current;
    if (!l) return;
    l.target.position.set(centre[0], 0, centre[1]);
    l.target.updateMatrixWorld();
    const c = l.shadow.camera;
    c.left = -sunReach;
    c.right = sunReach;
    c.top = sunReach;
    c.bottom = -sunReach;
    c.near = Math.max(0.5, SUN.distance - sunReach - 3);
    c.far = SUN.distance + sunReach + 3;
    c.updateProjectionMatrix();
    l.shadow.bias = -SUN.bias / (c.far - c.near);
    (l.shadow as { filterNode?: unknown }).filterNode = settlingPCF;
    l.shadow.needsUpdate = true;
  }, [centre, sunReach]);
  // what the floor reflects: the shell and its light, the pieces as they
  // stand and look, and the ceiling that walking puts overhead
  const [probeState, setProbeState] = useState<StillState>("pending");
  // the probe stamp the probes last said ready for: a change of look
  // changes the stamp a render before the probes say pending again, and
  // in that render their "ready" is the old look's. The floor's picture
  // was taken then, of the new look lit by the old probes, and taken
  // twice more (unlit, then lit) once the probes caught up: three
  // pictures for every change of look, the first always wrong (A4)
  const [probesFor, setProbesFor] = useState("");
  const onProbes = useEvent((state: StillState) => {
    setProbeState(state);
    setProbesFor(state === "ready" ? probeStamp : "");
  });
  const probesLit = probeState === "ready" && probesFor === probeStamp;
  // the floor's picture of the room and the probes see each other: the
  // floor reflects (and gathers light from) its picture, and the probes'
  // pictures show the floor. Taken in turn, never at once: the floor's
  // picture first, the probes after it, and the floor's again once they
  // are lit, so the room comes out the same whichever finished first
  const reflectStamp =
    probeStamp +
    (probesLit ? "|lit" : "|unlit") +
    JSON.stringify([
      walk,
      a.shown.map((n) => {
        const p = a.props.get(n.id)!;
        const at = a.spots.get(n.id)!;
        return [
          n.id,
          at.x,
          at.y,
          p.rotation,
          p.width,
          p.height,
          p.depth,
          p.colour,
          p.texture,
          (n.children ?? []).map((c) => propsOf(c, a.overrides).colour),
        ];
      }),
    ]);
  // the floor's picture as of which stamp: ready only for the one it
  // was taken with, so a change to the stamp reads pending at once and
  // not a render later, when the picture's own wait begins
  const [reflected, setReflected] = useState<{
    state: StillState;
    of: string;
  }>({ state: "pending", of: "" });
  const onReflected = useEvent((state: StillState) =>
    setReflected({ state, of: reflectStamp }),
  );
  const reflectState: StillState =
    reflected.state === "ready" && reflected.of === reflectStamp
      ? "ready"
      : "pending";
  const [probeDone, setProbeDone] = useState({ at: 0, of: 0 });
  // whether the edges are still settling: a flag, not the count, so the
  // stage re-renders twice a settle rather than once a frame
  const [settling, setSettling] = useState(false);
  const onSettle = useEvent((left: number) => setSettling(left > 0));
  const [drawn, setDrawn] = useState(false);
  // the scene's shaders, built ahead of the post chain's first frame;
  // the room fades in once they have been, and stays in when a change
  // of tier builds them again
  const [shaders, setShaders] = useState<ShaderState>("building");
  const [warmed, setWarmed] = useState(false);
  // the room's first picture is on the stage: drawn, on a known backend,
  // its shaders built
  const shown = drawn && backend !== null && (post === null || warmed);
  // on WebGPU, a first picture that never comes (a GPU stuck building)
  // starts the page over on WebGL, once, rather than leave it blank
  // until a refresh; a tab out of sight is given its time when back
  useEffect(() => {
    if (shown || backend !== "webgpu") return;
    let t = 0;
    const arm = () => {
      t = window.setTimeout(() => {
        if (document.visibilityState === "visible")
          startOverOnWebGL("first picture");
        else arm();
      }, FIRST_PICTURE_WAIT_MS);
    };
    arm();
    return () => window.clearTimeout(t);
  }, [shown, backend]);
  const onShaders = useEvent((s: ShaderState) => {
    setShaders(s);
    if (s === "ready") setWarmed(true);
  });
  // the ceiling light under Room3D's diffuser
  const [ceilingX, ceilingZ] = ceilingAt(
    outline,
    toMetres(room.width),
    toMetres(room.depth),
  );
  const liveSun = useMemo(
    () => ({ position: sunFrom, colour: light.colour, intensity: light.sun }),
    [sunFrom, light.colour, light.sun],
  );
  // a graded render is the work the stage does anyway, counted: the
  // light baked, the floor's picture, the edges settled; it ends when
  // all of it is done and the line has had its moment
  const grading = useStudio(
    (s) => s.mode === "preview" && s.loading === "render",
  );
  const loadingAt = useStudio((s) => s.loadingAt);
  const gradingFrom = useRef(0);
  useEffect(() => {
    if (grading) gradingFrom.current = performance.now();
  }, [grading, loadingAt]);
  useEffect(() => {
    if (!grading) return;
    const { setWork, endLoading } = useStudio.getState();
    const temporal = post !== null && post !== "phone";
    const plan: WorkStep[] = probes
      ? ["light", "floor", ...(temporal ? (["edges"] as const) : [])]
      : ["grade"];
    const step: WorkStep | null = !probes
      ? settling
        ? "grade"
        : null
      : probeState !== "ready"
        ? "light"
        : reflectState !== "ready"
          ? "floor"
          : settling && temporal
            ? "edges"
            : null;
    const left = gradingFrom.current + minRenderMs() - performance.now();
    if (step === null && left <= 0) {
      endLoading();
      return;
    }
    setWork({
      plan,
      step: step ?? plan[plan.length - 1]!,
      done: step === "light" ? probeDone.at : 0,
      of: step === "light" ? probeDone.of : 0,
    });
    if (step === null) {
      const t = window.setTimeout(endLoading, left);
      return () => window.clearTimeout(t);
    }
  }, [grading, probes, post, probeState, reflectState, settling, probeDone]);
  return (
    <div
      ref={stage}
      className="stage-3d"
      data-focus={a.focus !== null}
      data-rooms-overlap={roomsOver}
      data-wall-items={wallItems.length}
      data-parts={partsPending}
      data-part-builds={partBuilds}
      data-walk={walk}
      data-doors-open={doorsOpen}
      data-dragging={dragging}
      data-edges={edges}
      data-cuts={cutsOn ? "on" : "off"}
      data-shadows={shadows}
      data-labels={labels}
      data-grid={grid}
      data-light={scene.light}
      data-immersive={immersive ? "on" : "off"}
      data-lived-in={scene.livedIn ? "on" : "off"}
      data-sun-time={scene.sunTime}
      data-north={north}
      data-sky={scene.sky}
      data-materials={photographed}
      data-materials-pending={materialsPending}
      data-photo={photo?.state ?? "idle"}
      data-photo-samples={photo?.samples ?? 0}
      data-photo-ms={photo?.ms ?? 0}
      data-photo-size={photo ? `${photo.width}x${photo.height}` : ""}
      data-exposure={exposureOf(scene)}
      data-backend={backend}
      // why WebGPU was given up on for WebGL here, if it was
      data-gpu-fallback={
        backend && backend !== "webgpu" ? (fellBackFor() ?? "none") : "none"
      }
      data-drawn={shown}
      data-shaders={post === null ? "ready" : shaders}
      // the picture shown is not the room's while its shaders are being
      // built: the last frame stands until they are
      data-settled={!settling && (post === null || shaders === "ready")}
      data-post={post ?? "off"}
      data-ssr={post === "desktop" ? fx.ssr : "off"}
      data-ssgi={post === "desktop" ? fx.ssgi : "off"}
      data-probes={probes ? probeState : "off"}
      data-reflection={probes ? reflectState : "off"}
    >
      <Canvas
        // a frame only when something moves: the orbit, a glide, a walk, a
        // drag or a change in the room; the rest of the time the GPU rests
        frameloop={unseen ? "never" : "demand"}
        shadows={shadows ? SHADOWS : false}
        // at most one and a half device pixels per CSS pixel
        // (camera-motion.tsx)
        dpr={sharpDpr()}
        gl={coarse ? makeRendererCoarse : makeRendererFine}
        camera={{ fov: FOV.overview, ...CLIP }}
        // a click on nothing that answers it (the sky, a wall) puts the
        // piece in hand down, its bar with it; fiber calls this only for
        // a click that did not travel
        onPointerMissed={putDown}
      >
        <PointerWhen on={shown} />
        <WakeWhenSeen seen={!unseen} />
        {walk ? (
          <Walker
            w={w}
            d={d}
            outline={outline}
            walkable={walkable}
            blocks={blocks}
            corner={corner}
            stage={stage}
          />
        ) : (
          <Rig
            angle={angle}
            w={toMetres(box.w)}
            d={toMetres(box.h)}
            h={h}
            centre={centre}
            roomW={w}
            roomD={d}
            corner={angle === "Corner" ? shot.corner : viewCorner}
            framing={angle === "Corner" ? shot.framing : undefined}
            stage={stage}
          />
        )}
        <Exposure value={exposureOf(scene)} />
        <WhiteBalance evening={scene.light === "evening"} />
        <Backend />
        <LastFrame />
        {!backend && <HoldFrames />}
        <BenchFrames />
        {shadows && <ShadowsOnChange />}
        <CameraMotion stage={stage} />
        {scene.quality === "auto" && tier !== "phone" && (
          <SlowFrames onSlow={onSlow} />
        )}
        <FirstFrame onDrawn={() => setDrawn(true)} />
        <LiveHandle
          w={w}
          d={d}
          h={h}
          spanW={toMetres(box.w)}
          spanD={toMetres(box.h)}
          centre={centre}
          corner={corner}
          shot={shot}
          sun={liveSun}
        />
        {tier && <Photo tier={tier} stamp={reflectStamp} />}
        <PhotoBench />
        {post && (
          <Post
            tier={post}
            effects={{ reflections: scene.reflections, bounce: scene.bounce }}
            bytesPerSample={bytesPerSample}
            onFailed={failPost(setPostFailed)}
            onSettle={onSettle}
            onEffects={setFx}
            onShaders={onShaders}
          />
        )}
        <hemisphereLight
          intensity={light.sky}
          color={light.fill}
          groundColor={GROUND_HEX}
        />
        <directionalLight
          ref={sunLight}
          position={sunFrom}
          intensity={devFlag("nosun") ? 0 : light.sun}
          color={light.colour}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-radius={devFlag("nosoft") ? 0 : 3}
          shadow-normalBias={0.02}
        />
        <RoomLight evening={scene.light === "evening"} sky={scene.sky} />
        <WindowLights panes={panes} evening={scene.light === "evening"} />
        <CeilingLight
          x={ceilingX}
          y={h - CEILING_LIGHT.drop}
          z={ceilingZ}
          lit={scene.light === "evening"}
        />
        {probes && (
          <Probes
            room={room.id}
            w={w}
            h={h}
            d={d}
            // a change of picture size bakes again
            stamp={`${probeStamp}|${tier === "desktop" ? "fine" : "plain"}`}
            pieces={pieces}
            // the bounce on every hardware tier: with the fills a
            // whisper, it is what lights the ceiling and the far side
            bounce={backend !== "software"}
            fine={tier === "desktop"}
            // the floor's picture first (see reflectStamp)
            hold={reflectState !== "ready"}
            onState={onProbes}
            onProgress={(at, of) => setProbeDone({ at, of })}
          />
        )}
        {grid && !a.focus && (
          <gridHelper
            args={[
              Math.ceil(Math.max(w, d) * 1.2),
              Math.ceil(Math.max(w, d) * 1.2) * 2,
              GRID_HEX,
              GRID_HEX,
            ]}
            position={[0, 0.003, 0]}
          />
        )}
        {rooms.map((rm) => (
          <FlatRoom
            key={rm.id}
            rm={rm}
            from={spec}
            working={
              rm.id === room.id
                ? {
                    canDrag,
                    labels,
                    walk,
                    onWalkTo: walkTo,
                    reflection: probes
                      ? { stamp: reflectStamp, onState: onReflected }
                      : null,
                    onDragging: setDragging,
                    pieces,
                  }
                : null
            }
            focus={a.focus !== null}
            portal={portal}
            edges={edges}
            rendering={rendering}
            sun={sunDir}
          />
        ))}
        <OrbitControls
          makeDefault
          enabled={!walk && !dragging && !panelDrag}
          // the right button, Shift with the left, or two fingers move the
          // view; the wheel and Safari's pinch are the Rig's own
          enablePan
          // the view settles quickly once let go, and turns a little
          // slower than the pointer, so it goes where it is aimed
          enableDamping
          dampingFactor={0.2}
          rotateSpeed={0.8}
          minDistance={1}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />
      </Canvas>
      <div ref={portal} className="stage-3d-overlay" />
      {/* until the room's first picture: what is being got ready, so the
          stage is never a blank pane */}
      {!shown && (
        <div className="stage-preparing" role="status">
          <span className="stage-preparing-title">
            Setting up the room in 3D
          </span>
          <span className="stage-preparing-step">
            {backend === null || materialsPending !== 0
              ? materialsPending > 0
                ? `Loading the materials · ${materialsTotal - materialsPending} of ${materialsTotal}`
                : "Starting the 3D view"
              : probes && probeState !== "ready"
                ? "Preparing the light"
                : "Building the look"}
          </span>
          <span className="stage-preparing-bar" aria-hidden="true" />
        </div>
      )}
      {a.focus && (
        <>
          <button
            type="button"
            className="glass stage-back"
            onClick={a.leaveFocus}
          >
            <ArrowLeftIcon size={14} />
            Back to the room
          </button>
          <p className="stage-focus-caption">
            {a.focus.name} · {CATEGORY_NAMES[a.focus.category]}
          </p>
        </>
      )}
    </div>
  );
}
