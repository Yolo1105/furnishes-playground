"use client";

import { toMetres } from "@furnishes/scene";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { cameraPosition, equirectUV, positionWorld, texture } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { LIGHT_WOOD_HEX } from "./piece-detail";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EquirectangularReflectionMapping,
  FrontSide,
  type Group,
  type Mesh,
  type Scene,
  Shape,
  type Texture,
  Vector2,
  Vector3,
  type Vector3Tuple,
} from "three";
import {
  type Floor,
  isWindow,
  type Opening,
  OPENINGS,
  type Wall,
} from "./room-data";
import { edgesOf, outerOutline, type Edge } from "./room-geometry";
import { blocksOf, wallTriangles } from "./wall-solid";
import { openingCentre } from "./room-health";
import type { Point } from "./room-templates";
import type { Sky } from "./studio-store";
import type { StillState } from "./capture";
import { FloorReflection, useFloorMaterial } from "./Reflection";
import {
  floorTexture,
  PLASTER_M,
  plasterSurface,
  reliefOf,
  shade,
  TILE_M,
} from "./textures";

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
const FLOOR_RELIEF = new Vector2(0.5, 0.5);
/** how strongly the plaster's relief bends the light */
const PLASTER_RELIEF = new Vector2(0.35, 0.35);
/** the walls' plaster, its maps repeated by the metre */
const plaster = () => {
  const s = plasterSurface();
  for (const t of [s.map, s.normalMap, s.roughnessMap])
    if (t.repeat.x !== 1 / PLASTER_M)
      t.repeat.set(1 / PLASTER_M, 1 / PLASTER_M);
  return s;
};
const CEILING_HEX = "#f8f5f0";
/** how far inside the wall's outer face a window's outside stands, m */
const OUTSIDE_IN = 0.01;
/** what a window looks onto: a photograph of the outside (a park by
    day, Venice's sunset in the evening; public/sky, see its
    LICENSES.md), and how bright it stands against the room */
const OUTLOOK = {
  day: { file: "/sky/park.exr", light: 1.6 },
  evening: { file: "/sky/sunset.hdr", light: 1.1 },
} as const;

/** the outlook photographs, loaded once each and kept; loaded apart
    from the scene's own suspense, so a change of light never takes the
    room down while its outside arrives (the pane stands empty for the
    moment instead) */
const outlooks = new Map<string, Promise<Texture>>();
const outlookOf = (file: string) => {
  let p = outlooks.get(file);
  if (!p) {
    const loader = file.endsWith(".exr") ? new EXRLoader() : new HDRLoader();
    p = loader.loadAsync(file);
    outlooks.set(file, p);
  }
  return p;
};
const useOutlook = (file: string) => {
  const [map, setMap] = useState<{ file: string; map: Texture } | null>(null);
  useEffect(() => {
    let live = true;
    void outlookOf(file).then((m) => {
      if (live) setMap({ file, map: m });
    });
    return () => {
      live = false;
    };
  }, [file]);
  return map?.file === file ? map.map : null;
};

/** the outside seen through a window: the photograph sampled along
    the eye's ray through the pane, so it turns as the room is looked
    round, as a view does; set in the opening behind the glass */
function Outside({
  evening,
  width,
  tall,
  at,
}: {
  evening: boolean;
  width: number;
  tall: number;
  at: [number, number, number];
}) {
  const look = evening ? OUTLOOK.evening : OUTLOOK.day;
  const map = useOutlook(look.file);
  const invalidate = useThree((s) => s.invalidate);
  const material = useMemo(() => {
    if (!map) return null;
    const m = new MeshBasicNodeMaterial();
    const ray = positionWorld.sub(cameraPosition).normalize();
    m.colorNode = texture(map, equirectUV(ray)).mul(look.light);
    m.side = DoubleSide;
    return m;
  }, [map, look]);
  useEffect(() => {
    invalidate();
    return () => material?.dispose();
  }, [material, invalidate]);
  if (!material) return null;
  return (
    <mesh position={at} material={material}>
      <planeGeometry args={[width, tall]} />
    </mesh>
  );
}
/** how much of the room a pane gives back */
const GLASS_OPACITY = 0.12;

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
  /** the walls' thickness, mm */
  thickness: number;
  floor: Floor;
  floorHex: string;
  wallHex: string;
  /** the evening outside the windows */
  evening: boolean;
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

/** how far each edge's outer face runs past its inner face at the two
    ends, m: the outer corner points projected on the edge */
const mitresOf = (
  outline: readonly Point[],
  thickness: number,
): [number, number][] => {
  const outer = outerOutline(outline, thickness);
  const n = outline.length;
  return outline.map((a, i) => {
    const b = outline[(i + 1) % n]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const oa = outer[i]!;
    const ob = outer[(i + 1) % n]!;
    return [
      toMetres(-((oa[0] - a[0]) * ux + (oa[1] - a[1]) * uy)),
      toMetres((ob[0] - b[0]) * ux + (ob[1] - b[1]) * uy),
    ];
  });
};

/** a run's mitres: the edge's where the run reaches the edge's end,
    none where it stops along the wall */
const runMitres = (
  e: Edge,
  run: Edge,
  [a, b]: readonly [number, number],
): [number, number] => [
  run.a[0] === e.a[0] && run.a[1] === e.a[1] ? a : 0,
  run.b[0] === e.b[0] && run.b[1] === e.b[1] ? b : 0,
];

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
const placeOf = (
  r: Pick<RoomShape, "W" | "D" | "outline">,
  o: Opening,
): [number, number] => {
  const { centre, at } = openingCentre(r, o);
  const horizontal = o.wall === "north" || o.wall === "south";
  const x = horizontal ? toMetres(centre) : toMetres(at);
  const z = horizontal ? toMetres(at) : toMetres(centre);
  return [x - toMetres(r.W) / 2, z - toMetres(r.D) / 2];
};
/** where the sun stands to come in through the room's widest window:
    beyond that wall, `back` metres out and `height` up, shifted `aside`
    along the wall so its patch falls into the room at a slant; null
    for a room without a window */
export const windowSun = (
  r: Pick<RoomShape, "W" | "D" | "outline">,
  openings: readonly Opening[],
  height: number,
  back: number,
  aside: number,
): Vector3Tuple | null => {
  const window = openings.filter(isWindow).sort((a, b) => b.width - a.width)[0];
  if (!window) return null;
  const [x, z] = placeOf(r, window);
  const [nx, nz] = inward(window.wall);
  return [x - nx * back + nz * aside, height, z - nz * back - nx * aside];
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
  t,
  mitres,
  wallHex,
  holes,
  both = false,
}: {
  e: Edge;
  w: number;
  d: number;
  h: number;
  /** the wall's thickness, m */
  t: number;
  /** how far the outer face runs past the inner at each end, m: a
      thickness at a convex corner, minus one at a concave, nothing
      where the run ends along the wall */
  mitres: readonly [number, number];
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
  // the wall built solid, its openings cut through it, so a doorway is
  // a way through and a window a hole for the glass; the inside is +z
  const geometry = useMemo(() => {
    const blocks = blocksOf(
      len,
      h,
      holes.map((o) => ({
        x0: o.x - o.w / 2 + len / 2,
        x1: o.x + o.w / 2 + len / 2,
        y0: o.y0,
        y1: o.y1,
      })),
    );
    const { positions, normals, uvs } = wallTriangles(
      blocks,
      len,
      t,
      mitres[0],
      mitres[1],
      -1,
    );
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(positions, 3));
    g.setAttribute("normal", new BufferAttribute(normals, 3));
    g.setAttribute("uv", new BufferAttribute(uvs, 2));
    return g;
  }, [len, h, t, mitres, holes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <Inside normal={[nx, nz]} always={both}>
      <group
        position={[(ax + bx) / 2, 0, (az + bz) / 2]}
        rotation={[0, yaw, 0]}
      >
        {/* the wall casts its shadow too: a low sun comes in through the
            openings alone and lays its patch on the floor */}
        <mesh
          geometry={geometry}
          position={[-len / 2, 0, 0]}
          receiveShadow
          castShadow
        >
          <meshStandardMaterial
            color={wallHex}
            map={plaster().map}
            normalMap={plaster().normalMap}
            normalScale={PLASTER_RELIEF}
            roughnessMap={plaster().roughnessMap}
            roughness={0.92}
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
        emissiveIntensity={emissive ? 0.6 : 0}
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
        {/* the outside the glass looks onto, set in the opening at the
            wall's outer face so the reveal stands in front of it from
            an angle and nothing shows past the wall from outside; the
            glass itself clear, with the room's faint reflection; the
            frame, a transom, the sill */}
        <Outside
          evening={r.evening}
          width={width}
          tall={tall}
          at={[0, mid, -toMetres(r.thickness) + OUTSIDE_IN]}
        />
        <mesh position={[0, mid, 0.01]}>
          <planeGeometry args={[width, tall]} />
          <meshPhysicalMaterial
            color="#ffffff"
            transparent
            opacity={GLASS_OPACITY}
            roughness={0.05}
            metalness={0}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
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
  reflection,
}: {
  r: RoomShape;
  /** inside, walking: the ceiling is overhead */
  walk: boolean;
  /** a click on the floor while walking: go there */
  onWalkTo: (x: number, z: number) => void;
  /** what the floor reflects, when it does (a phone's floor does not):
      a change to the stamp takes the room's picture again, and the
      picture's state is reported */
  reflection: { stamp: string; onState: (state: StillState) => void } | null;
}) {
  const w = toMetres(r.W);
  const d = toMetres(r.D);
  const h = toMetres(r.height);
  const floorMesh = useRef<Mesh>(null);
  const { material, target } = useFloorMaterial(w, h, d, reflection !== null);
  const shape = useMemo(() => floorShape(r.outline, w, d), [r.outline, w, d]);
  const map = useMemo(
    () => floorTexture(r.floor, r.floorHex),
    [r.floor, r.floorHex],
  );
  const t = toMetres(r.thickness);
  // both outlooks fetched as the room opens, so a change of light finds
  // its outside ready
  useEffect(() => {
    void outlookOf(OUTLOOK.day.file);
    void outlookOf(OUTLOOK.evening.file);
  }, []);
  // where the walls' outer faces meet, for the mitre at each edge's ends
  const mitres = useMemo(
    () => mitresOf(r.outline, r.thickness),
    [r.outline, r.thickness],
  );
  map.repeat.set(1 / TILE_M, 1 / TILE_M);
  const relief = reliefOf(map);
  return (
    <group>
      <mesh
        ref={floorMesh}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          if (!walk) return;
          e.stopPropagation();
          onWalkTo(e.point.x, e.point.z);
        }}
      >
        <shapeGeometry args={[shape]} />
        <primitive
          object={material}
          attach="material"
          map={map}
          normalMap={relief.normalMap}
          normalScale={FLOOR_RELIEF}
          roughnessMap={relief.roughnessMap}
          roughness={ROUGHNESS[r.floor]}
        />
      </mesh>
      {reflection !== null && target && (
        <FloorReflection
          target={target}
          floor={floorMesh}
          h={h}
          stamp={reflection.stamp}
          onState={reflection.onState}
        />
      )}
      {edgesOf(r.outline).flatMap((e, i) =>
        runsOf(e, r.shared ?? []).map(({ e: run, both }, k) => (
          <WallRun
            key={`${i}-${k}`}
            e={run}
            w={w}
            d={d}
            h={h}
            t={t}
            mitres={runMitres(e, run, mitres[i]!)}
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

/** what lights the room from outside: the studio's own light panels
    (a warm set in the evening) or a surroundings map, every one a file
    under public/sky, which the glass and the plywood then reflect; the
    sun and the room's own lights stay. The map goes straight onto the
    scene (the renderer filters it itself) and stays cached once loaded,
    so a switch never lets go of a texture the renderer still holds. */
/** the map set as the scene's surroundings, filtered by the renderer */
const surround = (
  scene: Scene,
  map: Texture,
  intensity: number,
  invalidate: () => void,
) => {
  map.mapping = EquirectangularReflectionMapping;
  scene.environment = map;
  scene.environmentIntensity = intensity;
  invalidate();
  return () => {
    if (scene.environment === map) scene.environment = null;
  };
};
export function RoomLight({ evening, sky }: { evening: boolean; sky: Sky }) {
  const file = sky === "panels" ? (evening ? "panels-evening" : "panels") : sky;
  const map = useLoader(HDRLoader, `/sky/${file}.hdr`);
  const get = useThree((s) => s.get);
  // the surroundings carry the day; in the evening they stand back so
  // the low sun through the window carries the room
  const intensity =
    sky === "panels" ? (evening ? 0.2 : 0.35) : evening ? 0.25 : 0.4;
  useEffect(() => {
    const { scene, invalidate } = get();
    return surround(scene, map, intensity, invalidate);
  }, [map, get, intensity]);
  return null;
}
