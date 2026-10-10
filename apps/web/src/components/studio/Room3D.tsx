"use client";

import { devFlag } from "./dev-flags";
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
import {
  type ThreeEvent,
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useEvent } from "./use-event";
import { useRoom } from "./room-store";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EquirectangularReflectionMapping,
  FrontSide,
  type Group,
  type Mesh,
  type Object3D,
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
import {
  blocksOf,
  CAP,
  PLASTER,
  REVEAL,
  type Shading,
  wallTriangles,
} from "./wall-solid";
import { openingCentre } from "./room-health";
import type { Point } from "./room-templates";
import type { Sky } from "./studio-store";
import type { StillState } from "./capture";
import { FloorReflection, useFloorMaterial } from "./Reflection";
import { FLOOR_MATERIAL, repeated, tintOver, useMaterial } from "./materials";

/**
 * The room itself in 3D: the floor in its finish, a wall along every
 * edge built solid with its openings cut through, a skirting at its
 * foot and a cornice at its head, its reveals painted white and its
 * cut faces (the open top, and the section where a near wall is cut)
 * drawn as cuts, with a line; the window with its frame, sill and
 * glass, the door hung in its lining with its architrave, and a
 * ceiling once you are inside walking. A near wall is cut to waist
 * height while the camera looks in over it and goes when the camera
 * looks level, and either way it still shadows the room (it stays on
 * the sun's own layer), as does the ceiling, so the sun comes in by
 * the openings alone. The light comes from a few soft panels baked
 * into the surroundings, a sun from the window's side, and soft
 * shadows under everything on the floor. All in metres about the
 * room's middle.
 */
const SKIRTING = 0.1;
/** the cornice at the wall's head, m: a painted strip, as the
    skirting is, so the wall ends in a line */
const CORNICE = 0.06;
const FRAME_HEX = "#f7f3ec";
const DOOR_HEX = LIGHT_WOOD_HEX;
/** a door's parts, m: the leaf's thickness, the lining boards in the
    reveal, the architrave's width and how far it stands proud, the
    gap round the leaf, the threshold's height, and the lever */
const DOOR = {
  leaf: 0.04,
  lining: 0.028,
  architrave: 0.07,
  proud: 0.015,
  gap: 0.004,
  threshold: 0.012,
  lever: 0.12,
};
const METAL_HEX = "#9a948b";
const THRESHOLD_HEX = "#b9b2a7";
/** a switch plate and a double socket, m, white as the joinery */
const PLATE = { switch: 0.086, socket: 0.146, tall: 0.086, deep: 0.009 };
/** the cut faces of a wall (its open top, a sectioned near wall's
    top, its ends where a run stops): a neutral cap and a drawn line */
const CAP_HEX = "#d6cfc6";
const CAP_LINE_HEX = "#3d3833";
/** where a near wall is cut while the camera looks in over it, m */
const SECTION = 1.1;
/** the camera must look down at least this far, degrees, for a near
    wall to stand sectioned; nearer the level it goes altogether */
const SECTION_PITCH = 22;
/** the layer the sun's shadow sees that the camera does not: a near
    wall taken out of the picture, and the ceiling that keeps the sun
    out of the open top */
export const SHADOW_LAYER = 1;
/** the plaster's sheen: eggshell, so a window's light sweeps across a
    wall as a soft gloss (the roughness map lays its grain over it) */
const PLASTER_ROUGH = 0.72;
/** how strongly the floor's relief bends the light */
const FLOOR_RELIEF = new Vector2(0.5, 0.5);
/** how strongly the plaster's relief bends the light */
const PLASTER_RELIEF = new Vector2(0.35, 0.35);
const CEILING_HEX = "#f8f5f0";
/** how much light a ceiling has of its own: the room's bounce, which
    the lights from above cannot reach its underside with */
const CEILING_GLOW = 0.5;
/** the export's tags and names: a copy of the scene keeps what stands
    under the room's tag and names each part (scene-copy.ts) */
const ROOM_TAG = { export: "room" } as const;
const FLOOR_NAME = { name: "Floor" } as const;
const CEILING_NAME = { name: "Ceiling" } as const;
const WALL_NAME = { name: "Wall" } as const;
const SKIRTING_NAME = { name: "Skirting" } as const;
const CORNICE_NAME = { name: "Cornice" } as const;
// (each a constant: fiber reads a fresh object as a changed prop and
// asks for a frame, which would keep the picture from ever settling)
const SECTION_NAME = { name: "Wall section" } as const;
const SOCKET_NAME = { name: "Socket" } as const;
const LEAF_NAME = { name: "Door leaf" } as const;
const SWITCH_NAME = { name: "Switch" } as const;
const SUN_STOP_NAME = { name: "Sun stop", export: "helper" } as const;
const CUT_LINE_NAME = { name: "Cut line", export: "helper" } as const;
const WINDOW_NAME = { name: "Window" } as const;
const DOOR_NAME = { name: "Door" } as const;
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
  // the export's tag, kept while nothing in it changes: fiber reads a
  // fresh object as a changed prop and asks for another frame
  const tag = useMemo(
    () => ({ export: "outlook", outlook: { evening, sun } }),
    [evening, sun],
  );
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
    <mesh position={at} material={material} userData={tag}>
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
  /** the room's id: a wall or a doorway it shares answers to whichever
      of its two rooms is being worked on */
  id: string;
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
type Stretch = {
  wall: Wall;
  from: number;
  to: number;
  both: boolean;
  /** the room beyond the wall */
  other: string;
};

/** which side of a shared wall or doorway counts, read each frame: the
    side of the room being worked on (1 for this room, -1 for the room
    beyond), so the wall is that room's near or far wall; 0 when neither
    is, and it stands */
const sideOf = (room: string, other: string) => {
  const active = useRoom.getState().activeId;
  return active === room ? 1 : active === other ? -1 : 0;
};

/** a wall, a leaf or a pane shows only from inside its room, so a near
    wall never hides the room from the camera; one shared with the room
    beyond answers to whichever of the two rooms is being worked on (its
    near wall goes, its far wall stands), and stands when neither is.
    Read each frame from where the camera stands against the thing's
    inward normal */
function Inside({
  normal,
  shared,
  children,
}: {
  normal: readonly [number, number];
  /** a doorway shared with the room beyond: this room and that one */
  shared?: { room: string; other: string } | null | undefined;
  children: React.ReactNode;
}) {
  const group = useRef<Group>(null);
  const at = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const side = shared ? sideOf(shared.room, shared.other) : 1;
    if (side === 0) {
      g.visible = true;
      return;
    }
    g.getWorldPosition(at);
    const dot =
      (camera.position.x - at.x) * normal[0] +
      (camera.position.z - at.z) * normal[1];
    g.visible = side * dot > 0;
  });
  return <group ref={group}>{children}</group>;
}

/** an edge's wall as the runs this room builds: the whole edge, less
    the stretches another room builds, and split where a stretch is
    shared with a later room, since that run shows from both sides */
const runsOf = (
  e: Edge,
  shared: readonly Stretch[],
): { e: Edge; both: boolean; other?: string }[] => {
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
  const out: { e: Edge; both: boolean; other?: string }[] = [];
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
      ...(in_[0] ? { other: in_[0].other } : {}),
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

/** never under the pointer */
const noPick = () => null;

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
const holesOf = (
  r: Pick<RoomShape, "W" | "D" | "outline" | "openings">,
  e: Edge,
  h: number,
) => {
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

/** the shading of a wall's plaster by where a point is on it: the
    room's light falls off towards the floor, where the floor's tone
    bounces up into the lower metre; it eases off again at the head;
    and it darkens into the corners */
const shadingOf = (
  len: number,
  h: number,
  floorHex: string,
  outer: boolean,
): Shading => {
  const r = parseInt(floorHex.slice(1, 3), 16) / 255;
  const g = parseInt(floorHex.slice(3, 5), 16) / 255;
  const b = parseInt(floorHex.slice(5, 7), 16) / 255;
  // the floor's tone, well lightened: what it gives the wall's foot
  const tone = [0.6 + 0.4 * r, 0.6 + 0.4 * g, 0.6 + 0.4 * b] as const;
  const ease = (a: number, b_: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b_ - a)));
    return t * t * (3 - 2 * t);
  };
  return {
    grade: (x, y) => {
      const lift = 0.9 + 0.1 * ease(0, 1.3, y);
      const head = 1 - 0.05 * ease(h - 0.7, h, y);
      const corner = 0.9 + 0.1 * ease(0, 0.4, Math.min(x, len - x));
      const k = lift * head * corner;
      const foot = 0.5 * (1 - ease(0, 1.0, y));
      return [
        k * (1 - foot + foot * tone[0]),
        k * (1 - foot + foot * tone[1]),
        k * (1 - foot + foot * tone[2]),
      ];
    },
    xs: [0.2, 0.4, len - 0.4, len - 0.2],
    ys: [0.5, 1.0, 1.3, h - 0.7],
    outer,
  };
};

/** a wall's solid as a geometry: the faces grouped by material, the
    shading as vertex colours, and the cut faces' lines */
const wallGeometry = (
  len: number,
  height: number,
  t: number,
  mitres: readonly [number, number],
  holes: ReturnType<typeof holesOf>,
  shading: Shading,
) => {
  const blocks = blocksOf(
    len,
    height,
    holes.map((o) => ({
      x0: o.x - o.w / 2 + len / 2,
      x1: o.x + o.w / 2 + len / 2,
      y0: o.y0,
      y1: o.y1,
    })),
  );
  const tri = wallTriangles(
    blocks,
    len,
    t,
    mitres[0],
    mitres[1],
    -1,
    height,
    shading,
  );
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(tri.positions, 3));
  g.setAttribute("normal", new BufferAttribute(tri.normals, 3));
  g.setAttribute("uv", new BufferAttribute(tri.uvs, 2));
  g.setAttribute("color", new BufferAttribute(tri.colors, 3));
  for (const grp of tri.groups)
    g.addGroup(grp.start, grp.count, grp.materialIndex);
  const lines = new BufferGeometry();
  lines.setAttribute("position", new BufferAttribute(tri.capLines, 3));
  return { geometry: g, lines };
};

/** every mesh under an object put on one layer: the camera's (0) or
    the sun's own (SHADOW_LAYER), which the camera does not draw */
const layerOf = (root: Object3D, layer: number) =>
  root.traverse((o) => o.layers.set(layer));

function WallRun({
  e,
  w,
  d,
  h,
  t,
  mitres,
  wallHex,
  floorHex,
  holes,
  both = false,
  shared,
  socket = false,
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
  /** the floor's tone, which the wall's foot takes a little of */
  floorHex: string;
  holes: ReturnType<typeof holesOf>;
  /** shared with the room beyond: seen from both sides */
  both?: boolean;
  /** when shared, this room and the room beyond: the wall answers to
      whichever is being worked on */
  shared?: { room: string; other: string } | undefined;
  /** a double socket near the wall's start, for scale */
  socket?: boolean;
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
  const shading = useMemo(
    () => shadingOf(len, h, floorHex, both),
    [len, h, floorHex, both],
  );
  // the wall built solid, its openings cut through it, so a doorway is
  // a way through and a window a hole for the glass; the inside is +z.
  // Twice: at its height, and cut at waist height for when the camera
  // looks in over it as a near wall
  const full = useMemo(
    () => wallGeometry(len, h, t, mitres, holes, shading),
    [len, h, t, mitres, holes, shading],
  );
  const cut = useMemo(
    () =>
      h > SECTION + 0.2
        ? wallGeometry(len, SECTION, t, mitres, holes, shading)
        : null,
    [len, h, t, mitres, holes, shading],
  );
  useEffect(
    () => () => {
      full.geometry.dispose();
      full.lines.dispose();
      cut?.geometry.dispose();
      cut?.lines.dispose();
    },
    [full, cut],
  );
  // which stands: the full wall for the camera on its inner side (or a
  // shared wall), else the full wall for the sun alone and the cut one
  // for the camera while it looks down enough to see over it
  const fullRef = useRef<Group>(null);
  const cutRef = useRef<Group>(null);
  const state = useRef<"inside" | "cut" | "gone" | null>(null);
  const at = useMemo(() => new Vector3(), []);
  const dir = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const f = fullRef.current;
    const c = cutRef.current;
    if (!f) return;
    f.getWorldPosition(at);
    // a shared wall is the near or far wall of whichever of its rooms is
    // being worked on, and stands when neither is
    const side = shared ? sideOf(shared.room, shared.other) : 1;
    const dot =
      side *
      ((camera.position.x - at.x) * nx + (camera.position.z - at.z) * nz);
    camera.getWorldDirection(dir);
    const pitch =
      (-Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
    const next =
      side === 0 || dot > 0
        ? "inside"
        : c && pitch > SECTION_PITCH
          ? "cut"
          : "gone";
    if (next === state.current) return;
    state.current = next;
    layerOf(f, next === "inside" ? 0 : SHADOW_LAYER);
    if (c) c.visible = next === "cut";
  });
  const wallColour = plaster.photo ? tintOver(wallHex) : wallHex;
  const materials = (
    <>
      <meshStandardMaterial
        attach={`material-${PLASTER}`}
        color={wallColour}
        map={plasterMaps.map}
        normalMap={devFlag("noplaster") ? null : plasterMaps.normalMap}
        normalScale={PLASTER_RELIEF}
        roughnessMap={plasterMaps.roughnessMap}
        roughness={PLASTER_ROUGH}
        vertexColors
      />
      <meshStandardMaterial
        attach={`material-${REVEAL}`}
        color={FRAME_HEX}
        roughness={0.55}
      />
      <meshStandardMaterial
        attach={`material-${CAP}`}
        color={CAP_HEX}
        roughness={1}
      />
    </>
  );
  return (
    <group
      position={[(ax + bx) / 2, 0, (az + bz) / 2]}
      rotation={[0, yaw, 0]}
      userData={WALL_NAME}
    >
      <group ref={fullRef}>
        {/* the wall casts its shadow too: a low sun comes in through
            the openings alone and lays its patch on the floor */}
        <mesh
          geometry={full.geometry}
          position={[-len / 2, 0, 0]}
          receiveShadow
          castShadow
        >
          {materials}
        </mesh>
        <lineSegments
          geometry={full.lines}
          position={[-len / 2, 0, 0]}
          userData={CUT_LINE_NAME}
        >
          <lineBasicMaterial color={CAP_LINE_HEX} />
        </lineSegments>
        {/* the skirting and the cornice stand just proud of the wall's
            face, painted white as joinery is, so the wall's foot and
            its head are drawn */}
        <mesh
          position={[0, SKIRTING / 2, 0.008]}
          receiveShadow
          castShadow
          userData={SKIRTING_NAME}
        >
          <boxGeometry args={[len, SKIRTING, 0.016]} />
          <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
        </mesh>
        <mesh
          position={[0, h - CORNICE / 2, 0.006]}
          receiveShadow
          userData={CORNICE_NAME}
        >
          <boxGeometry args={[len, CORNICE, 0.012]} />
          <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
        </mesh>
        {socket && (
          <mesh
            position={[-len / 2 + 0.6, 0.3, PLATE.deep / 2]}
            receiveShadow
            userData={SOCKET_NAME}
          >
            <boxGeometry args={[PLATE.socket, PLATE.tall, PLATE.deep]} />
            <meshStandardMaterial color={FRAME_HEX} roughness={0.4} />
          </mesh>
        )}
      </group>
      {cut && (
        <group ref={cutRef} visible={false}>
          <mesh
            geometry={cut.geometry}
            position={[-len / 2, 0, 0]}
            receiveShadow
            userData={SECTION_NAME}
          >
            {materials}
          </mesh>
          <lineSegments
            geometry={cut.lines}
            position={[-len / 2, 0, 0]}
            userData={CUT_LINE_NAME}
          >
            <lineBasicMaterial color={CAP_LINE_HEX} />
          </lineSegments>
          <mesh position={[0, SKIRTING / 2, 0.008]} receiveShadow>
            <boxGeometry args={[len, SKIRTING, 0.016]} />
            <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
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
/** a doorway's two rooms, when it is shared: this one and the one the
    join leads to */
const useShared = (r: RoomShape, o: Opening) =>
  useRoom((s) => {
    const j = o.join ? s.joins.find((x) => x.id === o.join) : undefined;
    return j ? (j.a === r.id ? j.b : j.a) : null;
  });

function Window({ r, o }: { r: RoomShape; o: Opening }) {
  const other = useShared(r, o);
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
    <Inside
      normal={inward(o.wall)}
      shared={other ? { room: r.id, other } : null}
    >
      <group position={[x, 0, z]} rotation={[0, yaw, 0]} userData={WINDOW_NAME}>
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

/** a doorway: the lining boards in the reveal, the architrave round
    the opening on the room's side (both sides where two rooms share
    it), a threshold across the floor; and in it a hinged leaf closed,
    hung towards the room and a shade smaller than the lining all
    round, with its lever and rose at hand height; a double door's two
    leaves; a sliding door's two panels, one before the other; nothing
    at all in a passage. The leaf takes the wood set's grain. A switch
    plate stands beside the opening on the handle's side. */
function Door({ r, o }: { r: RoomShape; o: Opening }) {
  const other = useShared(r, o);
  const width = toMetres(o.width);
  const tall = Math.min(
    toMetres(OPENINGS.door.height),
    toMetres(r.height) - 0.1,
  );
  const [x, z] = placeOf(r, o);
  const yaw = yawOf(o.wall);
  const t = toMetres(r.thickness);
  const wood = useMaterial("wood");
  const woodMaps = repeated(wood);
  const { leaf, lining, architrave, proud, gap, threshold, lever } = DOOR;
  const sliding = o.kind === "sliding";
  const leaves =
    o.kind === "door"
      ? [{ x: 0, w: width, handle: width / 2 - 0.1 }]
      : o.kind === "double"
        ? [
            { x: -width / 4, w: width / 2, handle: width / 2 - 0.06 },
            { x: width / 4, w: width / 2, handle: -(width / 2 - 0.06) },
          ]
        : sliding
          ? [
              { x: -width / 4, w: width / 2 + 0.02, handle: width / 2 - 0.08 },
              {
                x: width / 4,
                w: width / 2 + 0.02,
                handle: -(width / 2 - 0.08),
              },
            ]
          : [];
  // the leaf hangs in the inner part of the reveal, a hand's width in
  const leafZ = -Math.min(t / 2, 0.06);
  const faces = o.join !== undefined ? [1, -1] : [1];
  const handleSide = leaves[0] ? Math.sign(leaves[0].handle) || 1 : 1;
  return (
    <Inside
      normal={inward(o.wall)}
      shared={other ? { room: r.id, other } : null}
    >
      <group position={[x, 0, z]} rotation={[0, yaw, 0]} userData={DOOR_NAME}>
        {leaves.map((l, i) => {
          const zl = sliding ? -0.02 - i * (leaf + 0.01) : leafZ;
          const front = zl + leaf / 2;
          return (
            <group key={i}>
              <mesh
                position={[l.x, (tall - gap) / 2, zl]}
                castShadow
                receiveShadow
                userData={LEAF_NAME}
              >
                <boxGeometry
                  args={[l.w - 2 * gap - 2 * lining, tall - gap, leaf]}
                />
                <meshStandardMaterial
                  color={wood.photo ? tintOver(DOOR_HEX) : DOOR_HEX}
                  map={woodMaps.map}
                  normalMap={woodMaps.normalMap}
                  roughnessMap={woodMaps.roughnessMap}
                  roughness={0.5}
                />
              </mesh>
              {/* the lever and its rose, at hand height on the opening
                  side, standing off the leaf's face */}
              <mesh
                position={[l.x + l.handle, 1.0, front + 0.004]}
                rotation={[Math.PI / 2, 0, 0]}
              >
                <cylinderGeometry args={[0.026, 0.026, 0.008, 24]} />
                <meshStandardMaterial
                  color={METAL_HEX}
                  roughness={0.3}
                  metalness={0.8}
                />
              </mesh>
              <mesh
                position={[
                  l.x + l.handle - (Math.sign(l.handle) * lever) / 2 + 0.01,
                  1.0,
                  front + 0.04,
                ]}
                castShadow
              >
                <boxGeometry args={[lever, 0.016, 0.016]} />
                <meshStandardMaterial
                  color={METAL_HEX}
                  roughness={0.3}
                  metalness={0.8}
                />
              </mesh>
            </group>
          );
        })}
        {/* the lining: two jambs and a head board in the reveal */}
        {[-1, 1].map((s) => (
          <mesh
            key={`l${s}`}
            position={[s * (width / 2 - lining / 2), tall / 2, -t / 2]}
            receiveShadow
          >
            <boxGeometry args={[lining, tall, t]} />
            <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, tall - lining / 2, -t / 2]} receiveShadow>
          <boxGeometry args={[width, lining, t]} />
          <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
        </mesh>
        {/* the threshold across the opening */}
        <mesh position={[0, threshold / 2, -t / 2]} receiveShadow>
          <boxGeometry args={[width, threshold, t + 0.02]} />
          <meshStandardMaterial color={THRESHOLD_HEX} roughness={0.6} />
        </mesh>
        {/* the architrave round the opening, standing proud of the face */}
        {faces.map((f) => {
          const zf = f > 0 ? proud / 2 : -t - proud / 2;
          return (
            <group key={f}>
              {[-1, 1].map((s) => (
                <mesh
                  key={`a${s}`}
                  position={[
                    s * (width / 2 + architrave / 2),
                    (tall + architrave) / 2,
                    zf,
                  ]}
                  castShadow
                  receiveShadow
                >
                  <boxGeometry args={[architrave, tall + architrave, proud]} />
                  <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
                </mesh>
              ))}
              <mesh
                position={[0, tall + architrave / 2, zf]}
                castShadow
                receiveShadow
              >
                <boxGeometry
                  args={[width + 2 * architrave, architrave, proud]}
                />
                <meshStandardMaterial color={FRAME_HEX} roughness={0.5} />
              </mesh>
            </group>
          );
        })}
        {/* the switch plate beside the door, on the handle's side */}
        {leaves.length > 0 && (
          <mesh
            position={[
              handleSide * (width / 2 + architrave + 0.1),
              1.2,
              PLATE.deep / 2,
            ]}
            receiveShadow
            userData={SWITCH_NAME}
          >
            <boxGeometry args={[PLATE.switch, PLATE.tall, PLATE.deep]} />
            <meshStandardMaterial color={FRAME_HEX} roughness={0.4} />
          </mesh>
        )}
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
  const sunStop = useRef<Mesh>(null);
  useLayoutEffect(() => {
    sunStop.current?.layers.set(SHADOW_LAYER);
  });
  const { material, target } = useFloorMaterial(w, h, d, reflection !== null);
  const shape = useMemo(() => floorShape(r.outline, w, d), [r.outline, w, d]);
  // the floor's material: a photographed set in its own colour with
  // the tone laid lightly over it, else the grown floor in the tone
  const floorMat = useMaterial(FLOOR_MATERIAL[r.floor], r.floorHex);
  const floorMaps = repeated(floorMat);
  const t = toMetres(r.thickness);
  // the wall runs with their mitres and holes, and which one carries
  // the room's socket (the first run long enough with nothing cut from
  // it): read once per shape, not per frame, since a wall's geometry is
  // rebuilt when these change and a rebuild asks for another frame
  const { W, D, outline, openings, thickness, shared } = r;
  const runs = useMemo(() => {
    const shape = { W, D, outline, openings };
    const mitres = mitresOf(outline, thickness);
    const out = edgesOf(outline).flatMap((e, i) =>
      runsOf(e, shared ?? []).map(({ e: run, both, other }, k) => ({
        run,
        both,
        other,
        key: `${i}-${k}`,
        mitres: runMitres(e, run, mitres[i]!),
        holes: holesOf(shape, run, h),
        socket: false,
      })),
    );
    const first = out.find(
      ({ run, holes }) =>
        holes.length === 0 &&
        Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1]) > 1500,
    );
    if (first) first.socket = true;
    return out;
  }, [W, D, outline, openings, thickness, shared, h]);
  const onFloorClick = useEvent((e: ThreeEvent<MouseEvent>) => {
    if (!walk) return;
    e.stopPropagation();
    onWalkTo(e.point.x, e.point.z);
  });
  return (
    <group userData={ROOM_TAG}>
      <mesh
        ref={floorMesh}
        userData={FLOOR_NAME}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={onFloorClick}
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
      {runs.map(({ run, both, other, key, mitres, holes, socket }) => (
        <WallRun
          key={key}
          e={run}
          w={w}
          d={d}
          h={h}
          t={t}
          mitres={mitres}
          wallHex={r.wallHex}
          floorHex={r.floorHex}
          holes={holes}
          both={both}
          shared={other ? { room: r.id, other } : undefined}
          socket={socket}
        />
      ))}
      {/* the sun's stop: the ceiling as the sun's shadow alone sees it
          (its own layer, never the camera's), so the sun comes in by
          the openings and not over the open top */}
      <mesh
        ref={sunStop}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, h - 0.001, 0]}
        castShadow
        raycast={noPick}
        userData={SUN_STOP_NAME}
      >
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial side={DoubleSide} />
      </mesh>
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
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, h, 0]}
        userData={CEILING_NAME}
      >
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
