"use client";

import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import type { Vector3Tuple } from "three";
import { CATEGORY_NAMES, type AssetNode } from "./assets-data";
import { ArrowLeftIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { PieceActions } from "./PieceActions";
import { COLOURS } from "./piece-detail";
import { FLOOR_TONES, WALL_TONES, type Floor } from "./room-data";
import { useRoom } from "./room-store";
import { propsOf } from "./scene-store";
import { layoutRoom } from "./room-layout";
import { useStudio, type Angle } from "./studio-store";

/**
 * The room in 3D, a stand-in until the real scene: the floor and two
 * walls from the Room tab's size and finish, and each piece as a box of
 * its size and colour from the Detail tab. Select and Inspect work on
 * the boxes as on the plan; the view angle chip moves the camera; drag
 * to orbit. A piece in focus stands alone on a blank ground.
 */
/* the accent as three.js needs it, a plain hex: the token itself is oklch */
const ACCENT = "#ed5c00";
/* a room item: there to read the room, so it stays quiet */
const ROOM_ITEM = "#d9d2c8";
const colourHex = (id: string) =>
  COLOURS.find((c) => c.id === id)?.hex ?? COLOURS[0].hex;
const m = (mm: number) => mm / 1000;

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

function Rig({
  angle,
  w,
  d,
  h,
}: {
  angle: Angle;
  w: number;
  d: number;
  h: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
  } | null;
  useEffect(() => {
    const { pos, at } = cameraFor(angle, w, d, h);
    camera.position.set(...pos);
    camera.lookAt(...at);
    controls?.target.set(...at);
    controls?.update();
  }, [angle, w, d, h, camera, controls]);
  return null;
}

function Piece({
  portal,
  node,
  at,
  size,
  colour,
  parts,
  selected,
  label,
  actions,
  onPick,
}: {
  /* every overlay goes into the scene's own layer: drei's default target,
     the canvas's parent, is not there yet for the first piece's labels */
  portal: RefObject<HTMLDivElement>;
  node: AssetNode;
  at: Vector3Tuple;
  size: Vector3Tuple;
  colour: string;
  /** the parts' colours and widths, in metres, when the piece has parts */
  parts: { colour: string; width: number }[];
  selected: boolean;
  label: number;
  actions: React.ReactNode;
  onPick: () => void;
}) {
  return (
    <group position={at}>
      {/* a piece built from parts stands as its parts, side by side, each
          in its own colour; a click on any part picks the piece */}
      {(parts.length ? parts : [{ colour, width: size[0] }]).map(
        (part, i, all) => {
          const x0 =
            -size[0] / 2 + all.slice(0, i).reduce((sum, q) => sum + q.width, 0);
          return (
            <mesh
              key={i}
              position={[x0 + part.width / 2, size[1] / 2, 0]}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation();
                onPick();
              }}
            >
              <boxGeometry args={[part.width, size[1], size[2]]} />
              <meshStandardMaterial color={part.colour} roughness={0.85} />
              {selected && <Edges color={ACCENT} lineWidth={1.5} />}
            </mesh>
          );
        },
      )}
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
  const angle = useStudio((s) => s.angle);
  const room = useRoom();
  const w = m(room.width);
  const d = m(room.depth);
  const h = m(room.height);
  const sizes = a.shown.map((n) => propsOf(n, a.overrides));
  const spots = layoutRoom(sizes, room.width, room.depth);
  const wall =
    WALL_TONES.find((t) => t.id === room.wallTone)?.hex ?? WALL_TONES[0].hex;
  const floor = FLOOR_TONES[room.floor as Floor] ?? FLOOR_TONES.Vinyl;
  return (
    <div className="stage-3d" data-focus={a.focus !== null}>
      <Canvas
        shadows
        // the buffer is kept so Export can read the canvas as a picture
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
        camera={{ fov: 42, near: 0.05, far: 100 }}
        onPointerMissed={() => undefined}
      >
        <Rig angle={angle} w={w} d={d} h={h} />
        <ambientLight intensity={0.9} />
        <directionalLight
          position={[3, 6, 4]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {!a.focus && (
          <group>
            {/* the floor, the back wall and the left wall */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
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
        {a.shown.map((n, i) => {
          const p = sizes[i]!;
          const size: Vector3Tuple = [m(p.width), m(p.height), m(p.depth)];
          const at = spots[i]!;
          const pos: Vector3Tuple = a.focus
            ? [0, 0, 0]
            : [
                -w / 2 + m(at.x) + size[0] / 2,
                0,
                -d / 2 + m(at.y) + size[2] / 2,
              ];
          const label = a.labelOf(n);
          return (
            <Piece
              key={n.id}
              portal={portal}
              node={n}
              at={pos}
              size={size}
              colour={n.kind === "piece" ? colourHex(p.colour) : ROOM_ITEM}
              parts={(n.children ?? []).map((c) => ({
                colour: colourHex(propsOf(c, a.overrides).colour),
                width: size[0] / (n.children?.length ?? 1),
              }))}
              selected={a.selectedId === n.id}
              label={label}
              onPick={() => a.onPick(n)}
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
