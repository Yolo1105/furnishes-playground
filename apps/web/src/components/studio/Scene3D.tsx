"use client";

import { toMetres } from "@furnishes/scene";
import { WebGPURenderer } from "three/webgpu";
import { Html, OrbitControls } from "@react-three/drei";
import { useShallow } from "zustand/react/shallow";
import {
  Canvas,
  type CanvasProps,
  type ThreeEvent,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  type Group,
  PCFShadowMap,
  Plane,
  type Scene,
  Vector3,
  type Vector3Tuple,
  type WebGLRenderer,
} from "three";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { Furniture3D } from "./Furniture3D";
import { ArrowLeftIcon, LockIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import {
  ACCENT_HEX,
  colourHex,
  DANGER_HEX,
  footprint,
  isRug,
  ROOM_ITEM_HEX,
  type PieceProps,
  normTurn,
  ROTATE_SNAP,
} from "./piece-detail";
import { FLOOR_TONES, WALL_TONES, type Floor } from "./room-data";
import { settle, type Rect } from "./room-layout";
import { insideOutline, WALL_MM } from "./room-geometry";
import type { Point } from "./room-templates";
import {
  activeOf,
  footprintOf,
  openingsOf,
  roomAt,
  type RoomSpec,
  sharedOf,
  sheetBox,
  useActiveRoom,
  useRoom,
  type RoomConfig,
} from "./room-store";
import { Photo, PhotoBench } from "./Photo";
import { backendOf, Post, textureSideOf, tierOf, TONE_MAPPING } from "./Post";
import { Probes } from "./Probes";
import type { StillState } from "./capture";
import { loadMaterials, useMaterials } from "./materials";
import { RoomLight, RoomShell, windowSun } from "./Room3D";
import { usePartStore } from "./part-client";
import { cameraFor, EYE } from "./camera-bookmarks";
import { setLive } from "./scene-handle";
import { devFlag } from "./dev-flags";
import { propsOf, useScene } from "./scene-store";
import { useCoarse } from "./input";
import {
  minRenderMs,
  useStudio,
  type Angle,
  type WorkStep,
} from "./studio-store";

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
    finger. AgX rolls the window's highlights off instead of clipping. */
const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;
type RendererProps = Parameters<
  Extract<NonNullable<CanvasProps["gl"]>, (...args: never[]) => unknown>
>[0];
const makeRenderer = async (props: RendererProps, antialias: boolean) => {
  const canvas = props.canvas as HTMLCanvasElement;
  // the browser may have the API and no adapter behind it: ask first,
  // so the WebGL backend gets its own context with the buffer kept
  const adapter = hasWebGPU()
    ? await navigator.gpu.requestAdapter().catch(() => null)
    : null;
  const webgl = !adapter;
  const renderer = new WebGPURenderer({
    canvas,
    antialias,
    alpha: true,
    powerPreference: "high-performance",
    forceWebGL: webgl,
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
  centre,
  sun,
}: {
  w: number;
  d: number;
  h: number;
  centre: readonly [number, number];
  sun: { position: Vector3Tuple; colour: string; intensity: number };
}) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    setLive({ scene, camera, w, d, h, centre, sun });
    // in development the scene is at hand in the console too, for
    // hiding one thing at a time when a defect is hunted
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __scene?: Scene }).__scene = scene;
    return () => setLive(null);
  }, [scene, camera, w, d, h, centre, sun]);
  return null;
}

/** which backend the renderer came up on, for the stage to say and
    the store to know */
function Backend() {
  const gl = useThree((s) => s.gl);
  const setBackend = useStudio((s) => s.setBackend);
  useEffect(() => {
    setBackend(backendOf(gl), textureSideOf(gl));
  }, [gl, setBackend]);
  // leaving the main column (the plan takes it), the view's last
  // picture is kept for the small panel, as it stood
  useEffect(
    () => () => {
      try {
        useStudio.setState({
          lastFrame: gl.domElement.toDataURL("image/jpeg", 0.85),
        });
      } catch {
        /* a context already lost keeps the drawn stand-in */
      }
    },
    [gl],
  );
  return null;
}

/** a stage of the picture's finish failed: say so once, draw plain */
const failPost = (set: (failed: boolean) => void) => (error: unknown) => {
  console.warn("The picture's finish is off on this device.", error);
  set(true);
};

/** the sun in the room, the day's or an evening's (warmer and lower),
    and the sky's fill from above against the floor's from below; the
    rest comes from the surroundings (RoomLight), never from a flat
    ambient term. The sun stands beyond the room's widest window
    (windowSun: `height` up, `back` out, `aside` along the wall) so it
    comes in through the glass and lays its patch on the floor, the
    rest of the room in the window's shade, as a room is lit; a room
    without a window takes it from above the open ceiling (`from`) */
const LIGHTS = {
  day: {
    sun: 7,
    colour: "#fff3e2",
    from: [3, 6, 4] as Vector3Tuple,
    height: 4.2,
    // the sky's light fills the room so the walls read off-white, as a
    // room is exposed for, with the window above it
    sky: 2.4,
    // the sky's fill is cool against the warm sun, as daylight is
    fill: "#e0e7ee",
  },
  evening: {
    sun: 3.5,
    colour: "#ffd2a0",
    from: [2, 1.8, -7] as Vector3Tuple,
    height: 1.6,
    sky: 0.5,
    fill: "#9aa6ba",
  },
} as const;
/** how far beyond the window the sun stands, and how far along the
    wall, m */
const SUN = { back: 5.5, aside: -1 };
/** the sky's shadow on the desktop tier: how much of the sky's light
    comes as a shadowed light from above, from how high, m, and how
    soft its shadow is */
const SKY_SHADOW = { share: 0.45, height: 12, radius: 8 };
/** what the floor gives back to the undersides: the floor's tone,
    well down, so an underside and a ceiling stand darker than a wall */
const GROUND_HEX = "#8f8273";

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

/** the walker's place and heading: one scene, one walker */
const WALK: WalkState = {
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  keys: new Set(),
  goto: null,
  wake: () => undefined,
  tour: null,
};

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

type Controls = { target: Vector3; update: () => void } | null;
const ORIGIN = new Vector3();

/** the camera glides to the angle's place */
function Rig({
  angle,
  w,
  d,
  h,
  centre,
  stage,
}: {
  angle: Angle;
  /** the flat's box, m, and its middle from the active room's */
  w: number;
  d: number;
  h: number;
  centre: readonly [number, number];
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
    t: number;
  } | null>(null);
  const free = useStudio((s) => s.free);
  useEffect(() => {
    // turned by hand: the camera stays where the cube or the canvas put
    // it; the angle picked again, free cleared, glides back to it
    if (free) return;
    const { pos, at } = cameraFor(angle, w, d, h, centre);
    // a tall screen (a phone, a tablet upright) sees less across: the
    // camera stands further back so the room still fits
    const aspect = size.height ? size.width / size.height : 1.5;
    const back = Math.max(1, Math.sqrt(1.45 / aspect));
    const toAt = new Vector3(...at);
    const to = new Vector3(...pos).sub(toAt).multiplyScalar(back).add(toAt);
    glide.current = {
      from: camera.position.clone(),
      fromAt: controls?.target.clone() ?? new Vector3(0, h / 2, 0),
      to,
      toAt,
      t: reduced() ? 1 : 0,
    };
    invalidate();
  }, [angle, free, w, d, h, centre, camera, controls, invalidate, size]);
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
  const last = useRef({ at: 0 });
  useFrame(() => {
    // the clock runs while the scene rests: a frame after a pause steps
    // no further than a tenth of a second
    const dt = Math.min(stepOf(last.current), FRAME_MAX);
    const g = glide.current;
    if (g) {
      g.t = Math.min(1, g.t + dt / GLIDE);
      const k = 1 - Math.pow(1 - g.t, 3);
      camera.position.lerpVectors(g.from, g.to, k);
      const at = g.fromAt.clone().lerp(g.toAt, k);
      camera.lookAt(at);
      controls?.target.copy(at);
      controls?.update();
      if (g.t >= 1) glide.current = null;
      else invalidate();
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
  stage,
}: {
  w: number;
  d: number;
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
    // in from the south-east corner, looking into the room, a little down
    const s = WALK;
    s.x = w / 2 - 0.6;
    s.z = d / 2 - 0.6;
    s.yaw = Math.PI / 4;
    s.pitch = -0.12;
    s.goto = null;
    s.wake = invalidate;
    camera.position.set(s.x, EYE, s.z);
    camera.rotation.set(0, 0, 0, "YXZ");
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      s.keys.add(e.key.toLowerCase());
      // a key takes the walk over from the tour
      if (s.tour && !e.key.startsWith("Esc")) useStudio.getState().stopTour();
      invalidate();
    };
    const up = (e: KeyboardEvent) => s.keys.delete(e.key.toLowerCase());
    let look: { x: number; y: number } | null = null;
    const el = gl.domElement;
    const pdown = (e: PointerEvent) => {
      look = { x: e.clientX, y: e.clientY };
      if (s.tour) useStudio.getState().stopTour();
    };
    const pmove = (e: PointerEvent) => {
      if (!look) return;
      s.yaw -= (e.clientX - look.x) * 0.005;
      s.pitch = Math.max(
        -1.2,
        Math.min(1.2, s.pitch - (e.clientY - look.y) * 0.004),
      );
      look = { x: e.clientX, y: e.clientY };
      invalidate();
    };
    const pup = () => {
      look = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    el.addEventListener("pointerdown", pdown);
    window.addEventListener("pointermove", pmove);
    window.addEventListener("pointerup", pup);
    return () => {
      s.keys.clear();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      el.removeEventListener("pointerdown", pdown);
      window.removeEventListener("pointermove", pmove);
      window.removeEventListener("pointerup", pup);
    };
  }, [camera, gl, w, d, invalidate]);
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

function Piece({
  portal,
  node,
  props,
  at,
  turn,
  size,
  colour,
  parts,
  selected,
  clash,
  label,
  canDrag,
  room,
  others,
  actions,
  onPick,
  onTurn,
  onDragging,
  hovered,
  onHover,
  labels,
  edges,
}: {
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
  selected: boolean;
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
  onPick: () => void;
  onTurn: () => void;
  onDragging: (on: boolean) => void;
  /** the pointer is over this piece: an outline, its name, the hand */
  hovered: boolean;
  onHover: (on: boolean) => void;
  /** the View settings: the name under the piece, edges on it */
  labels: boolean;
  edges: boolean;
}) {
  // the knob on the ring: a click turns a quarter; a drag round the
  // piece turns it by the angle the pointer makes about the piece's
  // middle on the screen, snapped unless Shift is held
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const spin = useRef<{ a0: number; r0: number; moved: boolean } | null>(null);
  const spinSkip = useRef(false);
  const [spinning, setSpinning] = useState(false);
  const angleAbout = (e: React.PointerEvent) => {
    const c = new Vector3(at[0], 0, at[2]).project(camera);
    const r = canvas.getBoundingClientRect();
    const cx = r.left + ((c.x + 1) / 2) * r.width;
    const cy = r.top + ((1 - c.y) / 2) * r.height;
    return Math.atan2(e.clientY - cy, e.clientX - cx);
  };
  const onSpinDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    spin.current = { a0: angleAbout(e), r0: props.rotation, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onSpinMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = spin.current;
    if (!s) return;
    let da = ((angleAbout(e) - s.a0) * 180) / Math.PI;
    da = ((da + 540) % 360) - 180;
    if (!s.moved) {
      if (Math.abs(da) < 3) return;
      s.moved = true;
      setSpinning(true);
      useScene.getState().dragStart();
    }
    // seen from above the room, the pointer going clockwise on the
    // screen turns the piece clockwise on the plan
    const raw = s.r0 + da;
    useScene
      .getState()
      .turnMove(
        node.id,
        normTurn(
          e.shiftKey ? raw : Math.round(raw / ROTATE_SNAP) * ROTATE_SNAP,
        ),
      );
  };
  const onSpinUp = () => {
    const s = spin.current;
    if (!s) return;
    spin.current = null;
    setSpinning(false);
    if (s.moved) {
      useScene.getState().dragEnd();
      spinSkip.current = true;
    }
  };
  // the ring's reach round the footprint, m
  const ringR = Math.hypot(size[0], size[2]) / 2 + RING_OUT;
  const drag = useRef<{
    hit: Vector3;
    x0: number;
    y0: number;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);
  const f = footprint(props);
  const hitFloor = (e: ThreeEvent<PointerEvent>) => {
    const p = new Vector3();
    return e.ray.intersectPlane(FLOOR, p) ? p : null;
  };
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canDrag || e.button !== 0) return;
    const hit = hitFloor(e);
    if (!hit) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    moved.current = false;
    // the spot is kept in mm from the room's north-west corner
    drag.current = {
      hit,
      x0: (at[0] + room.w / 2) * 1000 - f.w / 2,
      y0: (at[2] + room.d / 2) * 1000 - f.d / 2,
      moved: false,
    };
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
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
    }
    const to = settle(
      { x: dr.x0 + dx * 1000, y: dr.y0 + dz * 1000 },
      f,
      room,
      useStudio.getState().magnet,
      others.filter((o) => o.id !== node.id),
    );
    useScene.getState().dragMove(node.id, to.x, to.y);
  };
  const onUp = () => {
    const dr = drag.current;
    if (!dr) return;
    drag.current = null;
    if (dr.moved) {
      useScene.getState().dragEnd();
      onDragging(false);
    }
  };
  return (
    <group
      position={at}
      rotation={[0, turn, 0]}
      userData={{ name: node.name }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
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
          is in hand; the ring round it is where it turns, its knob at the
          piece's front */}
      {selected && (
        <Halo size={size} colour={clash ? DANGER_HEX : ACCENT_HEX} />
      )}
      {selected && canDrag && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, RING_Y, 0]}
            raycast={unpickable}
            userData={HELPER_TAG}
          >
            <ringGeometry args={[ringR - RING_W, ringR, 96]} />
            <meshBasicMaterial
              color={ACCENT_HEX}
              transparent
              opacity={spinning ? 0.95 : 0.7}
              depthWrite={false}
            />
          </mesh>
          <Html
            portal={portal}
            position={[0, RING_Y, ringR]}
            center
            zIndexRange={[45, 35]}
          >
            <button
              type="button"
              className="stage-turn-knob shell-tip"
              data-tooltip="Turn: drag round the ring, or click for a quarter turn"
              aria-label={`Turn ${node.name}`}
              data-spinning={spinning}
              onPointerDown={onSpinDown}
              onPointerMove={onSpinMove}
              onPointerUp={onSpinUp}
              onPointerCancel={onSpinUp}
              onClick={() => {
                if (spinSkip.current) {
                  spinSkip.current = false;
                  return;
                }
                onTurn();
              }}
            />
          </Html>
          {spinning && (
            <Html
              portal={portal}
              position={[0, size[1] + 0.12, 0]}
              center
              zIndexRange={[46, 36]}
              style={{ pointerEvents: "none" }}
            >
              <span className="stage-turn-readout f-num">
                {props.rotation}°
              </span>
            </Html>
          )}
        </>
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
      {(labels || hovered) && (
        <Html
          portal={portal}
          position={[0, -0.02, size[2] / 2 + 0.05]}
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

/** drawn, never picked: a halo or a ring under the pointer leaves the
    pick to the piece */
const unpickable = () => null;
/** the ring's distance past the footprint's corners, its width, and
    the height both it and the halo lie at above the floor, m */
const RING_OUT = 0.1;
const RING_W = 0.012;
const RING_Y = 0.006;
/** the halo's margin round the footprint, m, and its picture's size */
const HALO_OUT = 0.12;
const HALO_PX = 256;
const halos = new Map<string, CanvasTexture>();
/** a rounded rectangle in the colour, stroked and faintly filled, as
    the picture a halo lies on the floor as; kept by its size */
const haloTexture = (w: number, d: number, colour: string) => {
  const key = `${w.toFixed(3)},${d.toFixed(3)},${colour}`;
  const had = halos.get(key);
  if (had) return had;
  const c = document.createElement("canvas");
  const px = HALO_PX;
  c.width = px;
  c.height = Math.max(8, Math.round((px * d) / w));
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
      position={[0, RING_Y, 0]}
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

/** another room of the flat, standing where it does on the sheet with
    the active room at the origin: its shell and its pieces, to look at
    and to pick, not to drag */
function OtherRoom({
  rm,
  from,
  portal,
  labels,
  edges,
  rendering,
  sun,
}: {
  rm: RoomSpec;
  from: RoomSpec;
  portal: RefObject<HTMLDivElement>;
  labels: boolean;
  edges: boolean;
  rendering: boolean;
  /** where the sun stands, for the room's windows */
  sun: Vector3Tuple;
}) {
  const a = usePieceActions(rm.id);
  // only the two slices the shell reads, so a point drawn elsewhere
  // does not redraw the room
  const st = useRoom(
    useShallow((s: RoomConfig) => ({ rooms: s.rooms, joins: s.joins })),
  );
  const outline = footprintOf(rm);
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
  const rects = a.shown
    .filter((n) => !isRug(n))
    .map((n) => ({
      id: n.id,
      ...a.spots.get(n.id)!,
      ...footprint(a.props.get(n.id)!),
    }));
  return (
    <group position={[dx, 0, dz]}>
      <RoomShell
        r={{
          W: rm.width,
          D: rm.depth,
          outline,
          openings: openingsOf(st, rm),
          height: rm.height,
          thickness: rm.thickness,
          floor: rm.floor as Floor,
          floorHex: floor,
          wallHex: wall,
          evening,
          sun,
          shared: sharedOf(st, rm),
        }}
        walk={false}
        onWalkTo={() => undefined}
        // another room's floor takes the surroundings: one picture is the room's
        reflection={null}
      />
      {a.shown.map((n) => {
        const p = a.props.get(n.id)!;
        const at = a.spots.get(n.id)!;
        const f = footprint(p);
        return (
          <Piece
            key={n.id}
            portal={portal}
            node={n}
            props={p}
            at={[
              -w / 2 + toMetres(at.x + f.w / 2),
              0,
              -d / 2 + toMetres(at.y + f.d / 2),
            ]}
            turn={-(p.rotation * Math.PI) / 180}
            size={[toMetres(p.width), toMetres(p.height), toMetres(p.depth)]}
            colour={n.kind === "piece" ? colourHex(p.colour) : ROOM_ITEM_HEX}
            parts={(n.children ?? []).map((c) =>
              colourHex(propsOf(c, a.overrides).colour),
            )}
            selected={a.selectedId === n.id && !rendering}
            clash={a.clashes.has(n.id)}
            label={a.labelOf(n)}
            canDrag={false}
            room={{
              W: rm.width,
              D: rm.depth,
              w,
              d,
              outline,
              thickness: rm.thickness,
            }}
            others={rects}
            onPick={() => a.onPick(n)}
            onTurn={() => a.turn(n)}
            onDragging={() => undefined}
            hovered={false}
            onHover={() => undefined}
            labels={labels}
            edges={edges}
            actions={null}
          />
        );
      })}
    </group>
  );
}

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
  const materialsPending = useMaterials((s) =>
    s.listed === null ? -1 : s.listed.length - Object.keys(s.loaded).length,
  );
  useEffect(() => loadMaterials(), []);
  // the part worker's requests under way, for the stage to say
  const partsPending = usePartStore((s) => s.pending);
  const walk = useStudio((s) => s.walk);
  const room = useActiveRoom();
  const rooms = useRoom((s) => s.rooms);
  const joins = useRoom((s) => s.joins);
  const outline = footprintOf(room);
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
  // centre (the origin), so the camera frames every room
  const box = sheetBox(rooms);
  const centre = useMemo(
    (): readonly [number, number] => [
      toMetres(box.x + box.w / 2 - room.pos[0] - room.width / 2),
      toMetres(box.y + box.h / 2 - room.pos[1] - room.depth / 2),
    ],
    [box.x, box.y, box.w, box.h, room.pos, room.width, room.depth],
  );
  const [dragging, setDragging] = useState(false);
  // the piece under the pointer: the canvas shows a hand over one that
  // can be dragged, a finger over one that can only be picked
  const [hover, setHover] = useState<string | null>(null);
  const hoverOf = (id: string) => (on: boolean) =>
    setHover((cur) => (on ? id : cur === id ? null : cur));
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
  // the pieces on the floor for the tour: a rug is walked over
  // the pieces on the floor in mm, for the magnet between them
  const rects = a.shown
    .filter((n) => !isRug(n))
    .map((n) => ({
      id: n.id,
      ...a.spots.get(n.id)!,
      ...footprint(a.props.get(n.id)!),
    }));
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
  // a shared room is small on its page: the names would pile up
  const readOnly = useStudio((s) => s.readOnly);
  // a render has its shadows whatever the View settings, and no names,
  // grid or edges over the picture
  const shadows =
    rendered || (scene.shadows === "auto" ? !coarse : scene.shadows === "on");
  const labels = scene.labels && !readOnly && !rendered;
  const grid = scene.grid && !rendered;
  const edges = scene.edges && !rendered;
  const light = LIGHTS[scene.light];
  const sunFrom = useMemo(
    () =>
      windowSun(
        { W: room.width, D: room.depth, outline },
        openingsOf({ joins }, room),
        light.height,
        SUN.back,
        SUN.aside,
      ) ?? light.from,
    [room, outline, joins, light],
  );
  const backend = useStudio((s) => s.backend);
  // the picture's finish follows the device once the backend is known; a
  // render has it whatever the View settings; a stage that fails on this
  // device turns it off for good
  const [postFailed, setPostFailed] = useState(false);
  const tier = backend ? tierOf(scene.quality, coarse, backend) : null;
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
    openingsOf({ joins }, room),
    sharedOf({ rooms }, room),
    floor,
    wall,
    scene.light,
    scene.sky,
    shadows,
  ]);
  const pieces = useRef<Group>(null);
  // what the floor reflects: the shell and its light, the pieces as they
  // stand and look, and the ceiling that walking puts overhead
  const reflectStamp =
    probeStamp +
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
  const [probeState, setProbeState] = useState<StillState>("pending");
  const [reflectState, setReflectState] = useState<StillState>("pending");
  const [probeDone, setProbeDone] = useState({ at: 0, of: 0 });
  const [settling, setSettling] = useState(0);
  const [drawn, setDrawn] = useState(false);
  const skyShadow = shadows && tier === "desktop" && !devFlag("noskyshadow");
  const liveSun = useMemo(
    () => ({ position: sunFrom, colour: light.colour, intensity: light.sun }),
    [sunFrom, light.colour, light.sun],
  );
  const skyReach = Math.max(w, d) * 0.75;
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
      ? settling > 0
        ? "grade"
        : null
      : probeState !== "ready"
        ? "light"
        : reflectState !== "ready"
          ? "floor"
          : settling > 0 && temporal
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
      data-parts={partsPending}
      data-walk={walk}
      data-dragging={dragging}
      data-hover={
        hover === null || rendering
          ? "none"
          : canDrag && !a.props.get(hover)?.locked && !walk
            ? "grab"
            : "pick"
      }
      data-edges={edges}
      data-shadows={shadows}
      data-labels={labels}
      data-grid={grid}
      data-light={scene.light}
      data-sky={scene.sky}
      data-materials={photographed}
      data-materials-pending={materialsPending}
      data-photo={photo?.state ?? "idle"}
      data-photo-samples={photo?.samples ?? 0}
      data-photo-ms={photo?.ms ?? 0}
      data-photo-size={photo ? `${photo.width}x${photo.height}` : ""}
      data-exposure={scene.exposure}
      data-backend={backend}
      data-drawn={drawn}
      data-settled={settling === 0}
      data-post={post ?? "off"}
      data-probes={probes ? probeState : "off"}
      data-reflection={probes ? reflectState : "off"}
    >
      <Canvas
        // a frame only when something moves: the orbit, a glide, a walk, a
        // drag or a change in the room; the rest of the time the GPU rests
        frameloop="demand"
        shadows={shadows ? SHADOWS : false}
        // at most two device pixels per CSS pixel: a phone's screen draws
        // less than half of what it would, with nothing to see for it
        dpr={[1, 2]}
        gl={coarse ? makeRendererCoarse : makeRendererFine}
        camera={{ fov: 42, near: 0.05, far: 100 }}
        onPointerMissed={() => undefined}
      >
        {walk ? (
          <Walker
            w={w}
            d={d}
            outline={outline}
            walkable={walkable}
            blocks={blocks}
            stage={stage}
          />
        ) : (
          <Rig
            angle={angle}
            w={toMetres(box.w)}
            d={toMetres(box.h)}
            h={h}
            centre={centre}
            stage={stage}
          />
        )}
        <Exposure value={scene.exposure} />
        <Backend />
        <FirstFrame onDrawn={() => setDrawn(true)} />
        <LiveHandle w={w} d={d} h={h} centre={centre} sun={liveSun} />
        {tier && <Photo tier={tier} stamp={reflectStamp} />}
        <PhotoBench />
        {post && (
          <Post
            tier={post}
            onFailed={failPost(setPostFailed)}
            onSettle={setSettling}
          />
        )}
        <hemisphereLight
          // the desktop tier takes part of the sky's light as a shadowed
          // light from above instead
          intensity={light.sky * (skyShadow ? 1 - SKY_SHADOW.share : 1)}
          color={light.fill}
          groundColor={GROUND_HEX}
        />
        <directionalLight
          position={sunFrom}
          intensity={light.sun}
          color={light.colour}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-radius={3}
          shadow-bias={-0.0003}
          shadow-normalBias={0.02}
        />
        {skyShadow && (
          // the sky's shadow: a dim light from straight above with a wide,
          // soft shadow, so undersides and the floor beneath a piece
          // darken as they do under an open sky
          <directionalLight
            position={[0.3, SKY_SHADOW.height, 0.2]}
            intensity={light.sky * SKY_SHADOW.share}
            color={light.fill}
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-radius={SKY_SHADOW.radius}
            shadow-bias={-0.0005}
            shadow-normalBias={0.04}
            shadow-camera-left={-skyReach}
            shadow-camera-right={skyReach}
            shadow-camera-top={skyReach}
            shadow-camera-bottom={-skyReach}
            shadow-camera-near={1}
            shadow-camera-far={SKY_SHADOW.height + 2}
          />
        )}
        <RoomLight evening={scene.light === "evening"} sky={scene.sky} />
        {probes && (
          <Probes
            w={w}
            h={h}
            d={d}
            stamp={probeStamp}
            pieces={pieces}
            bounce={backend !== "software"}
            onState={setProbeState}
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
        {!a.focus && (
          <RoomShell
            r={{
              W: room.width,
              D: room.depth,
              outline,
              openings: openingsOf({ joins }, room),
              height: room.height,
              thickness: room.thickness,
              shared: sharedOf({ rooms }, room),
              floor: room.floor as Floor,
              floorHex: floor,
              wallHex: wall,
              evening: scene.light === "evening",
              sun: sunFrom,
            }}
            walk={walk}
            onWalkTo={(x, z) => {
              WALK.goto = { x, z };
              WALK.wake();
            }}
            reflection={
              probes ? { stamp: reflectStamp, onState: setReflectState } : null
            }
          />
        )}
        {!a.focus &&
          rooms
            .filter((rm) => rm.id !== room.id)
            .map((rm) => (
              <OtherRoom
                key={rm.id}
                rm={rm}
                from={room}
                portal={portal}
                labels={labels}
                edges={edges}
                rendering={rendering}
                sun={sunFrom}
              />
            ))}
        <group ref={pieces} userData={PIECES_TAG}>
          {a.shown.map((n) => {
            const p = a.props.get(n.id)!;
            const size: Vector3Tuple = [
              toMetres(p.width),
              toMetres(p.height),
              toMetres(p.depth),
            ];
            const at = a.spots.get(n.id)!;
            const f = footprint(p);
            const pos: Vector3Tuple = a.focus
              ? [0, 0, 0]
              : [
                  -w / 2 + toMetres(at.x + f.w / 2),
                  0,
                  -d / 2 + toMetres(at.y + f.d / 2),
                ];
            const label = a.labelOf(n);
            return (
              <Piece
                key={n.id}
                portal={portal}
                node={n}
                props={p}
                at={pos}
                turn={a.focus ? 0 : -(p.rotation * Math.PI) / 180}
                size={size}
                colour={
                  n.kind === "piece" ? colourHex(p.colour) : ROOM_ITEM_HEX
                }
                parts={(n.children ?? []).map((c) =>
                  colourHex(propsOf(c, a.overrides).colour),
                )}
                selected={a.selectedId === n.id && !rendering}
                clash={a.clashes.has(n.id)}
                label={label}
                canDrag={canDrag && !p.locked && !walk}
                room={{
                  W: a.room.W,
                  D: a.room.D,
                  w,
                  d,
                  outline,
                  thickness: a.room.thickness,
                }}
                others={rects}
                onPick={() => a.onPick(n)}
                onTurn={() => a.turn(n)}
                onDragging={setDragging}
                hovered={hover === n.id && !rendering}
                onHover={hoverOf(n.id)}
                labels={labels}
                edges={edges}
                actions={
                  a.actionsFor === n.id ? (
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
        <OrbitControls
          makeDefault
          enabled={!walk && !dragging && !panelDrag}
          enablePan={false}
          minDistance={1}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />
      </Canvas>
      <div ref={portal} className="stage-3d-overlay" />
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
