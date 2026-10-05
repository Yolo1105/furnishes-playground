"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useMemo } from "react";
import { DoubleSide, FrontSide, Path, Shape } from "three";
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
import { floorTexture, shade, TILE_M } from "./textures";

/**
 * The room itself in 3D: the floor in its finish, a wall along every
 * edge facing in (so the near walls are seen through and the far ones
 * stand), a skirting at their feet, the window with its frame, sill
 * and glass, the door in its frame, and a ceiling once you are inside
 * walking. The light comes from a few soft panels baked into the
 * surroundings, a sun from the window's side, and soft shadows under
 * everything on the floor. All in metres about the room's middle.
 */
const m = (mm: number) => mm / 1000;
const SKIRTING = 0.1;
const FRAME = 0.07;
const FRAME_HEX = "#f7f3ec";
const DOOR_HEX = "#cfae82";
const CEILING_HEX = "#f8f5f0";

const ROUGHNESS: Record<Floor, number> = {
  Vinyl: 0.7,
  Tiles: 0.35,
  Parquet: 0.6,
  Concrete: 0.9,
};

export type RoomShape = {
  W: number;
  D: number;
  outline: readonly Point[];
  openings: readonly Opening[];
  height: number;
  floor: Floor;
  floorHex: string;
  wallHex: string;
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
    const px = m(x) - w / 2;
    const py = -(m(y) - d / 2);
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
  const x = horizontal ? m(centre) : m(at);
  const z = horizontal ? m(at) : m(centre);
  return [x - m(r.W) / 2, z - m(r.D) / 2];
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
      const sill = isWindow(o) ? m(o.sill ?? OPENINGS.window.sill) : 0;
      const top = isWindow(o)
        ? Math.min(m(o.head ?? OPENINGS.window.head), h - 0.15)
        : Math.min(m(OPENINGS.door.height), h - 0.1);
      return {
        o,
        x: flip * m(c - mid),
        w: m(o.width),
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
}: {
  e: Edge;
  w: number;
  d: number;
  h: number;
  wallHex: string;
  holes: ReturnType<typeof holesOf>;
}) {
  const ax = m(e.a[0]) - w / 2;
  const az = m(e.a[1]) - d / 2;
  const bx = m(e.b[0]) - w / 2;
  const bz = m(e.b[1]) - d / 2;
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
    <group position={[(ax + bx) / 2, 0, (az + bz) / 2]} rotation={[0, yaw, 0]}>
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
  const width = m(o.width);
  const sill = m(o.sill ?? OPENINGS.window.sill);
  const head = Math.min(m(o.head ?? OPENINGS.window.head), m(r.height) - 0.15);
  const tall = head - sill;
  const mid = sill + tall / 2;
  const [x, z] = placeOf(r, o);
  const yaw = yawOf(o.wall);
  return (
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
  );
}

/** a doorway: its frame round the cut; a hinged leaf closed in it, a
    double door's two leaves, a sliding door's two panels, or nothing
    at all for a passage */
function Door({ r, o }: { r: RoomShape; o: Opening }) {
  const width = m(o.width);
  const tall = Math.min(m(OPENINGS.door.height), m(r.height) - 0.1);
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
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      {leaves.map((l, i) => (
        <group key={i}>
          <Face
            at={[l.x, tall / 2, o.kind === "sliding" ? 0.01 + i * 0.03 : 0.01]}
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
  const w = m(r.W);
  const d = m(r.D);
  const h = m(r.height);
  const shape = useMemo(() => floorShape(r.outline, w, d), [r.outline, w, d]);
  const map = useMemo(
    () => floorTexture(r.floor, r.floorHex),
    [r.floor, r.floorHex],
  );
  map.repeat.set(1 / TILE_M, 1 / TILE_M);
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
        <meshStandardMaterial map={map} roughness={ROUGHNESS[r.floor]} />
      </mesh>
      {edgesOf(r.outline).map((e, i) => (
        <WallRun
          key={i}
          e={e}
          w={w}
          d={d}
          h={h}
          wallHex={r.wallHex}
          holes={holesOf(r, e, h)}
        />
      ))}
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
export function RoomLight({ evening }: { evening: boolean }) {
  const warm = evening ? "#ffd9b8" : "#ffffff";
  return (
    <Environment resolution={128} frames={1} environmentIntensity={1.3}>
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
