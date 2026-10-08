"use client";

import {
  axisField,
  featureMark,
  panelBoxSize,
  resizeAlongAxis,
  SNAP_MM,
  snapGroupDelta,
  snapHintOf,
  snapResizeFace,
  type Feature,
  type Panel,
  type SnapHint,
  type Vec3,
} from "@furnishes/domain";
import { toMetres } from "@furnishes/scene";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BoxGeometry,
  EdgesGeometry,
  type Group,
  Plane,
  Quaternion,
  Vector3,
  type Vector3Tuple,
} from "three";
import { type Finish, Mat, metal, METAL, Slab } from "./finish";
import { ACCENT_HEX } from "./piece-detail";
import { useScene } from "./scene-store";

/**
 * A piece opened as panels: each panel a slab in the piece's finish.
 * With the piece in hand, a click on a panel picks it; the picked
 * panel drags about (on the plane facing the camera, so it goes where
 * the pointer goes), and a face snaps to a neighbour's face or centre
 * line within SNAP_MM, a guide marking the patch where they meet. A
 * ball off each of its four edges drags that edge along its axis, the
 * far edge held (Alt holds the centre), snapping the same way; the
 * thickness is typed in the Detail tab, never dragged. A drag is one
 * step to undo; letting go settles the piece's box round its panels.
 * A panel's machining (features.ts) is drawn on its face as marks: a
 * disc a hole, a dark strip a groove or a cut-out.
 */
/** the marks' colour: the wood cut into, in shadow */
const MARK_HEX = "#3a3129";

type Axis3 = 0 | 1 | 2;
/** what is drawn but never picked: the guide, the outline, the ball's
    body (its wider grab takes the pointer) */
const unpickable = () => null;
/** a press that travels less is a click, mm */
const CLICK_MM = 3;
/** how far a ball floats off its face, mm */
const HANDLE_OFF_MM = 40;
/** a ball's size as a share of its distance from the eye, so it reads
    the same from near and far; the grab round it is wider */
const HANDLE_SHARE = 0.006;
const HIT_SHARE = 2.4;

const unitAxis = (axis: Axis3) =>
  new Vector3().setComponent(axis, 1) as Vector3;

/** the pointer's place along a world line through `p0` along `dir`:
    the nearest point between the line and the ray, so a drag works
    from any angle */
const alongLine = (
  ray: ThreeEvent<PointerEvent>["ray"],
  p0: Vector3,
  dir: Vector3,
) => {
  const w0 = p0.clone().sub(ray.origin);
  const b = dir.dot(ray.direction);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-6) return dir.dot(w0);
  return (b * ray.direction.dot(w0) - dir.dot(w0)) / denom;
};

export function Panels3D({
  pieceId,
  panels,
  f,
  editable,
}: {
  pieceId: string;
  panels: readonly Panel[];
  f: Finish;
  /** the piece is in hand: its panels can be picked and moved */
  editable: boolean;
}) {
  const panelId = useScene((s) => s.panelId);
  const group = useRef<Group>(null);
  const [hint, setHint] = useState<SnapHint | null>(null);
  const picked = editable ? panels.find((p) => p.id === panelId) : undefined;
  return (
    <group ref={group}>
      {panels.map((p) => (
        <PanelMesh
          key={p.id}
          panel={p}
          panels={panels}
          pieceId={pieceId}
          f={f}
          editable={editable}
          picked={picked?.id === p.id}
          group={group}
          onHint={setHint}
        />
      ))}
      {picked && (
        <>
          <Picked panel={picked} />
          {([0, 1, 2] as const)
            .filter((axis) => axisField(picked.normal, axis) !== "thickness")
            .flatMap((axis) =>
              ([1, -1] as const).map((sign) => (
                <FaceHandle
                  key={`${axis}${sign}`}
                  panel={picked}
                  panels={panels}
                  pieceId={pieceId}
                  axis={axis}
                  sign={sign}
                  group={group}
                  onHint={setHint}
                />
              )),
            )}
        </>
      )}
      {hint && editable && <Hint hint={hint} />}
    </group>
  );
}

/** the outline of the picked panel, a hair outside it */
function Picked({ panel }: { panel: Panel }) {
  const [w, h, d] = panelBoxSize(panel).map(toMetres) as Vector3Tuple;
  const geometry = useMemo(
    () => new EdgesGeometry(new BoxGeometry(w + 0.003, h + 0.003, d + 0.003)),
    [w, h, d],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments
      geometry={geometry}
      position={panel.position.map(toMetres) as Vector3Tuple}
      raycast={unpickable}
    >
      <lineBasicMaterial color={ACCENT_HEX} />
    </lineSegments>
  );
}

/** the snap's guide: a flat patch on the snapped plane */
function Hint({ hint }: { hint: SnapHint }) {
  const [a, b] = ([0, 1, 2] as const).filter((k) => k !== hint.axis);
  const rotation: Vector3Tuple =
    hint.axis === 0
      ? [0, Math.PI / 2, 0]
      : hint.axis === 1
        ? [-Math.PI / 2, 0, 0]
        : [0, 0, 0];
  return (
    <mesh
      position={hint.at.map(toMetres) as Vector3Tuple}
      rotation={rotation}
      renderOrder={2}
      raycast={unpickable}
    >
      <planeGeometry
        args={[
          Math.max(0.004, toMetres(hint.size[hint.axis === 0 ? 2 : a!])),
          Math.max(0.004, toMetres(hint.size[hint.axis === 0 ? 1 : b!])),
        ]}
      />
      <meshBasicMaterial
        color={ACCENT_HEX}
        transparent
        opacity={0.55}
        depthTest={false}
        side={2}
      />
    </mesh>
  );
}

/** the world frame of the piece: where a local point stands and which
    way its axes point, for the drags */
const worldOf = (group: Group) => {
  const q = group.getWorldQuaternion(new Quaternion());
  return {
    point: (local: Vec3) =>
      group.localToWorld(new Vector3(...(local.map(toMetres) as Vector3Tuple))),
    dir: (axis: Axis3) => unitAxis(axis).applyQuaternion(q),
    toLocal: (v: Vector3) => v.clone().applyQuaternion(q.clone().invert()),
  };
};

function PanelMesh({
  panel,
  panels,
  pieceId,
  f,
  editable,
  picked,
  group,
  onHint,
}: {
  panel: Panel;
  panels: readonly Panel[];
  pieceId: string;
  f: Finish;
  editable: boolean;
  picked: boolean;
  group: React.RefObject<Group | null>;
  onHint: (h: SnapHint | null) => void;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const drag = useRef<{
    plane: Plane;
    hit: Vector3;
    from: Vec3;
    moved: boolean;
  } | null>(null);
  const moved = useRef(false);
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!editable) return;
    e.stopPropagation();
    moved.current = false;
    if (!picked || e.button !== 0 || !group.current) return;
    // the plane the panel slides on: through its centre, facing the camera
    const w = worldOf(group.current);
    const centre = w.point(panel.position);
    const normal = camera.getWorldDirection(new Vector3()).negate();
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, centre);
    const hit = new Vector3();
    if (!e.ray.intersectPlane(plane, hit)) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    // the step opens on the press, which also holds the camera still
    useScene.getState().dragStart();
    drag.current = { plane, hit, from: panel.position, moved: false };
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || !group.current) return;
    e.stopPropagation();
    const hit = new Vector3();
    if (!e.ray.intersectPlane(d.plane, hit)) return;
    const w = worldOf(group.current);
    const delta = w.toLocal(hit.clone().sub(d.hit)).multiplyScalar(1000);
    if (!d.moved) {
      if (delta.length() < CLICK_MM) return;
      d.moved = true;
      moved.current = true;
    }
    const proposed: Vec3 = [
      d.from[0] + delta.x,
      d.from[1] + delta.y,
      d.from[2] + delta.z,
    ];
    const others = panels.filter((p) => p.id !== panel.id);
    const snap = snapGroupDelta(
      [{ panel, position: proposed }],
      others,
      SNAP_MM,
    );
    const position = proposed.map((v, i) =>
      Math.round(v + snap.correction[i]!),
    ) as Vec3;
    useScene.getState().panelsMove(
      pieceId,
      panels.map((p) => (p.id === panel.id ? { ...p, position } : p)),
    );
    const axis = ([0, 1, 2] as const).find((k) => snap.snaps[k]?.hits.length);
    onHint(
      axis === undefined ? null : snapHintOf(axis, snap.snaps[axis]!.hits[0]!),
    );
    invalidate();
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    onHint(null);
    const s = useScene.getState();
    if (d.moved)
      s.setPanels(pieceId, s.overrides[pieceId]?.panels ?? panels, true);
    s.dragEnd();
  };
  return (
    <group
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        // the click after a drag is the drag's end, not a pick
        if (!moved.current)
          useScene.getState().selectPanel(picked ? null : panel.id);
      }}
    >
      <Slab
        f={f}
        at={panel.position.map(toMetres) as Vector3Tuple}
        dims={panelBoxSize(panel).map(toMetres) as Vector3Tuple}
      />
      {panel.features?.map((x) => (
        <Mark key={x.id} panel={panel} feature={x} />
      ))}
    </group>
  );
}

/** one feature's mark on its panel's face */
function Mark({ panel, feature }: { panel: Panel; feature: Feature }) {
  const m = featureMark(panel, feature);
  const centre = m.centre.map(toMetres) as Vector3Tuple;
  if (!m.round)
    return (
      <mesh position={centre} raycast={unpickable}>
        <boxGeometry args={m.size.map(toMetres) as Vector3Tuple} />
        <meshStandardMaterial color={MARK_HEX} roughness={1} />
      </mesh>
    );
  // a disc the hole's size, laid flat on the face: the cylinder stands
  // along y, so it is turned to the panel's normal
  const axis = panel.normal === "x" ? 0 : panel.normal === "y" ? 1 : 2;
  const r = toMetres(m.size[axis === 0 ? 1 : 0] / 2);
  const rotation: Vector3Tuple =
    axis === 0
      ? [0, 0, Math.PI / 2]
      : axis === 2
        ? [Math.PI / 2, 0, 0]
        : [0, 0, 0];
  return (
    <mesh position={centre} rotation={rotation} raycast={unpickable}>
      <cylinderGeometry args={[r, r, toMetres(m.size[axis]), 16]} />
      <meshStandardMaterial color={MARK_HEX} roughness={1} />
    </mesh>
  );
}

/** a ball off one edge of the picked panel: dragged along its axis it
    moves that edge, snapping to the neighbours */
function FaceHandle({
  panel,
  panels,
  pieceId,
  axis,
  sign,
  group,
  onHint,
}: {
  panel: Panel;
  panels: readonly Panel[];
  pieceId: string;
  axis: Axis3;
  sign: 1 | -1;
  group: React.RefObject<Group | null>;
  onHint: (h: SnapHint | null) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const [hovered, setHovered] = useState(false);
  const ball = useRef<Group>(null);
  // the ball keeps its size on the screen as the camera moves
  useFrame(({ camera }) => {
    const g = ball.current;
    if (!g) return;
    const d = camera.position.distanceTo(g.getWorldPosition(new Vector3()));
    g.scale.setScalar(Math.max(0.004, d * HANDLE_SHARE));
  });
  const drag = useRef<{
    start: Panel;
    p0: Vector3;
    dir: Vector3;
    param0: number;
    moved: boolean;
  } | null>(null);
  const half = panelBoxSize(panel)[axis] / 2;
  const face: Vec3 = [...panel.position];
  face[axis] += sign * half;
  const at: Vec3 = [...face];
  at[axis] += sign * HANDLE_OFF_MM;
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !group.current) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const w = worldOf(group.current);
    const p0 = w.point(face);
    const dir = w.dir(axis);
    useScene.getState().dragStart();
    drag.current = {
      start: panel,
      p0,
      dir,
      param0: alongLine(e.ray, p0, dir),
      moved: false,
    };
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const raw = (alongLine(e.ray, d.p0, d.dir) - d.param0) * 1000;
    if (!d.moved) {
      if (Math.abs(raw) < CLICK_MM) return;
      d.moved = true;
    }
    const others = panels.filter((p) => p.id !== panel.id);
    const fs = snapResizeFace(d.start, axis, sign, raw, others, SNAP_MM);
    const r = resizeAlongAxis(
      d.start,
      axis,
      sign,
      Math.round(fs.delta),
      e.nativeEvent.altKey,
    );
    if (!r) return;
    useScene.getState().panelsMove(
      pieceId,
      panels.map((p) =>
        p.id === panel.id
          ? { ...p, [r.field]: Math.round(r.value), position: r.position }
          : p,
      ),
    );
    onHint(fs.snap ? snapHintOf(axis, fs.snap) : null);
    invalidate();
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
    onHint(null);
    const s = useScene.getState();
    if (d.moved)
      s.setPanels(pieceId, s.overrides[pieceId]?.panels ?? panels, true);
    s.dragEnd();
  };
  return (
    <group ref={ball} position={at.map(toMetres) as Vector3Tuple}>
      <mesh raycast={unpickable}>
        <sphereGeometry args={[1, 16, 12]} />
        <Mat f={metal(hovered ? ACCENT_HEX : METAL, 0.5)} />
      </mesh>
      <mesh
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <sphereGeometry args={[HIT_SHARE, 8, 6]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
