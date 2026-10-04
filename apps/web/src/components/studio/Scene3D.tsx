"use client";

import { Html, OrbitControls } from "@react-three/drei";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Plane, Shape, Vector3, type Vector3Tuple } from "three";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { Furniture3D } from "./Furniture3D";
import { ArrowLeftIcon, LockIcon, RotateIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import {
  colourHex,
  footprint,
  isRug,
  ROOM_ITEM_HEX,
  type PieceProps,
  normTurn,
  ROTATE_SNAP,
} from "./piece-detail";
import { FLOOR_TONES, WALL_TONES, type Floor } from "./room-data";
import { settle, type Rect } from "./room-layout";
import { edgesOf, insideOutline } from "./room-geometry";
import type { Point } from "./room-templates";
import { footprintOf, useRoom } from "./room-store";
import { propsOf, useScene } from "./scene-store";
import { useCoarse } from "./input";
import { useStudio, type Angle } from "./studio-store";

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
const m = (mm: number) => mm / 1000;

/** the light in the room: the day's, or an evening's, warmer and lower */
const LIGHTS = {
  day: {
    ambient: 0.9,
    sun: 1.4,
    colour: "#ffffff",
    from: [3, 6, 4] as Vector3Tuple,
  },
  evening: {
    ambient: 0.7,
    sun: 1,
    colour: "#ffe3c8",
    from: [-4, 2.5, 3] as Vector3Tuple,
  },
} as const;
/** the floor grid's lines */
const GRID_HEX = "#b9a797";

/** the floor as a shape in metres about the room's middle; the plane is
    laid flat by a quarter turn, so the shape's y runs the other way */
const floorShape = (
  outline: readonly (readonly [number, number])[],
  w: number,
  d: number,
) => {
  const shape = new Shape();
  outline.forEach(([x, y], i) => {
    const px = m(x) - w / 2;
    const py = -(m(y) - d / 2);
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();
  return shape;
};
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const EYE = 1.6;
const GLIDE = 0.6; // s, the camera's move between angles
const WALK_SPEED = 1.6; // m/s
const TOUR_SPEED = 0.9; // m/s, a slow walk to look about
const TOUR_INSET = 1.2; // m, the default round keeps this off the walls
const TOUR_CLEAR = 0.4; // m, the round keeps this off the pieces
const TOUR_NEAR = 0.8; // m, this close to what it looks at, it looks ahead
const TOUR_LOOK_AT = 0.9; // m, the height the tour's eye settles on
const DRAG_FROM_M = 0.03; // m, a press that travels less is a click

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

/** where the camera stands for each angle, scaled to the room */
const cameraFor = (angle: Angle, w: number, d: number, h: number) => {
  const r = Math.max(w, d);
  const eye = h / 2;
  const at: Vector3Tuple = [0, eye, 0];
  const pos: Record<string, Vector3Tuple> = {
    Perspective: [r * 0.9, r * 0.75, r * 1.1],
    Front: [0, eye, r * 1.4],
    Back: [0, eye, -r * 1.4],
    Left: [-r * 1.4, eye, 0],
    Right: [r * 1.4, eye, 0],
    Top: [0, r * 1.8, 0.01],
  };
  return { pos: pos[angle] ?? pos.Perspective!, at };
};

type Controls = { target: Vector3; update: () => void } | null;

/** the camera glides to the angle's place */
function Rig({
  angle,
  w,
  d,
  h,
  stage,
}: {
  angle: Angle;
  w: number;
  d: number;
  h: number;
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
  useEffect(() => {
    const { pos, at } = cameraFor(angle, w, d, h);
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
  }, [angle, w, d, h, camera, controls, invalidate, size]);
  useFrame((_, raw) => {
    // the clock runs while the scene rests: a frame after a pause steps
    // no further than a tenth of a second
    const dt = Math.min(raw, 0.1);
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
    }
    report(stage, camera.position);
  });
  return null;
}

/** the camera at eye height, moved by the keys and turned by a drag */
function Walker({
  w,
  d,
  outline,
  blocks,
  stage,
}: {
  w: number;
  d: number;
  /** the room's outline, mm; the walk keeps inside it */
  outline: readonly (readonly [number, number])[];
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
    const toM = ([x, y]: readonly [number, number]) => ({
      x: x / 1000 - w / 2,
      z: y / 1000 - d / 2,
    });
    const stops = useRoom.getState().stops.map(toM);
    const inset = Math.max(0.5, Math.min(TOUR_INSET, Math.min(w, d) / 2 - 0.3));
    const inRoom = (x: number, z: number) =>
      insideOutline((x + w / 2) * 1000, (z + d / 2) * 1000, outline);
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
  }, [touring, w, d, outline, invalidate]);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1);
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
  room: { W: number; D: number; w: number; d: number; outline: Point[] };
  /** the other pieces on the floor, in mm, which draw a dragged one too */
  others: (Rect & { id: string })[];
  actions: React.ReactNode;
  onPick: () => void;
  onTurn: () => void;
  onDragging: (on: boolean) => void;
  /** the View settings: the name under the piece, edges on it */
  labels: boolean;
  edges: boolean;
}) {
  // the handle: a click turns a quarter; a sideways drag turns freely,
  // a degree a pixel, snapped unless Shift is held
  const spin = useRef<{ x0: number; r0: number; moved: boolean } | null>(null);
  const spinSkip = useRef(false);
  const onSpinDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    spin.current = { x0: e.clientX, r0: props.rotation, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onSpinMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const s = spin.current;
    if (!s) return;
    const dx = e.clientX - s.x0;
    if (!s.moved) {
      if (Math.abs(dx) < 4) return;
      s.moved = true;
      useScene.getState().dragStart();
    }
    const raw = s.r0 + dx;
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
    if (s.moved) {
      useScene.getState().dragEnd();
      spinSkip.current = true;
    }
  };
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
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <Furniture3D
        edges={edges}
        node={node}
        size={size}
        colour={colour}
        parts={parts}
        texture={props.texture}
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
      {selected && canDrag && (
        <Html
          portal={portal}
          position={[-size[0] / 2, size[1] + 0.12, -size[2] / 2]}
          center
          zIndexRange={[45, 35]}
        >
          <button
            type="button"
            className="stage-piece-turn stage-turn-3d shell-tip"
            data-tooltip="Turn: click a quarter, drag freely"
            aria-label={`Turn ${node.name}`}
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
          >
            <RotateIcon size={12} />
          </button>
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
      {labels && (
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

export default function Scene3D() {
  const a = usePieceActions();
  const portal = useRef<HTMLDivElement>(null!);
  const stage = useRef<HTMLDivElement>(null);
  const angle = useStudio((s) => s.angle);
  const walk = useStudio((s) => s.walk);
  const room = useRoom();
  const outline = footprintOf(room);
  const [dragging, setDragging] = useState(false);
  const w = m(room.width);
  const d = m(room.depth);
  const h = m(room.height);
  const wall =
    WALL_TONES.find((t) => t.id === room.wallTone)?.hex ?? WALL_TONES[0].hex;
  const floor = FLOOR_TONES[room.floor as Floor] ?? FLOOR_TONES.Vinyl;
  const canDrag = a.tool === "select" && !a.focus;
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
            x: -w / 2 + m(at.x + f.w / 2),
            z: -d / 2 + m(at.y + f.d / 2),
            w: m(f.w),
            d: m(f.d),
          };
        });
  // a finger means a phone or a tablet: fewer pixels, no shadows unless
  // the View settings ask for them
  const coarse = useCoarse();
  const scene = useStudio((s) => s.scene);
  // a shared room is small on its page: the names would pile up
  const readOnly = useStudio((s) => s.readOnly);
  const shadows = scene.shadows === "auto" ? !coarse : scene.shadows === "on";
  const light = LIGHTS[scene.light];
  return (
    <div
      ref={stage}
      className="stage-3d"
      data-focus={a.focus !== null}
      data-walk={walk}
      data-dragging={dragging}
      data-edges={scene.edges}
      data-shadows={shadows}
      data-labels={scene.labels}
      data-grid={scene.grid}
      data-light={scene.light}
    >
      <Canvas
        // a frame only when something moves: the orbit, a glide, a walk, a
        // drag or a change in the room; the rest of the time the GPU rests
        frameloop="demand"
        shadows={shadows}
        // at most two device pixels per CSS pixel: a phone's screen draws
        // less than half of what it would, with nothing to see for it;
        // the buffer is kept so Export can read the canvas as a picture
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: !coarse,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
        camera={{ fov: 42, near: 0.05, far: 100 }}
        onPointerMissed={() => undefined}
      >
        {walk ? (
          <Walker w={w} d={d} outline={outline} blocks={blocks} stage={stage} />
        ) : (
          <Rig angle={angle} w={w} d={d} h={h} stage={stage} />
        )}
        <ambientLight intensity={light.ambient} color={light.colour} />
        <directionalLight
          position={light.from}
          intensity={light.sun}
          color={light.colour}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {scene.grid && !a.focus && (
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
          <group>
            {/* the floor, the room's own outline (a click on it, walking,
                goes there); then a wall along every edge, facing in, so
                the near walls are seen through and the far ones stand */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
              onClick={(e) => {
                if (!walk) return;
                e.stopPropagation();
                WALK.goto = { x: e.point.x, z: e.point.z };
                WALK.wake();
              }}
            >
              <shapeGeometry args={[floorShape(outline, w, d)]} />
              <meshStandardMaterial color={floor} roughness={0.95} />
            </mesh>
            {edgesOf(outline).map((e, i) => {
              const ax = m(e.a[0]) - w / 2;
              const az = m(e.a[1]) - d / 2;
              const bx = m(e.b[0]) - w / 2;
              const bz = m(e.b[1]) - d / 2;
              const len = Math.hypot(bx - ax, bz - az);
              // the plane's face points +z; turn it to face into the room
              const yaw =
                e.wall === "north"
                  ? 0
                  : e.wall === "south"
                    ? Math.PI
                    : e.wall === "west"
                      ? Math.PI / 2
                      : -Math.PI / 2;
              return (
                <mesh
                  key={i}
                  position={[(ax + bx) / 2, h / 2, (az + bz) / 2]}
                  rotation={[0, yaw, 0]}
                  receiveShadow
                >
                  <planeGeometry args={[len, h]} />
                  <meshStandardMaterial color={wall} roughness={1} />
                </mesh>
              );
            })}
          </group>
        )}
        {a.shown.map((n) => {
          const p = a.props.get(n.id)!;
          const size: Vector3Tuple = [m(p.width), m(p.height), m(p.depth)];
          const at = a.spots.get(n.id)!;
          const f = footprint(p);
          const pos: Vector3Tuple = a.focus
            ? [0, 0, 0]
            : [-w / 2 + m(at.x + f.w / 2), 0, -d / 2 + m(at.y + f.d / 2)];
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
              colour={n.kind === "piece" ? colourHex(p.colour) : ROOM_ITEM_HEX}
              parts={(n.children ?? []).map((c) =>
                colourHex(propsOf(c, a.overrides).colour),
              )}
              selected={a.selectedId === n.id}
              clash={a.clashes.has(n.id)}
              label={label}
              canDrag={canDrag && !p.locked && !walk}
              room={{ W: a.room.W, D: a.room.D, w, d, outline }}
              others={rects}
              onPick={() => a.onPick(n)}
              onTurn={() => a.turn(n)}
              onDragging={setDragging}
              labels={scene.labels && !readOnly}
              edges={scene.edges}
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
        <OrbitControls
          makeDefault
          enabled={!walk && !dragging}
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
