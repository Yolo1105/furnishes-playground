/**
 * Room shapes to start from. Each is a footprint in plan units (x to the
 * right, y into the room, 1 ≈ the room's short side); the Room tab draws
 * them as small isometric boxes and the real plan scales the chosen one
 * to the room's size.
 */
export type Point = readonly [number, number];

type RoomTemplate = {
  id: string;
  name: string;
  footprint: readonly Point[];
};

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  {
    id: "square",
    name: "Square",
    footprint: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  },
  {
    id: "wide",
    name: "Rectangle",
    footprint: [
      [0, 0],
      [1.45, 0],
      [1.45, 1],
      [0, 1],
    ],
  },
  {
    id: "long",
    name: "Long room",
    footprint: [
      [0, 0],
      [1, 0],
      [1, 1.5],
      [0, 1.5],
    ],
  },
  {
    id: "l-right",
    name: "L-shape",
    footprint: [
      [0, 0],
      [0.6, 0],
      [0.6, 0.45],
      [1.2, 0.45],
      [1.2, 1],
      [0, 1],
    ],
  },
  {
    id: "l-left",
    name: "Mirrored L",
    footprint: [
      [0, 0],
      [1.2, 0],
      [1.2, 1],
      [0.5, 1],
      [0.5, 0.55],
      [0, 0.55],
    ],
  },
  {
    id: "alcove",
    name: "Alcove",
    footprint: [
      [0.45, 0],
      [1.2, 0],
      [1.2, 1],
      [0, 1],
      [0, 0.5],
      [0.45, 0.5],
    ],
  },
];

export type TemplateId = (typeof ROOM_TEMPLATES)[number]["id"];

/** one face of the little box, ready for an SVG polygon */
type IsoFace = {
  points: string;
  /** "floor", "in" (a wall seen from inside) or "out" (seen from outside) */
  kind: "floor" | "in" | "out";
};

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
const WALL = 0.42;

/**
 * Project a footprint into isometric faces, far to near, so painting
 * them in order gives the right overlaps. Walls that face the viewer
 * show their outside; the rest show their inside.
 */
export function isoFaces(
  footprint: readonly Point[],
  box = { w: 120, h: 96 },
): IsoFace[] {
  const pts = footprint;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  const scale = Math.min(
    box.w / (span * 2 * COS30 + 0.3),
    box.h / (span + WALL + 0.3),
  );
  const P = (x: number, y: number, z: number) => {
    const px = box.w / 2 + (x - cx - (y - cy)) * COS30 * scale;
    const py =
      box.h / 2 +
      (x - cx + (y - cy)) * SIN30 * scale -
      z * scale +
      (WALL * scale) / 2;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  };
  const faces: IsoFace[] = [
    { kind: "floor", points: pts.map((p) => P(p[0], p[1], 0)).join(" ") },
  ];
  const n = pts.length;
  const walls = pts.map((a, i) => {
    const b = pts[(i + 1) % n]!;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    // the normal must point away from the room
    if (nx * (mid[0] - cx) + ny * (mid[1] - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const out = nx + ny > 0;
    const depth = Math.max(a[0] + a[1], b[0] + b[1]);
    return {
      depth,
      face: {
        kind: out ? "out" : "in",
        points: [
          P(a[0], a[1], 0),
          P(b[0], b[1], 0),
          P(b[0], b[1], WALL),
          P(a[0], a[1], WALL),
        ].join(" "),
      } as IsoFace,
    };
  });
  walls.sort((p, q) => p.depth - q.depth);
  return faces.concat(walls.map((w) => w.face));
}
