import type { Vector3Tuple } from "three";
import type { Opening } from "./room-data";
import type { Angle } from "./studio-store";

/**
 * Where the camera stands for each named angle of the 3D view: the
 * stage's own poses, and the ones a glTF export carries as named
 * cameras. The overviews (the four sides and the top) are scaled to
 * the flat's box and look at its middle; the perspective stands in a
 * corner of the room being worked on (cornerOf) and looks across it
 * with a wide lens, as a room is photographed: the walls round it, the
 * ceiling over it, the window the light comes in by. From outside
 * the room, the rooms beside it stood between the camera and the room
 * (the 5-room flat's bedrooms are south of the living room), and a
 * room looked into over a cut wall reads as a model.
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
/** the corner shot: how far in from each wall the camera stands, its
    height, and where it looks: a share of the room's half-size across
    it, and the height it looks at (a little down, verticals near
    upright) */
const CORNER = { inset: 0.45, height: 1.4, across: 0.38, look: 1.0 };
/** the least the room spans across the picture, degrees */
const ROOM_ACROSS = 66;

export type Pose = { pos: Vector3Tuple; at: Vector3Tuple; fov: number };

/** a corner of a room: which way along x (east +1) and along z (south
    +1) it stands from the middle */
export type Corner = readonly [-1 | 1, -1 | 1];
/** the openings a person comes in by, not a passage's open gap */
const DOORS = new Set(["door", "double", "sliding"]);

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
  const at: Record<string, Vector3Tuple> = {
    // the perspective looks from its corner across to the far one
    Perspective: [
      (-sx * room.w * CORNER.across) / 2,
      CORNER.look,
      (-sz * room.d * CORNER.across) / 2,
    ],
    Top: [cx, h / 2, cz],
  };
  const pos: Record<string, Vector3Tuple> = {
    Perspective: [
      sx * (room.w / 2 - Math.min(CORNER.inset, room.w / 4)),
      CORNER.height,
      sz * (room.d / 2 - Math.min(CORNER.inset, room.d / 4)),
    ],
    // across the flat's width: far enough that its near corners, closer
    // to the camera than its middle, stay in the picture
    Front: [cx, over, cz + r * 1.45],
    Back: [cx, over, cz - r * 1.45],
    Left: [cx - r * 1.3, over, cz],
    Right: [cx + r * 1.3, over, cz],
    Top: [cx, r * 1.8, cz + 0.01],
  };
  const inside = (angle in pos ? angle : "Perspective") === "Perspective";
  return {
    pos: pos[angle] ?? pos.Perspective!,
    at: at[angle] ?? side,
    fov: inside ? roomFov(aspect) : FOV.overview,
  };
};

/** the named angles a glTF export carries as cameras, and the walk's
    start: in from the room's corner at eye height, looking into the
    room a little down */
export const BOOKMARKS = [
  "Perspective",
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
  // a little down
  const yaw = Math.atan2(sx, sz);
  const pitch = -0.12;
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
