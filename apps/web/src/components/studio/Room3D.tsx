"use client";

import { toMetres } from "@furnishes/scene";
import { Environment, Lightformer } from "@react-three/drei";
import { LIGHT_WOOD_HEX } from "./piece-detail";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  DoubleSide,
  FrontSide,
  type Group,
  Path,
  Shape,
  Vector2,
  Vector3,
} from "three";
import {
  type Floor,
  isWindow,
  type Opening,
  OPENINGS,
  type Wall,
} from "./room-data";
import { edgesOf, type Edge } from "./room-geometry";
import { openingCentre } from "./room-health";
import type { Point } from "./room-templates";
import type { Sky } from "./studio-store";
import { floorTexture, reliefOf, shade, TILE_M } from "./textures";

/**
 * The room itself in 3D: the floor in its finish, a wall along every
 * edge facing in (so the near walls are seen through and the far ones
 * stand), a skirting at their feet, the window with its frame, sill
 * and glass, the door in its frame, and a ceiling once you are inside
 * walking. The light comes from a few soft panels baked into the
 * surroundings, a sun from the window's side, and soft shadows under
 * everything on the floor. All in metres about the room's middle.
 */
const SKIRTING = 0.1;
const FRAME = 0.07;
const FRAME_HEX = "#f7f3ec";
const DOOR_HEX = LIGHT_WOOD_HEX;
/** how strongly the floor's relief bends the light */
const FLOOR_RELIEF = new Vector2(0.3, 0.3);
const CEILING_HEX = "#f8f5f0";

const ROUGHNESS: Record<Floor, number> = {
  Vinyl: 0.7,
  Tiles: 0.35,
  Parquet: 0.6,
  Concrete: 0.9,
};

type RoomShape = {
  W: number;
  D: number;
  outline: readonly Point[];
  openings: readonly Opening[];
  height: number;
  floor: Floor;
  floorHex: string;
  wallHex: string;
  /** stretches of its walls shared with another room, mm along the
      wall's axis: where two rooms stand wall to wall the wall is built
      once, by the earlier room (`both`: this room builds it and it shows
      from both sides; else the other room does and this one skips it) */
  shared?: readonly Stretch[];
};
type Stretch = { wall: Wall; from: number; to: number; both: boolean };

/** a wall, a leaf or a pane shows only from inside its room, so a near
    wall never hides the room from the camera; one shared with the room
    beyond shows from both sides. Read each frame from where the camera
    stands against the thing's inward normal */
function Inside({
  normal,
  always = false,
  children,
}: {
  normal: readonly [number, number];
  always?: boolean;
  children: React.ReactNode;
}) {
  const group = useRef<Group>(null);
  const at = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    if (always) {
      g.visible = true;
      return;
    }
    g.getWorldPosition(at);
    const dot =
      (camera.position.x - at.x) * normal[0] +
      (camera.position.z - at.z) * normal[1];
    g.visible = dot > 0;
  });
  return <group ref={group}>{children}</group>;
}

/** an edge's wall as the runs this room builds: the whole edge, less
    the stretches another room builds, and split where a stretch is
    shared with a later room, since that run shows from both sides */
const runsOf = (
  e: Edge,
  shared: readonly Stretch[],
): { e: Edge; both: boolean }[] => {
  const horizontal = e.wall === "north" || e.wall === "south";
  const k = horizontal ? 0 : 1;
  const lo = Math.min(e.a[k], e.b[k]);
  const hi = Math.max(e.a[k], e.b[k]);
  const on = shared
    .filter((c) => c.wall === e.wall && c.to > lo && c.from < hi)
    .map((c) => ({ ...c, from: Math.max(lo, c.from), to: Math.min(hi, c.to) }));
  // every boundary splits the edge; each piece is skipped, shared or plain
  const marks = [
    ...new Set([lo, hi, ...on.flatMap((c) => [c.from, c.to])]),
  ].sort((p, q) => p - q);
  const forward = e.a[k] <= e.b[k];
  const at = (v: number): Point => (horizontal ? [v, e.a[1]] : [e.a[0], v]);
  const out: { e: Edge; both: boolean }[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const p = marks[i]!;
    const q = marks[i + 1]!;
    if (q - p <= 1) continue;
    const mid = (p + q) / 2;
    const in_ = on.filter((c) => c.from <= mid && mid <= c.to);
    if (in_.some((c) => !c.both)) continue;
    out.push({
      e: { a: at(forward ? p : q), b: at(forward ? q : p), wall: e.wall },
      both: in_.length > 0,
    });
  }
  return out;
};

/** the floor as a shape in metres about the room's middle; the plane is
    laid flat by a quarter turn, so the shape's y runs the other way */
const floorShape = (
  outline: readonly (readonly [number, number])[],
  w: number,
  d: number,
) => {
  const s = new Shape();
  outline.forEach(([x, y], i) => {
    const px = toMetres(x) - w / 2;
    const py = -(toMetres(y) - d / 2);
    if (i === 0) s.moveTo(px, py);
    else s.lineTo(px, py);
  });
  s.closePath();
  return s;
};

/** a wall's turn so its face points into the room */
const yawOf = (wall: Wall) =>
  wall === "north"
    ? 0
    : wall === "south"
      ? Math.PI
      : wall === "west"
        ? Math.PI / 2
        : -Math.PI / 2;

/** the inward normal of a wall, in the scene's x and z */
const inward = (wall: Wall): [number, number] =>
  wall === "north"
    ? [0, 1]
    : wall === "south"
      ? [0, -1]
      : wall === "west"
        ? [1, 0]
        : [-1, 0];

/** an opening's middle on its wall, in metres about the room's middle */
const placeOf = (r: RoomShape, o: Opening): [number, number] => {
  const { centre, at } = openingCentre(r, o);
  const horizontal = o.wall === "north" || o.wall === "south";
  const x = horizontal ? toMetres(centre) : toMetres(at);
  const z = horizontal ? toMetres(at) : toMetres(centre);
  return [x - toMetres(r.W) / 2, z - toMetres(r.D) / 2];
};
/** the holes an edge's wall has: each opening on this edge, as a box
    along the wall (metres from the edge's middle) and up it */
const holesOf = (r: RoomShape, e: Edge, h: number) => {
  const horizontal = e.wall === "north" || e.wall === "south";
  const mid = horizontal ? (e.a[0] + e.b[0]) / 2 : (e.a[1] + e.b[1]) / 2;
  const lo = horizontal ? Math.min(e.a[0], e.b[0]) : Math.min(e.a[1], e.b[1]);
  const hi = horizontal ? Math.max(e.a[0], e.b[0]) : Math.max(e.a[1], e.b[1]);
  // seen from inside, a south or west wall reads mirrored along its run
  const flip = e.wall === "south" || e.wall === "west" ? -1 : 1;
  return r.openings
    .filter((o) => o.wall === e.wall)
    .map((o) => ({ o, c: openingCentre(r, o).centre }))
    .filter(({ c }) => c >= lo && c <= hi)
    .map(({ o, c }) => {
      const sill = isWindow(o) ? toMetres(o.sill ?? OPENINGS.window.sill) : 0;
      const top = isWindow(o)
        ? Math.min(toMetres(o.head ?? OPENINGS.window.head), h - 0.15)
        : Math.min(toMetres(OPENINGS.door.height), h - 0.1);
      return {
        o,
        x: flip * toMetres(c - mid),
        w: toMetres(o.width),
        y0: sill,
        y1: top,
      };
    });
};

function WallRun({
  e,
  w,
  d,
  h,
  wallHex,
  holes,
  both = false,
}: {
  e: Edge;
  w: number;
  d: number;
  h: number;
  wallHex: string;
  holes: ReturnType<typeof holesOf>;
  /** shared with the room beyond: seen from both sides */
  both?: boolean;
}) {
  const ax = toMetres(e.a[0]) - w / 2;
  const az = toMetres(e.a[1]) - d / 2;
  const bx = toMetres(e.b[0]) - w / 2;
  const bz = toMetres(e.b[1]) - d / 2;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = yawOf(e.wall);
  const [nx, nz] = inward(e.wall);
  // the wall as a shape with its openings cut out, so a doorway is a
  // way through and a window a hole for the glass
  const shape = useMemo(() => {
    const sh = new Shape();
    sh.moveTo(-len / 2, 0);
    sh.lineTo(len / 2, 0);
    sh.lineTo(len / 2, h);
    sh.lineTo(-len / 2, h);
    sh.closePath();
    for (const hole of holes) {
      const x0 = Math.max(-len / 2, hole.x - hole.w / 2);
      const x1 = Math.min(len / 2, hole.x + hole.w / 2);
      if (x1 - x0 < 0.05) continue;
      const path = new Path();
      path.moveTo(x0, hole.y0);
      path.lineTo(x1, hole.y0);
      path.lineTo(x1, hole.y1);
      path.lineTo(x0, hole.y1);
      path.closePath();
      sh.holes.push(path);
    }
    return sh;
  }, [len, h, holes]);
  return (
    <Inside normal={[nx, nz]} always={both}>
      <group
        position={[(ax + bx) / 2, 0, (az + bz) / 2]}
        rotation={[0, yaw, 0]}
      >
        <mesh receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial
            color={wallHex}
            roughness={0.95}
            side={DoubleSide}
          />
        </mesh>
        {/* the skirting stands just inside the wall's face */}
        <mesh
          position={[0, SKIRTING / 2, 0.008 * (nx || nz ? 1 : 1)]}
          receiveShadow
        >
          <boxGeometry args={[len, SKIRTING, 0.016]} />
          <meshStandardMaterial color={shade(wallHex, -0.06)} roughness={0.7} />
        </mesh>
      </group>
    </Inside>
  );
}

/** a face on the wall's inside, seen from inside as the wall is, so a
    near wall's openings go with it */
function Face({
  at,
  size,
  colour,
  rough = 0.6,
  emissive,
  both = false,
}: {
  at: [number, number, number];
  size: [number, number];
  colour: string;
  rough?: number;
  emissive?: string;
  /** seen from behind too: a leaf or a pane in a cut wall */
  both?: boolean;
}) {
  return (
    <mesh position={at} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial
        color={colour}
        roughness={rough}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissive ? 0.9 : 0}
        side={both ? DoubleSide : FrontSide}
      />
    </mesh>
  );
}

function Window({ r, o }: { r: RoomShape; o: Opening }) {
  const width = toMetres(o.width);
  const sill = toMetres(o.sill ?? OPENINGS.window.sill);
  const head = Math.min(
    toMetres(o.head ?? OPENINGS.window.head),
    toMetres(r.height) - 0.15,
  );
  const tall = head - sill;
  const mid = sill + tall / 2;
  const [x, z] = placeOf(r, o);
  const yaw = yawOf(o.wall);
  return (
    <Inside normal={inward(o.wall)} always={o.join !== undefined}>
      <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
        {/* the glass, reading as daylight; the frame, a transom, the sill */}
        <Face
          at={[0, mid, 0.01]}
          size={[width, tall]}
          colour="#dfeaf2"
          rough={0.15}
          emissive="#eef5fa"
          both
        />
        {[-1, 1].map((s) => (
          <Face
            key={s}
            at={[(s * (width + FRAME)) / 2, mid, 0.02]}
            size={[FRAME, tall + 2 * FRAME]}
            colour={FRAME_HEX}
          />
        ))}
        <Face
          at={[0, head + FRAME / 2, 0.02]}
          size={[width + 2 * FRAME, FRAME]}
          colour={FRAME_HEX}
        />
        <Face at={[0, mid, 0.02]} size={[width, 0.04]} colour={FRAME_HEX} />
        <Face at={[0, mid, 0.02]} size={[0.04, tall]} colour={FRAME_HEX} />
        <Face
          at={[0, sill - FRAME / 2, 0.02]}
          size={[width + 2 * FRAME + 0.08, FRAME]}
          colour={FRAME_HEX}
          rough={0.5}
        />
      </group>
    </Inside>
  );
}

/** a doorway: its frame round the cut; a hinged leaf closed in it, a
    double door's two leaves, a sliding door's two panels, or nothing
    at all for a passage */
function Door({ r, o }: { r: RoomShape; o: Opening }) {
  const width = toMetres(o.width);
  const tall = Math.min(
    toMetres(OPENINGS.door.height),
    toMetres(r.height) - 0.1,
  );
  const [x, z] = placeOf(r, o);
  const yaw = yawOf(o.wall);
  const leaves =
    o.kind === "door"
      ? [{ x: 0, w: width, handle: width / 2 - 0.1 }]
      : o.kind === "double"
        ? [
            { x: -width / 4, w: width / 2, handle: width / 2 - 0.06 },
            { x: width / 4, w: width / 2, handle: -(width / 2 - 0.06) },
          ]
        : o.kind === "sliding"
          ? [
              { x: -width / 4, w: width / 2 + 0.02, handle: width / 2 - 0.08 },
              {
                x: width / 4,
                w: width / 2 + 0.02,
                handle: -(width / 2 - 0.08),
              },
            ]
          : [];
  return (
    <Inside normal={inward(o.wall)} always={o.join !== undefined}>
      <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
        {leaves.map((l, i) => (
          <group key={i}>
            <Face
              at={[
                l.x,
                tall / 2,
                o.kind === "sliding" ? 0.01 + i * 0.03 : 0.01,
              ]}
              size={[l.w, tall]}
              colour={DOOR_HEX}
              rough={0.55}
              both
            />
            {/* the handle, at hand height on the opening side */}
            <Face
              at={[
                l.x + l.handle,
                1.0,
                o.kind === "sliding" ? 0.02 + i * 0.03 : 0.02,
              ]}
              size={[0.12, 0.02]}
              colour="#9a948b"
              rough={0.3}
            />
          </group>
        ))}
        {[-1, 1].map((s) => (
          <Face
            key={s}
            at={[(s * (width + FRAME)) / 2, tall / 2, 0.02]}
            size={[FRAME, tall + FRAME]}
            colour={FRAME_HEX}
            both
          />
        ))}
        <Face
          at={[0, tall + FRAME / 2, 0.02]}
          size={[width + 2 * FRAME, FRAME]}
          colour={FRAME_HEX}
          both
        />
      </group>
    </Inside>
  );
}

export function RoomShell({
  r,
  walk,
  onWalkTo,
}: {
  r: RoomShape;
  /** inside, walking: the ceiling is overhead */
  walk: boolean;
  /** a click on the floor while walking: go there */
  onWalkTo: (x: number, z: number) => void;
}) {
  const w = toMetres(r.W);
  const d = toMetres(r.D);
  const h = toMetres(r.height);
  const shape = useMemo(() => floorShape(r.outline, w, d), [r.outline, w, d]);
  const map = useMemo(
    () => floorTexture(r.floor, r.floorHex),
    [r.floor, r.floorHex],
  );
  map.repeat.set(1 / TILE_M, 1 / TILE_M);
  const relief = reliefOf(map);
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (!walk) return;
          e.stopPropagation();
          onWalkTo(e.point.x, e.point.z);
        }}
      >
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          map={map}
          normalMap={relief.normalMap}
          normalScale={FLOOR_RELIEF}
          roughnessMap={relief.roughnessMap}
          roughness={ROUGHNESS[r.floor]}
        />
      </mesh>
      {edgesOf(r.outline).flatMap((e, i) =>
        runsOf(e, r.shared ?? []).map(({ e: run, both }, k) => (
          <WallRun
            key={`${i}-${k}`}
            e={run}
            w={w}
            d={d}
            h={h}
            wallHex={r.wallHex}
            holes={holesOf(r, run, h)}
            both={both}
          />
        )),
      )}
      {r.openings.map((o) =>
        isWindow(o) ? (
          <Window key={o.id} r={r} o={o} />
        ) : (
          <Door key={o.id} r={r} o={o} />
        ),
      )}
      {walk && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[1, -1, 1]}
          position={[0, h, 0]}
        >
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial
            color={CEILING_HEX}
            emissive={CEILING_HEX}
            emissiveIntensity={0.22}
            roughness={1}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

/** the soft light of a room: panels baked once into the surroundings,
    which every surface then reflects a little */
/** what lights the room from outside: the studio's own panels (a warm
    set in the evening), or a surroundings map, which the glass and the
    plywood then reflect; the sun and the room's own light stay */
export function RoomLight({ evening, sky }: { evening: boolean; sky: Sky }) {
  const warm = evening ? "#ffd9b8" : "#ffffff";
  if (sky !== "panels")
    return (
      <Environment
        files={`/sky/${sky}.hdr`}
        environmentIntensity={evening ? 1.2 : 1.5}
      />
    );
  return (
    <Environment resolution={128} frames={1} environmentIntensity={2}>
      <Lightformer
        form="rect"
        intensity={evening ? 2.2 : 3.4}
        color={warm}
        position={[0, 5, -4]}
        scale={[10, 5, 1]}
        target={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={evening ? 1.3 : 1.8}
        color={warm}
        position={[-7, 2.5, 0]}
        rotation-y={Math.PI / 2}
        scale={[7, 3, 1]}
      />
      <Lightformer
        form="ring"
        intensity={evening ? 0.8 : 1.1}
        color={warm}
        position={[5, 4, 5]}
        scale={3}
        target={[0, 0, 0]}
      />
    </Environment>
  );
}
