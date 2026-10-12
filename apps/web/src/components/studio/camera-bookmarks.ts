import type { Vector3Tuple } from "three";
import type { Opening } from "./room-data";
import type { Angle } from "./studio-store";

/**
 * Where the camera stands for each named angle of the 3D view: the
 * stage's own poses, and the ones a glTF export carries as named
 * cameras. The overviews (the four sides and the top) are scaled to
 * the flat's box and look at its middle; the perspective is the room
 * being worked on from above its photographed corner (cornerOf), at a
 * three-quarter angle like an isometric drawing: the whole room and
 * everything in it in one picture, the two near walls down to their
 * foot as the camera passes over them, the far walls and the window
 * the light comes in by behind. The walk stands in the room at eye
 * height (walkStart).
 */
/** eye height, m: the walk's */
export const EYE = 1.6;
/** the lens, vertical degrees: the overviews' and a room's from its
    corner (about a 20 mm lens on a full-frame camera, as interiors are
    taken), and the widest a tall screen opens it to so the room still
    spans the picture across */
export const FOV = { overview: 42, room: 58, widest: 78 } as const;
/** the stage camera's near and far clip, m, which a glTF's cameras
    carry too */
export const CLIP = { near: 0.05, far: 100 } as const;
/** the least the room spans across the picture, degrees */
const ROOM_ACROSS = 66;
/** the room from above its corner: how high the camera looks down,
    degrees; how far off the corner's diagonal it turns, so the longer
    walls read; the margin round the room in the picture */
const ROOM_VIEW = { elevation: 38, skew: 0.7, margin: 1.12 };

/** a pose: where the camera stands, what it looks at, its lens, and
    how far its frame is shifted down, a share of the frame's height
    (a shift lens, `camera.setViewOffset`): 0 for none */
export type Pose = {
  pos: Vector3Tuple;
  at: Vector3Tuple;
  fov: number;
  shift?: number;
};

/**
 * The room as an interiors photographer takes it: from a corner, the
 * camera level at about chest height so the walls' verticals stay
 * vertical, the frame shifted down rather than the camera tilted (a
 * shift lens) so the picture has more floor than ceiling, stepped back
 * into the corner. `height` and `inset` m, `shift` a share of the
 * frame's height; `clear` the least distance, m, to the nearest piece
 * in the frame, so the foreground is never a piece cut by its edge.
 */
export const SHOT = { height: 1.15, shift: 0.15, inset: 0.15, clear: 1.2 };
/** a piece's footprint in the room, m, about the room's middle (x east,
    z south) */
export type Box = { x: number; z: number; w: number; d: number };

/** the corner shot from a corner of a room `w` × `d`, m: in the corner,
    level, looking to the opposite one */
export const cornerShot = (
  w: number,
  d: number,
  [sx, sz]: Corner,
  aspect = 16 / 10,
): Pose => {
  const x = sx * (w / 2 - SHOT.inset);
  const z = sz * (d / 2 - SHOT.inset);
  return {
    pos: [x, SHOT.height, z],
    at: [-x, SHOT.height, -z],
    fov: roomFov(aspect),
    shift: SHOT.shift,
  };
};

/** the nearest piece the corner shot sees, m: the least distance from
    the camera to a footprint any part of which is in the frame across */
export const nearestInShot = (
  w: number,
  d: number,
  corner: Corner,
  boxes: readonly Box[],
  aspect = 16 / 10,
) => {
  const { pos, at, fov } = cornerShot(w, d, corner, aspect);
  const [px, , pz] = pos;
  const look = Math.atan2(at[0] - px, at[2] - pz);
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  let nearest = Infinity;
  for (const b of boxes) {
    const xs = [b.x - b.w / 2, b.x + b.w / 2];
    const zs = [b.z - b.d / 2, b.z + b.d / 2];
    const seen = xs.some((x) =>
      zs.some((z) => {
        let a = Math.atan2(x - px, z - pz) - look;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        return Math.abs(a) <= half;
      }),
    );
    if (!seen) continue;
    const cx = Math.min(xs[1]!, Math.max(xs[0]!, px));
    const cz = Math.min(zs[1]!, Math.max(zs[0]!, pz));
    nearest = Math.min(nearest, Math.hypot(cx - px, cz - pz));
  }
  return nearest;
};

/** the corner the shot is taken from: the photographed corner (facing
    the window) when its foreground is clear, else the other corner on
    the window's side, so the window and its light stay in the picture,
    else a clear one across, else the clearest */
export const shotCorner = (
  w: number,
  d: number,
  boxes: readonly Box[],
  photo: Corner,
  aspect = 16 / 10,
  /** which of the corner's two signs faces the window: z for a window
      on a north or south wall, x for one on an east or west wall */
  facing: "x" | "z" = "z",
): Corner => {
  // the photographed corner's neighbour on the window's side comes
  // second: the other sign flips
  const [px, pz] = photo;
  const flipX: Corner = [-px as -1 | 1, pz];
  const flipZ: Corner = [px, -pz as -1 | 1];
  const corners: Corner[] = [
    photo,
    facing === "z" ? flipX : flipZ,
    facing === "z" ? flipZ : flipX,
    [-px as -1 | 1, -pz as -1 | 1],
  ];
  const near = corners.map((c) => nearestInShot(w, d, c, boxes, aspect));
  const clear = corners.findIndex((_, i) => near[i]! >= SHOT.clear);
  if (clear >= 0) return corners[clear]!;
  return corners[near.indexOf(Math.max(...near))]!;
};

/** a corner of a room: which way along x (east +1) and along z (south
    +1) it stands from the middle */
export type Corner = readonly [-1 | 1, -1 | 1];
/** the openings a person comes in by, not a passage's open gap */
const DOORS = new Set(["door", "double", "sliding"]);

/** which of a corner's signs faces a room's widest window (cornerOf) */
export const windowSide = (
  openings: readonly Pick<Opening, "kind" | "wall" | "width">[],
): "x" | "z" => {
  const window = openings
    .filter((o) => o.kind === "window")
    .sort((a, b) => b.width - a.width)[0];
  return window && (window.wall === "east" || window.wall === "west")
    ? "x"
    : "z";
};

/** the corner a room is photographed from: on the side facing its
    widest window, so the window and the light it gives are in the
    picture, at the end of that side farther from its doors (what stands
    along the camera's own wall is out of the picture, and a doorway's
    swing is where a cabinet seldom stands); a room without a window is
    taken from the south-east. W and D in mm, the openings in the room's
    own frame */
export const cornerOf = (
  openings: readonly Pick<Opening, "kind" | "wall" | "at" | "width">[],
  W: number,
  D: number,
): Corner => {
  const window = openings
    .filter((o) => o.kind === "window")
    .sort((a, b) => b.width - a.width)[0];
  if (!window) return [1, 1];
  const across = window.wall === "north" || window.wall === "south";
  // the side facing the window
  const facing: -1 | 1 =
    window.wall === "north" || window.wall === "west" ? 1 : -1;
  // the doors' middle along the other way, mm from the room's middle
  const along = (o: (typeof openings)[number]) => {
    const onX = o.wall === "north" || o.wall === "south";
    if (across === onX)
      return (o.at ?? (across ? W : D) / 2) - (across ? W : D) / 2;
    return (
      ((o.wall === "east" || o.wall === "south" ? 1 : -1) * (across ? W : D)) /
      2
    );
  };
  const doors = openings.filter((o) => DOORS.has(o.kind));
  const lean = doors.reduce((n, o) => n + along(o), 0);
  const end: -1 | 1 = lean > 0 ? -1 : 1;
  return across ? [end, facing] : [facing, end];
};

/** a room on the sheet: its north-west corner and its size, mm */
type Placed = { pos: readonly [number, number]; width: number; depth: number };
/** how far apart two rooms stand to be neighbours (the wall between
    them, up to its thickest), and how long their sides must run
    together, mm */
const TOUCH = 400;
const ALONG = 400;

/** the corner a room is seen from above: on the sides with no room
    beyond them (the flat's outside walls), so only the room's own near
    walls stand between the camera and it, and those drop to their
    foot; where two corners are as open, the one its picture is taken
    from (`photo`) */
export const openCorner = (
  room: Placed,
  others: readonly Placed[],
  photo: Corner,
): Corner => {
  const [x0, y0] = room.pos;
  const x1 = x0 + room.width;
  const y1 = y0 + room.depth;
  const overlap = (a0: number, a1: number, b0: number, b1: number) =>
    Math.min(a1, b1) - Math.max(a0, b0);
  // how much of each side has a room beyond it, mm
  const shut = { w: 0, e: 0, n: 0, s: 0 };
  for (const o of others) {
    const [ox0, oy0] = o.pos;
    const ox1 = ox0 + o.width;
    const oy1 = oy0 + o.depth;
    const alongY = overlap(y0, y1, oy0, oy1);
    const alongX = overlap(x0, x1, ox0, ox1);
    if (alongY > ALONG && Math.abs(ox1 - x0) < TOUCH) shut.w += alongY;
    if (alongY > ALONG && Math.abs(ox0 - x1) < TOUCH) shut.e += alongY;
    if (alongX > ALONG && Math.abs(oy1 - y0) < TOUCH) shut.n += alongX;
    if (alongX > ALONG && Math.abs(oy0 - y1) < TOUCH) shut.s += alongX;
  }
  const corners: Corner[] = [
    [photo[0], photo[1]],
    [photo[0], -photo[1] as -1 | 1],
    [-photo[0] as -1 | 1, photo[1]],
    [-photo[0] as -1 | 1, -photo[1] as -1 | 1],
  ];
  const blocked = ([sx, sz]: Corner) =>
    (sx > 0 ? shut.e : shut.w) / room.depth +
    (sz > 0 ? shut.s : shut.n) / room.width;
  // the least blocked; the photographed corner first among equals
  return corners.reduce((best, c) =>
    blocked(c) < blocked(best) - 0.01 ? c : best,
  );
};

/** the vertical lens that keeps a room's corner shot `ROOM_ACROSS`
    wide on a screen of this shape (width / height) */
export const roomFov = (aspect: number) => {
  const across = (ROOM_ACROSS * Math.PI) / 180;
  const fit = (2 * Math.atan(Math.tan(across / 2) / aspect) * 180) / Math.PI;
  return Math.min(FOV.widest, Math.max(FOV.room, fit));
};

export const cameraFor = (
  angle: Angle,
  /** the flat's box, m */
  w: number,
  d: number,
  h: number,
  /** the flat's middle about the room being worked on, m */
  centre: readonly [number, number],
  /** the room being worked on, m: it stands at the origin; and the
      corner its picture is taken from */
  room: { w: number; d: number; corner?: Corner } = { w, d },
  /** the picture's width over its height */
  aspect = 16 / 10,
): Pose => {
  const r = Math.max(w, d);
  const [cx, cz] = centre;
  const [sx, sz] = room.corner ?? [1, 1];
  // the four sides look in over the near wall, which is open to the
  // camera, from above the walls: the floor, the pieces and the far wall
  // all in view, as a section through the room is drawn
  const over = h * 1.3;
  const side: Vector3Tuple = [cx, h / 3, cz];
  // the perspective: the room from above its corner, far enough back
  // that all of it (its walls' height too) fits the picture both ways
  const up = (ROOM_VIEW.elevation * Math.PI) / 180;
  const yaw = Math.atan2(sx * ROOM_VIEW.skew, sz);
  const reach = Math.hypot(room.w, room.d) / 2;
  const half = (FOV.overview * Math.PI) / 360;
  const tall = reach * Math.sin(up) + (h * Math.cos(up)) / 2;
  const far =
    ROOM_VIEW.margin *
    Math.max(
      tall / Math.tan(half),
      reach / (Math.tan(half) * Math.max(0.5, aspect)),
    );
  if (angle === "Corner")
    return cornerShot(room.w, room.d, room.corner ?? [1, 1], aspect);
  const look = h / 4;
  const at: Record<string, Vector3Tuple> = {
    Perspective: [0, look, 0],
    Top: [cx, h / 2, cz],
  };
  const pos: Record<string, Vector3Tuple> = {
    Perspective: [
      far * Math.cos(up) * Math.sin(yaw),
      look + far * Math.sin(up),
      far * Math.cos(up) * Math.cos(yaw),
    ],
    // across the flat's width: far enough that its near corners, closer
    // to the camera than its middle, stay in the picture
    Front: [cx, over, cz + r * 1.45],
    Back: [cx, over, cz - r * 1.45],
    Left: [cx - r * 1.3, over, cz],
    Right: [cx + r * 1.3, over, cz],
    Top: [cx, r * 1.8, cz + 0.01],
  };
  return {
    pos: pos[angle] ?? pos.Perspective!,
    at: at[angle] ?? side,
    fov: FOV.overview,
  };
};

/** the named angles a glTF export carries as cameras, and the walk's
    start: in from the room's corner at eye height, looking level into
    the room */
export const BOOKMARKS = [
  "Perspective",
  "Corner",
  "Front",
  "Back",
  "Left",
  "Right",
  "Top",
] as const;
export const walkStart = (
  w: number,
  d: number,
  aspect = 16 / 10,
  corner: Corner = [1, 1],
): Pose => {
  const [sx, sz] = corner;
  const x = sx * (w / 2 - 0.6);
  const z = sz * (d / 2 - 0.6);
  // looking to the far corner (from the south-east, π/4: north-west),
  // level, so the walls' verticals stand vertical
  const yaw = Math.atan2(sx, sz);
  const pitch = 0;
  return {
    pos: [x, EYE, z],
    fov: roomFov(aspect),
    at: [
      x - Math.sin(yaw) * Math.cos(pitch),
      EYE + Math.sin(pitch),
      z - Math.cos(yaw) * Math.cos(pitch),
    ],
  };
};
