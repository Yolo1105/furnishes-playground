"use client";

import { toMetres } from "@furnishes/scene";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  cameraPosition,
  float,
  mix,
  mx_fractal_noise_float,
  positionWorld,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { LIGHT_WOOD_HEX } from "./piece-detail";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
import { FLOOR_MATERIAL, repeated, tintOver, useMaterial } from "./materials";

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
/** a door's frame and architrave, m */
const FRAME = 0.07;
const FRAME_HEX = "#f7f3ec";
const DOOR_HEX = LIGHT_WOOD_HEX;
/** how strongly the floor's relief bends the light */
const FLOOR_RELIEF = new Vector2(0.5, 0.5);
/** how strongly the plaster's relief bends the light */
const PLASTER_RELIEF = new Vector2(0.35, 0.35);
const CEILING_HEX = "#f8f5f0";
/** how much light a ceiling has of its own: the room's bounce, which
    the lights from above cannot reach its underside with */
const CEILING_GLOW = 0.5;
/** how far inside the wall's outer face a window's outside stands, m */
const OUTSIDE_IN = 0.01;

/** the outside a window looks onto, by day and at dusk: the sky from
    its zenith to a hazy horizon, the sun, the ground, a line of trees;
    linear light, lit as a scene is against the room (the AgX tone
    mapping rolls the sun off) */
const OUTLOOK = {
  day: {
    zenith: [0.17, 0.36, 0.78],
    horizon: [0.72, 0.8, 0.9],
    sun: [1, 0.96, 0.88],
    cloud: [1, 1, 1],
    ground: [0.24, 0.32, 0.13],
    trees: [0.09, 0.15, 0.06],
    // daylight stands well above the room's light: the panes glow and
    // the tone mapping rolls them off, as a window photographs
    light: 3.2,
  },
  evening: {
    zenith: [0.14, 0.16, 0.36],
    horizon: [0.95, 0.52, 0.3],
    sun: [1, 0.7, 0.4],
    cloud: [0.95, 0.6, 0.45],
    ground: [0.09, 0.1, 0.06],
    trees: [0.045, 0.05, 0.035],
    light: 1.3,
  },
} as const;

/** the outside seen through a window, drawn in the shader along the
    eye's ray through the pane (so it turns as the room is looked
    round, as a view does, and is sharp at any size): the sky's
    gradient, the sun where the room's sun stands, clouds and a tree
    line from noise, the ground below the horizon; set in the opening
    behind the glass */
function Outside({
  evening,
  sun,
  width,
  tall,
  at,
}: {
  evening: boolean;
  /** where the room's sun stands, m about the room's middle */
  sun: Vector3Tuple;
  width: number;
  tall: number;
  at: [number, number, number];
}) {
  const look = evening ? OUTLOOK.evening : OUTLOOK.day;
  const invalidate = useThree((s) => s.invalidate);
  const sunDir = useMemo(() => uniform(new Vector3()), []);
  sunDir.value.set(...sun).normalize();
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial();
    const ray = positionWorld.sub(cameraPosition).normalize();
    const up = ray.y;
    // the sky, paler towards the horizon
    const haze = smoothstep(0.6, 0, up.max(0));
    const sky = mix(vec3(...look.zenith), vec3(...look.horizon), haze);
    // the sun: its disc and the glow about it
    const toSun = ray.dot(sunDir).max(0);
    const disc = smoothstep(0.9993, 0.9999, toSun);
    const glow = toSun.pow(48).mul(0.35);
    // clouds, drawn on a sheet above, fading into the haze
    const sheet = ray.xz.div(up.add(0.12)).mul(0.6);
    const cloud = smoothstep(
      0.08,
      0.55,
      mx_fractal_noise_float(sheet, 4, 2.2, 0.55).add(0.1),
    ).mul(smoothstep(0, 0.25, up));
    const heavens = mix(sky, vec3(...look.cloud), cloud.mul(0.9))
      .add(vec3(...look.sun).mul(glow))
      .add(
        vec3(...look.sun)
          .mul(disc)
          .mul(4),
      );
    // the ground, and a line of trees along the horizon
    const bearing = ray.x.atan(ray.z).mul(5);
    const treeTop = mx_fractal_noise_float(vec2(bearing, 0.5), 3, 2, 0.5)
      .mul(0.035)
      .add(0.045);
    const trees = smoothstep(treeTop, treeTop.sub(0.01), up);
    // the foliage: light and shade across the crowns, and the haze of
    // distance lifting the line towards the horizon's colour
    const leaf = mx_fractal_noise_float(
      vec2(bearing.mul(6), up.mul(80)),
      3,
      2,
      0.5,
    )
      .mul(0.5)
      .add(0.5);
    const foliage = mix(
      mix(vec3(...look.trees), vec3(...look.trees).mul(1.8), leaf),
      vec3(...look.horizon),
      0.22,
    );
    const ground = mix(
      vec3(...look.ground),
      vec3(...look.ground).mul(0.75),
      mx_fractal_noise_float(ray.xz.div(up.min(-0.01)).mul(0.3), 3)
        .mul(0.5)
        .add(0.5),
    );
    const below = smoothstep(0.002, -0.002, up);
    const land = mix(heavens, foliage, trees);
    m.colorNode = mix(land, ground, below).mul(float(look.light));
    m.side = DoubleSide;
    return m;
  }, [look, sunDir]);
  useEffect(() => {
    invalidate();
    return () => material.dispose();
  }, [material, invalidate]);
  return (
    <mesh position={at} material={material}>
      <planeGeometry args={[width, tall]} />
    </mesh>
  );
}
/** how much of the room a pane gives back */
const GLASS_OPACITY = 0.18;
/** the glass's own cast, the faint green of float glass */
const GLASS_HEX = "#eaf1ee";

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
  /** where the sun stands, m about the room's middle: the outside's */
  sun: Vector3Tuple;
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
  // the walls' plaster, its maps repeated by its stretch over the
  // solid's metres
  const plaster = useMaterial("plaster");
  const plasterMaps = repeated(plaster);
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
            color={plaster.photo ? tintOver(wallHex) : wallHex}
            map={plasterMaps.map}
            normalMap={plasterMaps.normalMap}
            normalScale={PLASTER_RELIEF}
            roughnessMap={plasterMaps.roughnessMap}
            roughness={0.92}
          />
        </mesh>
        {/* the skirting stands just proud of the wall's face, painted
            white as joinery is, so the wall's foot is drawn */}
        <mesh position={[0, SKIRTING / 2, 0.008]} receiveShadow castShadow>
          <boxGeometry args={[len, SKIRTING, 0.016]} />
          <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
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

/** a painted member of a window: a jamb, a rail, a mullion, a sill */
function Bar({
  at,
  size,
  rough = 0.4,
}: {
  at: [number, number, number];
  size: [number, number, number];
  rough?: number;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={FRAME_HEX} roughness={rough} />
    </mesh>
  );
}

/** the joinery of a window, m: the outer frame lining the opening,
    the sash within it, the bars that divide the panes, how deep the
    frame stands, and the sill board inside */
const WINDOW = {
  frame: 0.06,
  sash: 0.045,
  bar: 0.035,
  depth: 0.09,
  sillBoard: 0.035,
  sillOut: 0.06,
  architrave: 0.06,
};

/** a window with its joinery, in the opening the wall leaves: a frame
    lining the reveal towards the outer face, a sash within it divided
    into four panes by a mullion and a transom, the glass set in the
    sash with the room's faint reflection, an architrave round the
    opening on the inside and a sill board projecting into the room;
    the outside drawn behind the glass at the wall's outer face */
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
  const t = toMetres(r.thickness);
  // the frame's plane stands in the outer half of the wall
  const zf = -Math.max(t * 0.6, WINDOW.depth / 2 + 0.01);
  const { frame, sash, bar, depth, sillBoard, sillOut, architrave } = WINDOW;
  const iw = width - 2 * frame; // inside the frame
  const ih = tall - 2 * frame;
  const gw = iw - 2 * sash; // the glass
  const gh = ih - 2 * sash;
  const sashDepth = depth * 0.6;
  return (
    <Inside normal={inward(o.wall)} always={o.join !== undefined}>
      <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
        <Outside
          evening={r.evening}
          sun={r.sun}
          width={width}
          tall={tall}
          at={[0, mid, -t + OUTSIDE_IN]}
        />
        {/* the frame: two jambs, a head and a bottom rail */}
        {[-1, 1].map((s) => (
          <Bar
            key={`j${s}`}
            at={[s * (width / 2 - frame / 2), mid, zf]}
            size={[frame, tall, depth]}
          />
        ))}
        {[sill + frame / 2, head - frame / 2].map((y) => (
          <Bar key={`r${y}`} at={[0, y, zf]} size={[iw, frame, depth]} />
        ))}
        {/* the sash within the frame, and the bars dividing its panes */}
        {[-1, 1].map((s) => (
          <Bar
            key={`s${s}`}
            at={[s * (iw / 2 - sash / 2), mid, zf]}
            size={[sash, ih, sashDepth]}
          />
        ))}
        {[sill + frame + sash / 2, head - frame - sash / 2].map((y) => (
          <Bar key={`t${y}`} at={[0, y, zf]} size={[gw, sash, sashDepth]} />
        ))}
        <Bar at={[0, mid, zf]} size={[bar, gh, sashDepth]} />
        <Bar at={[0, mid, zf]} size={[gw, bar, sashDepth]} />
        {/* the glass, set in the sash */}
        <mesh position={[0, mid, zf]}>
          <planeGeometry args={[gw, gh]} />
          <meshPhysicalMaterial
            color={GLASS_HEX}
            transparent
            opacity={GLASS_OPACITY}
            roughness={0.03}
            metalness={0}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
        {/* the architrave round the opening on the inside */}
        {[-1, 1].map((s) => (
          <Bar
            key={`a${s}`}
            at={[s * (width / 2 + architrave / 2), mid + architrave / 2, 0.008]}
            size={[architrave, tall + architrave, 0.016]}
          />
        ))}
        <Bar
          at={[0, head + architrave / 2, 0.008]}
          size={[width + 2 * architrave, architrave, 0.016]}
        />
        {/* the sill board, from the frame into the room */}
        <Bar
          at={[0, sill - sillBoard / 2, (zf + sillOut) / 2]}
          size={[width + 2 * architrave + 0.04, sillBoard, sillOut - zf]}
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
  /** inside, walking: a click on the floor goes there */
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
  // the floor's material: a photographed set in its own colour with
  // the tone laid lightly over it, else the grown floor in the tone
  const floorMat = useMaterial(FLOOR_MATERIAL[r.floor], r.floorHex);
  const floorMaps = repeated(floorMat);
  const t = toMetres(r.thickness);
  // where the walls' outer faces meet, for the mitre at each edge's ends
  const mitres = useMemo(
    () => mitresOf(r.outline, r.thickness),
    [r.outline, r.thickness],
  );
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
          color={floorMat.photo ? tintOver(r.floorHex) : "#ffffff"}
          map={floorMaps.map}
          normalMap={floorMaps.normalMap}
          normalScale={FLOOR_RELIEF}
          roughnessMap={floorMaps.roughnessMap}
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
      {/* the ceiling: plain white over the outline, facing down, so it
          stands over an eye below it (the perspective, a walk) and not
          in the overhead views, which look in over the open top; lit a
          little of its own, as a ceiling is by the room's bounce */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, h, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial
          color={CEILING_HEX}
          emissive={CEILING_HEX}
          emissiveIntensity={CEILING_GLOW}
          roughness={1}
          side={FrontSide}
        />
      </mesh>
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
