"use client";

import { devFlag } from "./dev-flags";
import { inward, WINDOW_LIGHT } from "./window-light";
import { seedOf } from "./seed";
import { toMetres } from "@furnishes/scene";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  cameraPosition,
  float,
  mix,
  mx_fractal_noise_float,
  normalView,
  positionViewDirection,
  positionWorld,
  pow,
  smoothstep,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import {
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  type Node,
} from "three/webgpu";
import {
  type ThreeEvent,
  useFrame,
  useLoader,
  useThree,
} from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useEvent } from "./use-event";
import { ARCHITRAVE, architraveFor } from "./architrave";
import { HAND_MARKS, handMarks } from "./wear";
import { LAMP_BULB } from "./white-balance";
import { CURTAIN, curtainGeometry } from "./curtain";
import { cloth, type Finish, Mat, Rod, Soft, wood } from "./finish";
import { useRoom } from "./room-store";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EquirectangularReflectionMapping,
  FrontSide,
  type Group,
  type Mesh,
  type LineSegments,
  type Object3D,
  type Scene,
  Shape,
  ShapeGeometry,
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
  cornerEnd,
  PLASTER,
  REVEAL,
  type Shading,
  type WallEnd,
  wallTriangles,
} from "./wall-solid";
import { openingCentre } from "./room-health";
import type { Point } from "./room-templates";
import { type Sky, useStudio } from "./studio-store";
import type { StillState } from "./capture";
import {
  FloorReflection,
  useFloorMaterial,
  useRoomReflection,
} from "./Reflection";
import { layerOf, SHADOW_LAYER, wallsDown } from "./walls-standing";
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
/** the joinery's paint (skirting, cornice, linings, architraves, doors):
    semi-gloss, plainly glossier than the walls' matt, the sheen a real
    room's woodwork shows against its walls */
const JOINERY_ROUGH = 0.35;
/** a door's leaf: painted, as an HDB flat's are, a shade off its frame
    so the leaf reads against the architrave (the wood set's grain,
    stretched once over a two-metre leaf, read as a large wavy figure) */
const DOOR_HEX = "#ebe5da";
/** a laminate leaf's wood (the entrance's, by default) */
const LAMINATE_HEX = "#b48a62";
/** a door's parts, m: the leaf's thickness, the lining boards in the
    reveal, the architrave's width and how far it stands proud, the
    gap round the leaf, the threshold's height, and the lever */
const DOOR = {
  leaf: 0.04,
  /** the main door's leaf, thicker */
  entrance: 0.05,
  lining: 0.028,
  architrave: ARCHITRAVE.width,
  proud: ARCHITRAVE.thick,
  /** the gap round the leaf, its shadow line */
  gap: 0.0025,
  threshold: 0.012,
  /** the lever: its rose, its neck out from the leaf, its grip */
  rose: 0.025,
  neck: 0.05,
  grip: 0.12,
  /** the key's escutcheon below the lever, and the peephole's height */
  escutcheon: 0.016,
  keyBelow: 0.075,
  peephole: 1.5,
  /** the butt hinges: three, 100 mm, their knuckle's radius */
  hinge: 0.1,
  knuckle: 0.007,
  /** the floor stop where the leaf comes to rest open */
  stop: 0.014,
};
/** satin steel: the hinges, the lever, the escutcheon, the stop */
const STEEL: Finish = { colour: "#c4c2bd", rough: 0.3, metal: 0.85 };
const THRESHOLD_HEX = "#b9b2a7";
/** how far the cornice's top stands under the wall's cut, m */
const CORNICE_DROP = 0.003;
/** a gone wall's foot, m: the height its solid stays at */
const STUB_H = 0.12;
const STUB_NAME = { name: "Wall foot" } as const;
/** a switch plate, m, white as the joinery */
const PLATE = { switch: 0.086, tall: 0.086, deep: 0.009 };
/** the cut faces of a wall (its open top, its ends where a run stops):
    a neutral cap and a drawn line */
const CAP_HEX = "#d6cfc6";
/** the line round a wall's cut: a shade under the cut's own tone, so
    the cut reads as a section drawn in pencil, not boxed in black */
const CAP_LINE_HEX = "#b3a89b";
/** the plaster's sheen: eggshell, so a window's light sweeps across a
    wall as a soft gloss (the roughness map lays its grain over it) */
const PLASTER_ROUGH = 0.72;
/** how strongly the floor's relief bends the light */
const FLOOR_RELIEF = new Vector2(0.5, 0.5);
/** how strongly the plaster's relief bends the light */
const PLASTER_RELIEF = new Vector2(0.35, 0.35);
const CEILING_HEX = "#f8f5f0";
/** how much light a ceiling has of its own: a trace only. Its light
    is the bounce off the sunlit floor, which the probes carry; a
    ceiling that glows reads as the brightest surface in the room,
    where a photo's stands a little darker than its walls */
const CEILING_GLOW = 0.12;
/** how far under the walls' tops the ceiling stands, m: the tops' cut
    lines then lie just over it, hidden from below (at the same height
    they flickered through it as a dotted line along the cornice) */
const CEILING_DROP = 0.002;
/** the room's ceiling light: a flush round diffuser in the middle of
    the room's box, m, glowing a little by day and lit in the evening
    (a bare ceiling read as a set's) */
const LAMP = {
  radius: 0.2,
  drop: 0.025,
  day: 0.35,
  evening: 2.2,
  /** the housing's ring outside the diffuser */
  rim: 0.012,
  /** the diffuser's dome: a cap of a sphere this big, this wide an
      angle, so its edge is the diffuser's and it swells about 12 mm */
  dome: { r: 1.67, cap: Math.asin(0.2 / 1.67) },
};
const LAMP_HEX = "#fbf6ec";
const LAMP_RIM_HEX = "#f2f0eb";
/** where the ceiling light hangs: the middle of the room's box, m about
    the room's middle, for an outline in mm and the box `w` × `d` in m
    (Scene3D's light shines from there, under this diffuser) */
export const ceilingAt = (
  outline: readonly (readonly [number, number])[],
  w: number,
  d: number,
): [number, number] => {
  const mid = (v: number[]) => toMetres((Math.min(...v) + Math.max(...v)) / 2);
  return [
    mid(outline.map(([x]) => x)) - w / 2,
    mid(outline.map(([, y]) => y)) - d / 2,
  ];
};
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
    linear light, lit as a scene is against the room (the tone
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
/** a pane: the faint green of float glass, how much of the room it
    gives back, near smooth, seen from both sides, hiding nothing behind */
const GLASS = {
  color: "#eaf1ee",
  transparent: true,
  opacity: 0.18,
  roughness: 0.03,
  metalness: 0,
  depthWrite: false,
  side: DoubleSide,
} as const;
/** how much of the glass shows, by the angle it is seen at: almost
    clear looking straight through, more of a mirror at a grazing angle,
    as Fresnel has it for glass */
const GLASS_FRESNEL = { head: 0.05, grazing: 0.8, power: 5 };
/** the panes' glass, one material for every pane: its show by the angle
    it is seen at, reflecting the room where the room has its picture
    (Reflection.tsx), the surroundings elsewhere */
let glass: { of: Node | null; m: MeshPhysicalNodeMaterial } | null = null;
const glassOf = (room: Node | null) => {
  if (!glass || glass.of !== room) {
    glass?.m.dispose();
    const m = new MeshPhysicalNodeMaterial(GLASS);
    const facing = normalView.dot(positionViewDirection).abs();
    m.opacityNode = mix(
      float(GLASS_FRESNEL.head),
      float(GLASS_FRESNEL.grazing),
      pow(float(1).sub(facing), GLASS_FRESNEL.power),
    );
    if (room) m.envNode = room;
    glass = { of: room, m };
  }
  return glass.m;
};

const ROUGHNESS: Record<Floor, number> = {
  Vinyl: 0.7,
  Tiles: 0.35,
  // a matt lacquer: the roughness map takes this to about 0.36, so
  // the window lies in it as a broad soft streak (at 0.42, about 0.14,
  // the floor read as a polished sheet)
  Parquet: 1.1,
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
export const sideOf = (room: string, other: string) => {
  const active = useRoom.getState().activeId;
  return active === room ? 1 : active === other ? -1 : 0;
};

/** a wall, a leaf or a pane shows only from inside its room, so a near
    wall never hides the room from the camera; one shared with the room
    beyond answers to whichever of the two rooms is being worked on (its
    near wall goes, its far wall stands), and stands when neither is.
    Read each frame from where the camera stands against the thing's
    inward normal, measured from the thing itself (its position is this
    group's): measured from the room's middle, a window vanished once the
    walker passed the middle towards it */
function Inside({
  normal,
  shared,
  position,
  children,
}: {
  normal: readonly [number, number];
  /** where the thing stands in the room */
  position: readonly [number, number, number];
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
  return (
    <group ref={group} position={position as [number, number, number]}>
      {children}
    </group>
  );
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

/** a wall's corner at one end: how far a mitred outer face would run
    past the inner there, and whether this wall takes the corner */
type Corner = { mitre: number; owner: boolean };

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

/** where a run stops along its wall, meeting the next run, rather than
    at the wall's end */
const jointsOf = (e: Edge, run: Edge): [boolean, boolean] => [
  run.a[0] !== e.a[0] || run.a[1] !== e.a[1],
  run.b[0] !== e.b[0] || run.b[1] !== e.b[1],
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

/** how far a room's floor may start into its tile, across and along,
    m: a few metres, past a board's length and a tile's run */
const TILE_SPREAD = [7.3, 5.9] as const;
/** where in its tile a room's floor starts, m: read from its id, the
    same every time */
const tileOffset = (id: string): [number, number] => {
  const n = seedOf(id);
  // two near-independent fractions of the seed (two primes' remainders)
  return [
    ((n % 997) / 997) * TILE_SPREAD[0],
    (((n >>> 10) % 991) / 991) * TILE_SPREAD[1],
  ];
};

/** a wall's turn so its face points into the room */
export const yawOf = (wall: Wall) =>
  wall === "north"
    ? 0
    : wall === "south"
      ? Math.PI
      : wall === "west"
        ? Math.PI / 2
        : -Math.PI / 2;

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
  ends: readonly [WallEnd, WallEnd],
  holes: ReturnType<typeof holesOf>,
  shading: Shading,
  joints: readonly [boolean, boolean],
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
  const tri = wallTriangles(blocks, len, t, ends, -1, height, shading, joints);
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

/** whether each wall run stands or is down to its foot, by its id:
    a wall whose corner neighbour is down shows its end there whole
    (its top's edges drawn round the corner it now stands alone at) */
const wallStates = new Map<string, "inside" | "gone">();

function WallRun({
  id,
  ends,
  e,
  w,
  d,
  h,
  t,
  corners,
  joints,
  wallHex,
  floorHex,
  holes,
  both = false,
  shared,
}: {
  /** the run's id among every room's walls */
  id: string;
  /** the runs met at its convex corners, at its start and its end */
  ends: readonly [string | null, string | null];
  e: Edge;
  w: number;
  d: number;
  h: number;
  /** the wall's thickness, m */
  t: number;
  /** the corner at each end: how far a mitred outer face would run
      past the inner (a thickness at a convex corner, minus one at a
      concave, nothing where the run ends along the wall), and whether
      this run takes the corner's square (cornerEnd) */
  corners: readonly [Corner, Corner];
  /** where the run meets the next run of its wall, at its start and its
      end, rather than a corner */
  joints: readonly [boolean, boolean];
  wallHex: string;
  /** the floor's tone, which the wall's foot takes a little of */
  floorHex: string;
  holes: ReturnType<typeof holesOf>;
  /** shared with the room beyond: seen from both sides */
  both?: boolean;
  /** when shared, this room and the room beyond: the wall answers to
      whichever is being worked on */
  shared?: { room: string; other: string } | undefined;
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
  // a way through and a window a hole for the glass; the inside is +z
  // and with an end shown whole where the corner's other wall is down:
  // made the first time it is asked for, four at most
  const variants = useMemo(() => {
    const made = new Map<string, ReturnType<typeof wallGeometry>>();
    return {
      get: (openA: boolean, openB: boolean) => {
        const k = `${openA}-${openB}`;
        let g = made.get(k);
        if (!g) {
          g = wallGeometry(
            len,
            h,
            t,
            [
              cornerEnd(corners[0].mitre, corners[0].owner, openA),
              cornerEnd(corners[1].mitre, corners[1].owner, openB),
            ],
            holes,
            shading,
            joints,
          );
          made.set(k, g);
        }
        return g;
      },
      made,
    };
  }, [len, h, t, corners, holes, shading, joints]);
  const full = variants.get(false, false);
  useEffect(
    () => () => {
      for (const g of variants.made.values()) {
        g.geometry.dispose();
        g.lines.dispose();
      }
    },
    [variants],
  );
  const fullMesh = useRef<Mesh>(null);
  const fullLines = useRef<LineSegments>(null);
  const squared = useRef("false-false");
  // where the wall has gone from the picture, its foot stays: the solid
  // a hand's height tall, its doorways open and its cut on top, so the
  // flat still reads as a plan of its rooms and not boxes with gaps
  const stub = useMemo(
    () =>
      wallGeometry(
        len,
        STUB_H,
        t,
        [
          cornerEnd(corners[0].mitre, corners[0].owner),
          cornerEnd(corners[1].mitre, corners[1].owner),
        ],
        holes
          .filter((o) => o.y0 < STUB_H)
          .map((o) => ({ ...o, y1: Math.min(o.y1, STUB_H) })),
        shadingOf(len, STUB_H, floorHex, both),
        joints,
      ),
    [len, t, corners, holes, floorHex, both, joints],
  );
  useEffect(
    () => () => {
      stub.geometry.dispose();
      stub.lines.dispose();
    },
    [stub],
  );
  const stubRef = useRef<Group>(null);
  // which stands: the whole wall for the camera on its inner side (or a
  // shared wall); a near wall, between the camera and the room, goes
  // whole from the picture (the sun still sees it, for its shadow): a
  // wall stands at its height or not at all, never cut part way
  const fullRef = useRef<Group>(null);
  const state = useRef<"inside" | "gone" | null>(null);
  const at = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      wallStates.delete(id);
      wallsDown.delete(id);
    },
    [id],
  );
  useFrame(({ camera, invalidate }) => {
    const f = fullRef.current;
    if (!f) return;
    f.getWorldPosition(at);
    // a shared wall is the near or far wall of whichever of its rooms is
    // being worked on, and stands when neither is
    const side = shared ? sideOf(shared.room, shared.other) : 1;
    const dot =
      side *
      ((camera.position.x - at.x) * nx + (camera.position.z - at.z) * nz);
    const next = side === 0 || dot > 0 ? "inside" : "gone";
    wallStates.set(id, next);
    if (next !== state.current) {
      state.current = next;
      layerOf(f, next === "inside" ? 0 : SHADOW_LAYER);
      if (next === "gone") wallsDown.set(id, f);
      else wallsDown.delete(id);
      if (stubRef.current) stubRef.current.visible = next === "gone";
      // a frame more, for the walls beside it to square their ends
      invalidate();
    }
    // standing, its end shown whole where the corner's other wall is
    // down; down, its foot keeps its corner and fills it low
    const down = (n: string | null) =>
      next === "inside" && n !== null && wallStates.get(n) === "gone";
    const a = down(ends[0]);
    const b = down(ends[1]);
    const k = `${a}-${b}`;
    if (k === squared.current) return;
    squared.current = k;
    const g = variants.get(a, b);
    if (fullMesh.current) fullMesh.current.geometry = g.geometry;
    if (fullLines.current) fullLines.current.geometry = g.lines;
    invalidate();
  });
  const wallColour = plaster.photo ? tintOver(wallHex) : wallHex;
  // the faces stand a hair behind their own cut lines: a line on a face
  // fought it for depth and flickered into dashes as the camera moved
  const behind = {
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  } as const;
  const materials = (
    <>
      <meshStandardMaterial
        {...behind}
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
        {...behind}
        attach={`material-${REVEAL}`}
        color={FRAME_HEX}
        roughness={0.55}
      />
      <meshStandardMaterial
        {...behind}
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
          ref={fullMesh}
          geometry={full.geometry}
          position={[-len / 2, 0, 0]}
          receiveShadow
          castShadow
        >
          {materials}
        </mesh>
        <lineSegments
          ref={fullLines}
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
          <meshStandardMaterial color={FRAME_HEX} roughness={JOINERY_ROUGH} />
        </mesh>
        {!devFlag("nocornice") && (
          <mesh
            // its top a few mm under the wall's cut: flush with it, the
            // cut's line along the inner edge flickered into dashes
            position={[0, h - CORNICE / 2 - CORNICE_DROP, 0.006]}
            receiveShadow
            userData={CORNICE_NAME}
          >
            <boxGeometry args={[len, CORNICE, 0.012]} />
            <meshStandardMaterial color={FRAME_HEX} roughness={JOINERY_ROUGH} />
          </mesh>
        )}
      </group>
      <group ref={stubRef} visible={false} userData={STUB_NAME}>
        <mesh
          geometry={stub.geometry}
          position={[-len / 2, 0, 0]}
          receiveShadow
          raycast={noPick}
        >
          {materials}
        </mesh>
        <lineSegments geometry={stub.lines} position={[-len / 2, 0, 0]}>
          <lineBasicMaterial color={CAP_LINE_HEX} />
        </lineSegments>
      </group>
    </group>
  );
}

/** a member of a window in its finish: the aluminium, the gasket, the
    hardware */
function Member({
  at,
  size,
  f,
}: {
  at: [number, number, number];
  size: [number, number, number];
  f: Finish;
}) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Mat f={f} />
    </mesh>
  );
}

/** the joinery of a window, m: the outer frame lining the opening,
    the sash within it, the bars that divide the panes, how deep the
    frame stands, and the sill board inside */
const WINDOW = {
  /** the outer frame's face and depth; the sash's face, depth and how
      far it steps in from the frame towards the room */
  frame: 0.055,
  depth: 0.07,
  sash: 0.045,
  sashDepth: 0.05,
  step: 0.012,
  /** the meeting stiles' bar between the two casements */
  bar: 0.04,
  /** the rubber gasket round the glass, its face and depth */
  gasket: 0.004,
  /** the glass's thickness: its two faces each reflect */
  glass: 0.006,
  /** the green of the glass at its edges, and how wide it shows */
  edge: 0.006,
  /** the inside sill: its thickness, how far it overhangs the wall, and
      the round of its front edge */
  sill: 0.025,
  overhang: 0.025,
  sillRound: 0.007,
  /** the plaster's round where the reveal meets the wall's face */
  bead: 0.006,
};
/** the frame and sash: powder-coated aluminium, satin, never a mirror
    (a plain finish takes the plaster's faint stipple, finish.tsx); the
    gasket's black rubber; the hardware's satin steel; the sill's stone */
const ALU: Finish = { colour: "#eeede9", rough: 0.35 };
const GASKET: Finish = { colour: "#2b2b2a", rough: 0.75 };
const HARDWARE: Finish = { colour: "#c9c7c2", rough: 0.3, metal: 0.85 };
const SILL_STONE: Finish = { colour: "#e7e2d8", rough: 0.45, coat: 0.2 };
const GLASS_EDGE = "#4f6f62";

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

/** a window's curtains, in a room that is not tiled (a kitchen's or a
    bathroom's window has none): a sheer drawn across the glass, which
    the day comes through as a glow, and two panels drawn back over the
    frame's sides, on a rail just under the ceiling; all of it ends a
    little under the sill, so whatever stands against the wall below the
    window (a desk, a sofa's back) stands clear of it, and the panels
    keep within the window's width, clear of a cabinet beside it */
const CURTAIN_HEX = "#e3d9ca";
const SHEER_HEX = "#f6f3ee";
const SHEER_OPACITY = 0.55;
/** a drawn-back panel's width, m: a share of the window's, within
    bounds; how far it reaches over the frame's side; how far below the
    sill the cloth ends, and the least it stays off the floor; and how
    far behind the panels the sheer hangs */
const PANEL = {
  share: 0.2,
  least: 0.28,
  most: 0.5,
  over: 0.04,
  below: 0.08,
  floor: 0.05,
  sheer: 0.03,
};
/** the rail: how far it stands over the window's head and under the
    ceiling, and off the wall; its section; how far it runs past the
    window each side, m */
const RAIL = { over: 0.15, under: 0.06, off: 0.07, size: 0.022, past: 0.08 };
/** how much of the window's light comes through the sheer as its own
    glow, by day and in the evening (the voile lit from behind) */
const SHEER_GLOW = { day: 0.55, evening: 0.04 };
function Curtains({
  width,
  sill,
  head,
  height,
  seed,
  evening,
}: {
  width: number;
  sill: number;
  head: number;
  /** the room's height, m */
  height: number;
  /** each window's panels hang their own way */
  seed: number;
  evening: boolean;
}) {
  const rail = Math.min(head + RAIL.over, height - RAIL.under);
  const drop = rail - Math.max(PANEL.floor, sill - PANEL.below);
  const panel = Math.min(
    PANEL.most,
    Math.max(PANEL.least, width * PANEL.share),
  );
  const geometry = useMemo(
    () => ({
      left: curtainGeometry(panel, drop, CURTAIN.fold, CURTAIN.pitch, seed),
      right: curtainGeometry(
        panel,
        drop,
        CURTAIN.fold,
        CURTAIN.pitch,
        seed + 7,
      ),
      sheer: curtainGeometry(
        width,
        drop,
        CURTAIN.sheerFold,
        CURTAIN.sheerPitch,
        seed + 13,
        1,
      ),
    }),
    [panel, width, drop, seed],
  );
  useEffect(
    () => () => {
      geometry.left.dispose();
      geometry.right.dispose();
      geometry.sheer.dispose();
    },
    [geometry],
  );
  return (
    <group position={[0, rail, RAIL.off]}>
      <mesh
        geometry={geometry.sheer}
        position={[0, 0, -PANEL.sheer]}
        raycast={noPick}
      >
        {/* the voile: the outside through it softly, and glowing with
            the window's light behind it, never a grey stripe */}
        <meshStandardMaterial
          color={SHEER_HEX}
          emissive={WINDOW_LIGHT.day.colour}
          emissiveIntensity={evening ? SHEER_GLOW.evening : SHEER_GLOW.day}
          roughness={0.9}
          transparent
          opacity={SHEER_OPACITY}
          depthWrite={false}
          side={DoubleSide}
          vertexColors
        />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          geometry={s < 0 ? geometry.left : geometry.right}
          position={[s * (width / 2 - panel / 2 + PANEL.over), 0, 0]}
          castShadow
          receiveShadow
          raycast={noPick}
        >
          <Mat f={cloth(CURTAIN_HEX)} banded />
        </mesh>
      ))}
      {/* the rod and its end caps */}
      <Rod
        f={HARDWARE}
        at={[0, RAIL.size, 0]}
        r={RAIL.size / 2}
        h={width + 2 * RAIL.past}
        rotation={[0, 0, Math.PI / 2]}
      />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + RAIL.past), RAIL.size, 0]}>
          <sphereGeometry args={[RAIL.size * 0.9, 16, 12]} />
          <Mat f={HARDWARE} />
        </mesh>
      ))}
    </group>
  );
}

function Window({ r, o }: { r: RoomShape; o: Opening }) {
  const room = useRoomReflection((s) => s.node);
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
  const { frame, depth, sash, sashDepth, step, gasket, edge } = WINDOW;
  const iw = width - 2 * frame; // inside the frame
  const ih = tall - 2 * frame;
  // two casements meeting in the middle, each hung on its outer side
  const cw = iw / 2;
  const gw = cw - 2 * sash; // a casement's glass
  const gh = ih - 2 * sash;
  // the sash's plane: stepped in behind the frame's room-side face
  const zs = zf + depth / 2 - step - sashDepth / 2;
  const glassAt = zs;
  const plaster: Finish = { colour: r.wallHex, rough: 0.85 };
  return (
    <Inside
      normal={inward(o.wall)}
      shared={other ? { room: r.id, other } : null}
      position={[x, 0, z]}
    >
      <group rotation={[0, yaw, 0]} userData={WINDOW_NAME}>
        <Outside
          evening={r.evening}
          sun={r.sun}
          width={width}
          tall={tall}
          at={[0, mid, -t + OUTSIDE_IN]}
        />
        {/* the frame: two jambs, a head and a bottom rail, mitred at
            the corners as the profile is (the rails run between the
            jambs) */}
        {[-1, 1].map((s) => (
          <Member
            key={`j${s}`}
            at={[s * (width / 2 - frame / 2), mid, zf]}
            size={[frame, tall, depth]}
            f={ALU}
          />
        ))}
        {[sill + frame / 2, head - frame / 2].map((y) => (
          <Member
            key={`r${y}`}
            at={[0, y, zf]}
            size={[iw, frame, depth]}
            f={ALU}
          />
        ))}
        {[-1, 1].map((s) => {
          const cx = (s * iw) / 4;
          return (
            <group key={`c${s}`}>
              {/* the casement's sash: its outer stile (the hinge side),
                  its meeting stile, its rails */}
              {[-1, 1].map((e) => (
                <Member
                  key={`st${e}`}
                  at={[cx + e * (cw / 2 - sash / 2), mid, zs]}
                  size={[sash, ih, sashDepth]}
                  f={ALU}
                />
              ))}
              {[sill + frame + sash / 2, head - frame - sash / 2].map((y) => (
                <Member
                  key={`sr${y}`}
                  at={[cx, y, zs]}
                  size={[gw, sash, sashDepth]}
                  f={ALU}
                />
              ))}
              {/* the glass's two faces: each reflects, so the room's
                  reflection doubles faintly */}
              {[-1, 1].map((g) => (
                <mesh
                  key={`g${g}`}
                  position={[cx, mid, glassAt + (g * WINDOW.glass) / 2]}
                >
                  <planeGeometry args={[gw, gh]} />
                  <primitive
                    object={glassOf(room)}
                    attach="material"
                    dispose={null}
                  />
                </mesh>
              ))}
              {/* the glass's green at its edges, where its body is seen
                  edge-on through the gasket */}
              {[
                [cx, mid + gh / 2 - edge / 2, gw, edge],
                [cx, mid - gh / 2 + edge / 2, gw, edge],
                [cx - gw / 2 + edge / 2, mid, edge, gh],
                [cx + gw / 2 - edge / 2, mid, edge, gh],
              ].map(([ex, ey, ew, eh], k) => (
                <mesh
                  key={`e${k}`}
                  position={[ex!, ey!, glassAt]}
                  raycast={noPick}
                >
                  <planeGeometry args={[ew!, eh!]} />
                  <meshStandardMaterial
                    color={GLASS_EDGE}
                    transparent
                    opacity={0.45}
                    roughness={0.1}
                    depthWrite={false}
                    side={DoubleSide}
                  />
                </mesh>
              ))}
              {/* the gasket: a thin black line where the glass meets
                  the sash, on the room's side */}
              {[
                [cx, mid + gh / 2, gw, gasket],
                [cx, mid - gh / 2, gw, gasket],
                [cx - gw / 2, mid, gasket, gh],
                [cx + gw / 2, mid, gasket, gh],
              ].map(([gx, gy, ww, hh], k) => (
                <Member
                  key={`k${k}`}
                  at={[gx!, gy!, glassAt + WINDOW.glass / 2 + gasket / 2]}
                  size={[ww!, hh!, gasket]}
                  f={GASKET}
                />
              ))}
              {/* the hinges on the outer stile, the hinge side read */}
              {[sill + frame + 0.14, head - frame - 0.14].map((y) => (
                <Rod
                  key={`h${y}`}
                  f={HARDWARE}
                  at={[cx + s * (cw / 2), y, zs + sashDepth / 2 + 0.004]}
                  r={0.006}
                  h={0.05}
                />
              ))}
              {/* the casement handle on the meeting stile: a plate and
                  its lever hanging down, closed */}
              <Member
                at={[
                  cx - s * (cw / 2 - sash / 2),
                  mid,
                  zs + sashDepth / 2 + 0.003,
                ]}
                size={[0.026, 0.07, 0.006]}
                f={HARDWARE}
              />
              <Rod
                f={HARDWARE}
                at={[
                  cx - s * (cw / 2 - sash / 2),
                  mid - 0.05,
                  zs + sashDepth / 2 + 0.02,
                ]}
                r={0.006}
                h={0.1}
              />
            </group>
          );
        })}
        {/* the plaster's round where the reveal turns onto the wall */}
        {[-1, 1].map((s) => (
          <Rod
            key={`b${s}`}
            f={plaster}
            at={[s * (width / 2), mid, 0]}
            r={WINDOW.bead}
            h={tall}
          />
        ))}
        <Rod
          f={plaster}
          at={[0, head, 0]}
          r={WINDOW.bead}
          h={width}
          rotation={[0, 0, Math.PI / 2]}
        />
        {r.floor !== "Tiles" && (
          <Curtains
            width={width}
            sill={sill}
            head={head}
            height={toMetres(r.height)}
            seed={seedOf(o.id)}
            evening={r.evening}
          />
        )}
        {/* the sill: stone, from the frame out past the wall's face,
            its front edge rounded, a little wider than the opening */}
        <Soft
          f={SILL_STONE}
          at={[
            0,
            sill - WINDOW.sill / 2,
            (WINDOW.overhang + zf + depth / 2) / 2,
          ]}
          dims={[width + 0.05, WINDOW.sill, WINDOW.overhang - zf - depth / 2]}
          radius={WINDOW.sillRound}
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
    at all in a passage. The leaf is painted. A click on a leaf opens
    it (a hinged one swings into the room, the front sliding panel runs
    over the other) and another shuts it. A switch plate stands beside
    the opening on the handle's side. */
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
  const { lining, architrave, threshold } = DOOR;
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
  // a click on a leaf opens it, another shuts it; a doorway shared by
  // two rooms is known by its join, a room's own by room and opening
  const key = o.join ?? `${r.id}:${o.id}`;
  const open = useStudio((s) => !!s.doorsOpen[key]);
  const toggleDoor = useStudio((s) => s.toggleDoor);
  const toggle = useEvent(() => toggleDoor(key));
  // shared by every doorway of the size (architrave.ts keeps them)
  const moulding = architraveFor(width, tall);
  // the way in: a door of the flat's own, not between two of its rooms,
  // with its thicker leaf, its peephole and a laminate face
  const entrance = o.join === undefined;
  const leafFinish: Finish =
    (o.leaf ?? (entrance ? "laminate" : "paint")) === "laminate"
      ? wood(LAMINATE_HEX)
      : { colour: DOOR_HEX, rough: JOINERY_ROUGH };
  const ajar = Math.min(1, ((o.ajar ?? 0) * Math.PI) / 180 / SWING);
  return (
    <Inside
      normal={inward(o.wall)}
      shared={other ? { room: r.id, other } : null}
      position={[x, 0, z]}
    >
      <group rotation={[0, yaw, 0]} userData={DOOR_NAME}>
        {leaves.map((l, i) => (
          <DoorLeaf
            key={i}
            l={l}
            i={i}
            tall={tall}
            sliding={sliding}
            leafZ={leafZ}
            travel={width / 2}
            open={open}
            ajar={ajar}
            thick={entrance && !sliding ? DOOR.entrance : DOOR.leaf}
            f={leafFinish}
            peephole={entrance && !sliding}
            onToggle={toggle}
          />
        ))}
        {/* the lining: two jambs and a head board in the reveal */}
        {[-1, 1].map((s) => (
          <mesh
            key={`l${s}`}
            position={[s * (width / 2 - lining / 2), tall / 2, -t / 2]}
            receiveShadow
          >
            <boxGeometry args={[lining, tall, t]} />
            <meshStandardMaterial color={FRAME_HEX} roughness={JOINERY_ROUGH} />
          </mesh>
        ))}
        <mesh position={[0, tall - lining / 2, -t / 2]} receiveShadow>
          <boxGeometry args={[width, lining, t]} />
          <meshStandardMaterial color={FRAME_HEX} roughness={JOINERY_ROUGH} />
        </mesh>
        {/* the threshold across the opening */}
        <mesh position={[0, threshold / 2, -t / 2]} receiveShadow>
          <boxGeometry args={[width, threshold, t + 0.02]} />
          <meshStandardMaterial color={THRESHOLD_HEX} roughness={0.6} />
        </mesh>
        {/* the architrave round the opening: one moulding swept up the
            sides and across the head, mitred at the corners (architrave.ts),
            on each face the doorway has */}
        {faces.map((f) => (
          <mesh
            key={f}
            geometry={moulding}
            position={[0, 0, f > 0 ? 0 : -t]}
            rotation={[0, f > 0 ? 0 : Math.PI, 0]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={FRAME_HEX} roughness={JOINERY_ROUGH} />
          </mesh>
        ))}
        {/* a sliding door's tracks, at its head and across the floor */}
        {sliding && (
          <>
            <Member
              at={[0, tall - lining - 0.02, -0.035]}
              size={[width, 0.04, 0.06]}
              f={ALU}
            />
            <Member
              at={[0, 0.006, -0.035]}
              size={[width, 0.012, 0.06]}
              f={ALU}
            />
          </>
        )}
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
        {/* the marks of hands round the switch (wear.ts), a hair off the
            wall, under the plate */}
        {leaves.length > 0 && (
          <mesh
            position={[
              handleSide * (width / 2 + architrave + 0.1),
              1.2 - HAND_MARKS.tall * 0.08,
              0.0015,
            ]}
            raycast={noPick}
            renderOrder={1}
          >
            <planeGeometry args={[HAND_MARKS.wide, HAND_MARKS.tall]} />
            <meshStandardMaterial
              color="#5e554b"
              alphaMap={handMarks()}
              transparent
              opacity={HAND_MARKS.opacity}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              roughness={0.7}
            />
          </mesh>
        )}
      </group>
    </Inside>
  );
}

/** a sliding door's aluminium frame round its glass, m */
const SLIDER = { frame: 0.05 };
/** the lever's height from the floor, m */
const HANDLE_Y = 1.0;
/** how far a hinged leaf swings open, radians: a little short of square
    to the wall, as a door stands on its stop */
const SWING = 1.45;
/** how quickly a leaf goes to where it is asked, per second */
const SWING_RATE = 6;

/** one leaf of a doorway, hung on its hinge (or its track) so a click
    swings it into the room, or slides it behind the other, and another
    click brings it back; it moves there over a third of a second */
function DoorLeaf({
  l,
  i,
  tall,
  sliding,
  leafZ,
  travel,
  open,
  ajar,
  thick,
  f,
  peephole,
  onToggle,
}: {
  l: { x: number; w: number; handle: number };
  i: number;
  tall: number;
  sliding: boolean;
  leafZ: number;
  /** how far a sliding panel runs, m */
  travel: number;
  open: boolean;
  /** how far it stands ajar at rest, a share of its full swing */
  ajar: number;
  /** the leaf's thickness, m */
  thick: number;
  /** the leaf's face: painted or laminate */
  f: Finish;
  peephole: boolean;
  onToggle: () => void;
}) {
  const leaf = thick;
  const { lining, gap } = DOOR;
  const pivot = useRef<Group>(null);
  const room = useRoomReflection((s) => s.node);
  const k = useRef(open ? 1 : 0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [open, invalidate]);
  const zl = sliding ? -0.02 - i * (leaf + 0.01) : leafZ;
  const lw = l.w - 2 * gap - 2 * lining;
  const s = Math.sign(l.handle) || 1;
  // the hinge: the leaf's far edge from its handle, on its room face;
  // a sliding panel hangs from its middle
  const hx = sliding ? l.x : l.x - (s * lw) / 2;
  const hz = sliding ? zl : zl + leaf / 2;
  // only the front panel of a sliding pair runs, over the one behind
  const moves = !sliding || i === 0;
  // a hinged leaf rests ajar, and opens from there to its stop
  const pose = (g: Group, v: number) => {
    if (sliding) g.position.x = hx + v * travel;
    else g.rotation.y = -s * SWING * (ajar + (1 - ajar) * v);
  };
  useLayoutEffect(() => {
    if (pivot.current) pose(pivot.current, k.current);
  });
  useFrame((_, dt) => {
    const g = pivot.current;
    if (!g || !moves) return;
    const to = open ? 1 : 0;
    if (k.current === to) return;
    const step = Math.min(dt, 0.1) * SWING_RATE;
    const next = k.current + Math.sign(to - k.current) * step;
    k.current = Math.abs(to - k.current) <= step ? to : next;
    // eased: quick to start, settling on its stop
    const v = k.current * k.current * (3 - 2 * k.current);
    pose(g, v);
    invalidate();
  });
  // a leaf hidden with its wall is still in the ray's way: it takes no
  // press, and lets one through to what is behind it
  const shown = (e: ThreeEvent<Event>) => {
    for (let o: Object3D | null = e.eventObject; o; o = o.parent)
      if (!o.visible) return false;
    return true;
  };
  // the press is the leaf's, so a piece behind it does not take the
  // pointer (a piece holds the pointer from its press, and a held
  // pointer's click goes to everything under it)
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (moves && shown(e)) e.stopPropagation();
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!moves || !shown(e)) return;
    e.stopPropagation();
    onToggle();
  };
  // a finger over a leaf that opens, said on the stage
  const stageOf = (e: ThreeEvent<PointerEvent>) =>
    (e.nativeEvent.target as HTMLElement | null)?.closest<HTMLElement>(
      ".stage-3d",
    );
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!moves || !shown(e)) return;
    e.stopPropagation();
    const el = stageOf(e);
    if (el) el.dataset.overDoor = "true";
  };
  const onOut = (e: ThreeEvent<PointerEvent>) => {
    const el = stageOf(e);
    if (el) delete el.dataset.overDoor;
  };
  // where the open leaf comes to rest: its stop on the floor, under the
  // leaf near its handle edge
  const reach = lw - 0.06;
  return (
    <>
      {!sliding && (
        <Rod
          f={STEEL}
          at={[
            hx + s * reach * Math.cos(SWING),
            DOOR.stop,
            hz + reach * Math.sin(SWING),
          ]}
          r={DOOR.stop}
          h={DOOR.stop * 2}
        />
      )}
      <group ref={pivot} position={[hx, 0, hz]}>
        <group
          position={[l.x - hx, 0, -hz]}
          onPointerDown={onDown}
          onClick={onClick}
          onPointerOver={onOver}
          onPointerOut={onOut}
        >
          {sliding ? (
            // a sliding panel: glass in an aluminium frame
            <group position={[0, (tall - gap) / 2, zl]} userData={LEAF_NAME}>
              {[-1, 1].map((e) => (
                <Member
                  key={`v${e}`}
                  at={[(e * (lw - SLIDER.frame)) / 2, 0, 0]}
                  size={[SLIDER.frame, tall - gap, leaf]}
                  f={ALU}
                />
              ))}
              {[-1, 1].map((e) => (
                <Member
                  key={`h${e}`}
                  at={[0, (e * (tall - gap - SLIDER.frame)) / 2, 0]}
                  size={[lw - 2 * SLIDER.frame, SLIDER.frame, leaf]}
                  f={ALU}
                />
              ))}
              <mesh>
                <planeGeometry
                  args={[lw - 2 * SLIDER.frame, tall - gap - 2 * SLIDER.frame]}
                />
                <primitive
                  object={glassOf(room)}
                  attach="material"
                  dispose={null}
                />
              </mesh>
            </group>
          ) : (
            <mesh
              position={[0, (tall - gap) / 2, zl]}
              castShadow
              receiveShadow
              userData={LEAF_NAME}
            >
              <boxGeometry args={[lw, tall - gap, leaf]} />
              <Mat f={f} />
            </mesh>
          )}
          {!sliding &&
            [-1, 1].map((side) => {
              // the face this side of the leaf, and which way is out of it
              const at = zl + (side * leaf) / 2;
              const out = (d: number) => at + side * d;
              return (
                <group key={side}>
                  {/* the lever: its rose, a neck out from the leaf, and
                    its grip turning back along the leaf, rounded at
                    the end */}
                  <Rod
                    f={STEEL}
                    at={[l.handle, HANDLE_Y, out(0.004)]}
                    r={DOOR.rose}
                    h={0.008}
                    rotation={[Math.PI / 2, 0, 0]}
                  />
                  <Rod
                    f={STEEL}
                    at={[l.handle, HANDLE_Y, out(DOOR.neck / 2)]}
                    r={0.009}
                    h={DOOR.neck}
                    rotation={[Math.PI / 2, 0, 0]}
                  />
                  <Rod
                    f={STEEL}
                    at={[
                      l.handle - (s * DOOR.grip) / 2,
                      HANDLE_Y,
                      out(DOOR.neck),
                    ]}
                    r={0.01}
                    top={0.008}
                    h={DOOR.grip}
                    rotation={[0, 0, (s * Math.PI) / 2]}
                  />
                  {/* the key's escutcheon below it, its keyhole dark */}
                  <Rod
                    f={STEEL}
                    at={[l.handle, HANDLE_Y - DOOR.keyBelow, out(0.003)]}
                    r={DOOR.escutcheon}
                    h={0.006}
                    rotation={[Math.PI / 2, 0, 0]}
                  />
                  <Member
                    at={[l.handle, HANDLE_Y - DOOR.keyBelow, out(0.0065)]}
                    size={[0.004, 0.012, 0.002]}
                    f={GASKET}
                  />
                  {peephole && (
                    <Rod
                      f={STEEL}
                      at={[l.x, DOOR.peephole, out(0.004)]}
                      r={0.012}
                      h={0.008}
                      rotation={[Math.PI / 2, 0, 0]}
                    />
                  )}
                </group>
              );
            })}
        </group>
        {/* the three butt hinges on the hinge side, their knuckles on the
          leaf's edge, turning with it */}
        {!sliding &&
          [0.2, (tall - gap) / 2 + 0.1, tall - gap - 0.2].map((y) => (
            <Rod
              key={y}
              f={STEEL}
              at={[0, y, 0]}
              r={DOOR.knuckle}
              h={DOOR.hinge}
            />
          ))}
      </group>
    </>
  );
}

/** how far a press may travel and still be a click on the floor, px */
const CLICK_TRAVEL = 6;

export function RoomShell({
  r,
  walk,
  onWalkTo,
  onFloorTap,
  reflection,
}: {
  r: RoomShape;
  /** inside, walking: a click on the floor goes there */
  walk: boolean;
  /** a click on the floor while walking: go there */
  onWalkTo: (x: number, z: number) => void;
  /** a click on the floor otherwise: the piece in hand is put down */
  onFloorTap?: (() => void) | undefined;
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
  const lampAt = useMemo(() => ceilingAt(r.outline, w, d), [r.outline, w, d]);
  // the floor's material: a photographed set in its own colour with
  // the tone laid lightly over it, else the grown floor in the tone
  const floorMat = useMaterial(FLOOR_MATERIAL[r.floor], r.floorHex);
  const floorMaps = repeated(floorMat);
  // each room's floor laid from its own place in the tile, so two rooms
  // side by side never repeat the same boards at the same spot
  const floorGeometry = useMemo(() => {
    const g = new ShapeGeometry(shape);
    const [u, v] = tileOffset(r.id);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) + u, uv.getY(i) + v);
    return g;
  }, [shape, r.id]);
  useEffect(() => () => floorGeometry.dispose(), [floorGeometry]);
  const t = toMetres(r.thickness);
  // the wall runs with their mitres and holes: read once per shape, not
  // per frame, since a wall's geometry is
  // rebuilt when these change and a rebuild asks for another frame
  const { W, D, outline, openings, thickness, shared } = r;
  const runs = useMemo(() => {
    const shape = { W, D, outline, openings };
    const mitres = mitresOf(outline, thickness);
    const edges = edgesOf(outline);
    const byEdge = edges.map((e) => runsOf(e, shared ?? []));
    const n = edges.length;
    const idOf = (i: number, k: number) => `${r.id}/${i}-${k}`;
    const out = edges.flatMap((e, i) =>
      byEdge[i]!.map(({ e: run, both, other }, k) => {
        const m = runMitres(e, run, mitres[i]!);
        // the run at the other side of each corner: the last of the
        // edge before, the first of the edge after, where this room
        // builds them up to the corner
        const before = byEdge[(i - 1 + n) % n]!;
        const after = byEdge[(i + 1) % n]!;
        const prev = before.length - 1;
        const reaches = (a: Edge, b: Edge, end: "a" | "b") =>
          a[end][0] === b[end][0] && a[end][1] === b[end][1];
        // a corner is taken whole by the wall that starts there, or by
        // the wall that ends there when this room builds no wall
        // starting at it: so each corner has one, both walls square
        const nextReaches =
          after.length > 0 && reaches(after[0]!.e, edges[(i + 1) % n]!, "a");
        const start =
          m[0] > 0 &&
          prev >= 0 &&
          reaches(before[prev]!.e, edges[(i - 1 + n) % n]!, "b")
            ? idOf((i - 1 + n) % n, prev)
            : null;
        const end =
          m[1] > 0 &&
          after.length > 0 &&
          reaches(after[0]!.e, edges[(i + 1) % n]!, "a")
            ? idOf((i + 1) % n, 0)
            : null;
        return {
          run,
          both,
          other,
          key: `${i}-${k}`,
          id: idOf(i, k),
          ends: [start, end] as [string | null, string | null],
          corners: [
            { mitre: m[0], owner: true },
            { mitre: m[1], owner: !nextReaches },
          ] as [Corner, Corner],
          joints: jointsOf(e, run),
          holes: holesOf(shape, run, h),
        };
      }),
    );
    return out;
  }, [W, D, outline, openings, thickness, shared, h, r.id]);
  const onFloorClick = useEvent((e: ThreeEvent<MouseEvent>) => {
    // a drag that looked round and let go over the floor is not a step,
    // nor a tap
    if (e.delta > CLICK_TRAVEL) return;
    e.stopPropagation();
    if (walk) onWalkTo(e.point.x, e.point.z);
    else onFloorTap?.();
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
        <primitive object={floorGeometry} attach="geometry" />
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
      {runs.map(
        ({ run, both, other, key, id, ends, corners, joints, holes }) => (
          <WallRun
            key={key}
            id={id}
            ends={ends}
            e={run}
            w={w}
            d={d}
            h={h}
            t={t}
            corners={corners}
            joints={joints}
            wallHex={r.wallHex}
            floorHex={r.floorHex}
            holes={holes}
            both={both}
            shared={other ? { room: r.id, other } : undefined}
          />
        ),
      )}
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
        position={[0, h - CEILING_DROP, 0]}
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
      {/* the ceiling light as a fitting: its white ring housing a little
          proud of the ceiling, and the domed opal diffuser in it, both
          facing down and out, so an overhead view does not see them */}
      <mesh
        position={[lampAt[0], h - LAMP.drop / 2, lampAt[1]]}
        raycast={noPick}
      >
        <cylinderGeometry
          args={[
            LAMP.radius + LAMP.rim,
            LAMP.radius + LAMP.rim,
            LAMP.drop,
            48,
            1,
            true,
          ]}
        />
        <meshStandardMaterial
          color={LAMP_RIM_HEX}
          roughness={0.5}
          side={FrontSide}
        />
      </mesh>
      <mesh
        position={[
          lampAt[0],
          h - LAMP.drop + LAMP.dome.r * Math.cos(LAMP.dome.cap),
          lampAt[1],
        ]}
        raycast={noPick}
      >
        <sphereGeometry
          args={[
            LAMP.dome.r,
            48,
            4,
            0,
            Math.PI * 2,
            Math.PI - LAMP.dome.cap,
            LAMP.dome.cap,
          ]}
        />
        <meshStandardMaterial
          color={LAMP_HEX}
          // lit in the evening it glows the lamps' warm white, as the
          // evening's white balance expects (white-balance.ts)
          emissive={r.evening ? LAMP_BULB : LAMP_HEX}
          emissiveIntensity={r.evening ? LAMP.evening : LAMP.day}
          roughness={0.6}
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
/** how much the surroundings light the room, day and evening: the
    drawn panels' studio sky, and a photographed sky's map */
const SURROUND = {
  panels: { day: 0.12, evening: 0.03 },
  map: { day: 0.15, evening: 0.03 },
} as const;
export function RoomLight({ evening, sky }: { evening: boolean; sky: Sky }) {
  const file = sky === "panels" ? (evening ? "panels-evening" : "panels") : sky;
  const map = useLoader(HDRLoader, `/sky/${file}.hdr`);
  const get = useThree((s) => s.get);
  // the surroundings are what is outside: the glass and the gloss see
  // them, and they light the room's walls only faintly, as the sky
  // through a window does; the window's sun carries the room
  const intensity =
    SURROUND[sky === "panels" ? "panels" : "map"][evening ? "evening" : "day"];
  useEffect(() => {
    const { scene, invalidate } = get();
    return surround(scene, map, intensity, invalidate);
  }, [map, get, intensity]);
  return null;
}
