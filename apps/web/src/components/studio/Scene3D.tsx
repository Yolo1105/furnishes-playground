"use client";

import { Html, OrbitControls } from "@react-three/drei";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Plane, Vector3, type Vector3Tuple } from "three";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { Furniture3D } from "./Furniture3D";
import { ArrowLeftIcon, LockIcon, RotateIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import {
  colourHex,
  footprint,
  PLACE_SNAP,
  ROOM_ITEM_HEX,
  type PieceProps,
} from "./piece-detail";
import { FLOOR_TONES, WALL_TONES, type Floor } from "./room-data";
import { settle } from "./room-layout";
import { useRoom } from "./room-store";
import { propsOf, useScene } from "./scene-store";
import { useStudio, type Angle } from "./studio-store";

/**
 * The room in 3D: the floor and two walls from the Room tab's size and
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
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const EYE = 1.6;
const GLIDE = 0.6; // s, the camera's move between angles
const WALK_SPEED = 1.6; // m/s
const DRAG_FROM = 0.03; // m, a press that travels less is a click

type WalkState = {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  keys: Set<string>;
  goto: { x: number; z: number } | null;
};

/** the walker's place and heading: one scene, one walker */
const WALK: WalkState = {
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  keys: new Set(),
  goto: null,
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
  const glide = useRef<{
    from: Vector3;
    fromAt: Vector3;
    to: Vector3;
    toAt: Vector3;
    t: number;
  } | null>(null);
  useEffect(() => {
    const { pos, at } = cameraFor(angle, w, d, h);
    glide.current = {
      from: camera.position.clone(),
      fromAt: controls?.target.clone() ?? new Vector3(0, h / 2, 0),
      to: new Vector3(...pos),
      toAt: new Vector3(...at),
      t: reduced() ? 1 : 0,
    };
  }, [angle, w, d, h, camera, controls]);
  useFrame((_, dt) => {
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
    }
    report(stage, camera.position);
  });
  return null;
}

/** the camera at eye height, moved by the keys and turned by a drag */
function Walker({
  w,
  d,
  stage,
}: {
  w: number;
  d: number;
  stage: RefObject<HTMLDivElement | null>;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    // in from the south-east corner, looking into the room, a little down
    const s = WALK;
    s.x = w / 2 - 0.6;
    s.z = d / 2 - 0.6;
    s.yaw = Math.PI / 4;
    s.pitch = -0.12;
    s.goto = null;
    camera.position.set(s.x, EYE, s.z);
    camera.rotation.set(0, 0, 0, "YXZ");
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      s.keys.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => s.keys.delete(e.key.toLowerCase());
    let look: { x: number; y: number } | null = null;
    const el = gl.domElement;
    const pdown = (e: PointerEvent) => {
      look = { x: e.clientX, y: e.clientY };
    };
    const pmove = (e: PointerEvent) => {
      if (!look) return;
      s.yaw -= (e.clientX - look.x) * 0.005;
      s.pitch = Math.max(
        -1.2,
        Math.min(1.2, s.pitch - (e.clientY - look.y) * 0.004),
      );
      look = { x: e.clientX, y: e.clientY };
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
  }, [camera, gl, w, d]);
  useFrame((_, dt) => {
    const s = WALK;
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
  actions,
  onPick,
  onTurn,
  onDragging,
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
  room: { W: number; D: number; w: number; d: number };
  actions: React.ReactNode;
  onPick: () => void;
  onTurn: () => void;
  onDragging: (on: boolean) => void;
}) {
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
      if (Math.hypot(dx, dz) < DRAG_FROM) return;
      dr.moved = true;
      moved.current = true;
      useScene.getState().dragStart();
      onDragging(true);
    }
    useScene
      .getState()
      .dragMove(
        node.id,
        settle(dr.x0 + dx * 1000, f.w, room.W, PLACE_SNAP),
        settle(dr.y0 + dz * 1000, f.d, room.D, PLACE_SNAP),
      );
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
            data-tooltip="Turn"
            aria-label={`Turn ${node.name}`}
            onClick={onTurn}
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
  const [dragging, setDragging] = useState(false);
  const w = m(room.width);
  const d = m(room.depth);
  const h = m(room.height);
  const wall =
    WALL_TONES.find((t) => t.id === room.wallTone)?.hex ?? WALL_TONES[0].hex;
  const floor = FLOOR_TONES[room.floor as Floor] ?? FLOOR_TONES.Vinyl;
  const canDrag = a.tool === "select" && !a.focus;
  return (
    <div
      ref={stage}
      className="stage-3d"
      data-focus={a.focus !== null}
      data-walk={walk}
      data-dragging={dragging}
    >
      <Canvas
        shadows
        // the buffer is kept so Export can read the canvas as a picture
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 42, near: 0.05, far: 100 }}
        onPointerMissed={() => undefined}
      >
        {walk ? (
          <Walker w={w} d={d} stage={stage} />
        ) : (
          <Rig angle={angle} w={w} d={d} h={h} stage={stage} />
        )}
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[3, 6, 4]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {!a.focus && (
          <group>
            {/* the floor (a click on it, walking, goes there), the back
                wall and the left wall */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
              onClick={(e) => {
                if (!walk) return;
                e.stopPropagation();
                WALK.goto = { x: e.point.x, z: e.point.z };
              }}
            >
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color={floor} roughness={0.95} />
            </mesh>
            <mesh position={[0, h / 2, -d / 2]} receiveShadow>
              <planeGeometry args={[w, h]} />
              <meshStandardMaterial color={wall} roughness={1} />
            </mesh>
            <mesh
              position={[-w / 2, h / 2, 0]}
              rotation={[0, Math.PI / 2, 0]}
              receiveShadow
            >
              <planeGeometry args={[d, h]} />
              <meshStandardMaterial color={wall} roughness={1} />
            </mesh>
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
              room={{ W: a.room.W, D: a.room.D, w, d }}
              onPick={() => a.onPick(n)}
              onTurn={() => a.turn(n)}
              onDragging={setDragging}
              actions={
                a.actionsFor === n.id && a.tool === "inspect" ? (
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
