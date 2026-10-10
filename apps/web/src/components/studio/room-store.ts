import { create } from "zustand";
import { newId } from "./ids";
import {
  CEILING,
  type FlatType,
  hdbOffset,
  JOIN_MIN,
  makeOpening,
  type Opening,
  type OpeningKind,
  openingsFor,
  OPENING_WIDTH,
  OPENINGS,
  PRESETS,
  PRIVATE_ROOMS,
  ROOM_NAMES,
  ROOM_SIZE,
  type RoomId,
  SHOWCASE_ROOMS,
  type Rules,
  rulesFor,
  swings,
  type Wall,
  WALLS,
} from "./room-data";
import {
  insideOutline,
  boxOf,
  FACING,
  magnetSize,
  normalizeOutline,
  outlineFromCells,
  roomsOverlap,
  settleWays,
  sharedRuns,
  WALL_MM,
} from "./room-geometry";
import { useScene } from "./scene-store";
import { ROOM_TEMPLATES, type Point, type TemplateId } from "./room-templates";

/** how the room's shape comes about: traced on the canvas, or picked */
type RoomStart = "draw" | "template";

/** one room of the flat: its shape, size, openings, finish and rules,
    and where it stands on the sheet */
export type RoomSpec = {
  id: string;
  /** the room's top-left corner on the sheet, mm */
  pos: Point;
  start: RoomStart | null;
  template: TemplateId;
  /** the squares tapped for a "Your shape" room, "x,y" each */
  cells: string[];
  /** the room's own outline once drawn, closed or reshaped, mm */
  drawn: Point[] | null;
  room: RoomId;
  width: number;
  depth: number;
  height: number;
  /** the walls' thickness, mm */
  thickness: number;
  /** the doors and windows in the walls */
  openings: Opening[];
  floor: string;
  wallTone: string;
  /** true until the visitor edits a size: sizes then stop following presets */
  preset: boolean;
  /** the planner's rules for this room */
  rules: Rules;
};

/** a doorway through the wall two rooms share: a passage, or a door
    swinging into the private room. Both rooms read it as an opening of
    theirs; closed, the wall stays solid until it is opened again */
export type Join = {
  id: string;
  a: string;
  b: string;
  /** the wall of room a the doorway is in, and room b's facing it */
  wallA: Wall;
  wallB: Wall;
  /** the doorway's centre along the sheet's axis the wall lies on, mm */
  at: number;
  width: number;
  kind: OpeningKind;
  /** the room a swinging leaf opens into */
  into: string;
  open: boolean;
};

export type RoomConfig = {
  flat: FlatType;
  /** the rooms of the flat, in the order they were added */
  rooms: RoomSpec[];
  /** the doorways between rooms that stand wall to wall */
  joins: Join[];
  /** the room being worked on: the panels, the handles and Eva read it */
  activeId: string;
  /** the tour's stops on the sheet, mm, in the order they are walked */
  stops: Point[];
  /** the corners traced so far on the plan, mm, until the room closes */
  drawing: Point[];
};

/** the active room's own fields, with the flat's */
type ActiveRoom = RoomSpec & Pick<RoomConfig, "flat">;

type RoomState = RoomConfig & {
  setFlat: (flat: FlatType) => void;
  setRoom: (room: RoomId) => void;
  /** the active room resized; with `magnet`, a width or depth that
      brings its east or south wall within reach of a neighbour's lands
      wall to wall */
  setSize: (
    patch: Partial<Pick<RoomSpec, "width" | "depth" | "height">>,
    magnet?: boolean,
  ) => void;
  set: (
    patch: Partial<Pick<RoomSpec, "floor" | "wallTone" | "thickness">>,
  ) => void;
  /** one opening changed: its wall, place, width, sill or head */
  setOpening: (id: string, patch: Partial<Omit<Opening, "id">>) => void;
  /** an opening of a kind put in a wall (the emptiest, facing the first
      door, unless one is named); returns its id */
  addOpening: (kind: OpeningKind, wall?: Wall, at?: number) => string;
  removeOpening: (id: string) => void;
  resetSize: () => void;
  setRules: (patch: Partial<Rules>) => void;
  /** the rules back to what this room starts with */
  resetRules: () => void;
  setStart: (start: RoomStart) => void;
  setTemplate: (template: TemplateId) => void;
  /** tap a square into, or out of, a "Your shape" room */
  toggleCell: (x: number, y: number) => void;
  /** a stop on the tour, if it is in a room */
  addStop: (p: Point) => void;
  removeStop: (i: number) => void;
  clearStops: () => void;
  /** a corner on the plan; near the first one, with three or more, it closes */
  addCorner: (p: Point) => void;
  /** forget the drawing and the drawn room */
  clearWalls: () => void;
  /** the room's outline as the plan's handles left it, mm in the frame
      the plan showed; the room becomes its own shape, sized by its box,
      and what stood in it keeps to the walls that did not move. Returns
      how far the frame moved. */
  setOutline: (points: readonly Point[]) => { dx: number; dy: number };
  /** another room of the flat, at its typical size, stood beside the
      active one; it becomes the active room. Returns its id */
  addRoom: (room: RoomId) => string;
  /** a room taken out of the flat, with what stood in it; the last room stays */
  removeRoom: (id: string) => void;
  setActive: (id: string) => void;
  /** a room stood elsewhere on the sheet; `done` once the move ends, so
      the doorways between rooms are settled */
  moveRoom: (id: string, pos: Point, done?: boolean) => void;
  /** a room standing into its neighbours moved the shortest way out
      of them, a wall's thickness from the nearest; what stands in it
      goes with it */
  settleRoom: (id: string) => void;
  /** the doorways between rooms read afresh from where the rooms stand:
      one for each wall two rooms share, kept where it was while the
      shared stretch still holds it, gone when the rooms part */
  settleJoins: () => void;
  /** a closed doorway opened again */
  reopenJoin: (id: string) => void;
};

/** how close to the first corner a click closes the room, mm */
export const CLOSE_WITHIN = 350;
/** the drawing and the tour's stops snap to this, mm */
const SNAP = 100;

/** the room's outline in mm, from the top-left corner: the drawn one, or
    the template scaled to the room's width and depth */
export const footprintOf = (s: {
  drawn: Point[] | null;
  template: TemplateId;
  cells: string[];
  width: number;
  depth: number;
}): Point[] => {
  if (s.drawn) return normalizeOutline(s.drawn).points;
  const tapped =
    s.template === "grid" ? outlineFromCells(new Set(s.cells)) : [];
  const shape = tapped.length
    ? tapped
    : (ROOM_TEMPLATES.find((x) => x.id === s.template) ?? ROOM_TEMPLATES[0]!)
        .footprint;
  const b = boxOf(shape);
  return shape.map(([x, y]) => [
    ((x - b.x) / b.w) * s.width,
    ((y - b.y) / b.h) * s.depth,
  ]);
};

/** how many walls the room has */
export const wallsOf = (s: { drawn: Point[] | null; drawing: Point[] }) =>
  s.drawn ? s.drawn.length : Math.max(0, s.drawing.length - 1);

const sized = (flat: FlatType, room: RoomId) => {
  const p = PRESETS[flat][room] ??
    PRESETS[flat].living ?? { width: 4000, depth: 3000 };
  return { width: p.width, depth: p.depth };
};

/** the wall with the fewest openings, the one facing the first door
    first among equals, so a new door tends to face the old one */
const freeWall = (openings: Opening[]): Wall => {
  const first = openings.find((o) => o.kind !== "window")?.wall;
  const order: Wall[] = first
    ? [FACING[first], ...WALLS.filter((w) => w !== FACING[first])]
    : WALLS;
  return order.reduce((best, w) =>
    openings.filter((o) => o.wall === w).length <
    openings.filter((o) => o.wall === best).length
      ? w
      : best,
  );
};

/** a room's openings on its walls at a new size: one placed by HDB's
    convention keeps its distance from the far corner, the rest keep
    their share of the wall */
const refit = (
  r: Pick<RoomSpec, "openings" | "width" | "depth">,
  width: number,
  depth: number,
): Opening[] =>
  r.openings.map((o) => {
    if (o.at === null) return o;
    const along = o.wall === "north" || o.wall === "south";
    const off = o.hdb ? hdbOffset(o, r.width, r.depth) : null;
    const to = along ? width : depth;
    return {
      ...o,
      at:
        off !== null
          ? to - off - o.width / 2
          : (o.at * to) / (along ? r.width : r.depth),
    };
  });

/** a drawn outline and its openings stretched to a new width and depth */
const stretched = (
  s: Pick<RoomSpec, "drawn" | "openings" | "width" | "depth">,
  width: number,
  depth: number,
) => {
  if (!s.drawn) return {};
  const fx = width / s.width;
  const fy = depth / s.depth;
  return {
    drawn: s.drawn.map(([x, y]): Point => [x * fx, y * fy]),
    openings: s.openings.map((o) =>
      o.at === null
        ? o
        : {
            ...o,
            at: o.at * (o.wall === "north" || o.wall === "south" ? fx : fy),
          },
    ),
  };
};

/** a room of a kind at its typical size for the flat, before any choice
    of how it begins */

const roomOf = (
  flat: FlatType,
  room: RoomId,
  pos: Point,
  id = newId("room"),
): RoomSpec => {
  const size = sized(flat, room);
  return {
    id,
    pos,
    start: null,
    template: ROOM_TEMPLATES[0]!.id,
    cells: ["0,0", "1,0", "2,0", "0,1", "1,1", "2,1", "3,1", "4,1"],
    drawn: null,
    room,
    ...size,
    height: CEILING.default,
    thickness: WALL_MM,
    openings: openingsFor(room, size.width, size.depth),
    floor: "Vinyl",
    wallTone: "white",
    preset: true,
    rules: rulesFor(room),
  };
};

/** the room being worked on */
export const activeOf = (s: Pick<RoomConfig, "rooms" | "activeId">) =>
  s.rooms.find((r) => r.id === s.activeId) ?? s.rooms[0]!;

/** a room's outline on the sheet, mm */
export const sheetOutline = (r: RoomSpec): Point[] =>
  footprintOf(r).map(([x, y]) => [x + r.pos[0], y + r.pos[1]]);

/** the room whose floor a point of the sheet is on, if any */
export const roomAt = (rooms: readonly RoomSpec[], p: Point) =>
  rooms.find((r) => insideOutline(p[0], p[1], sheetOutline(r))) ?? null;

/** the other rooms a room stands into: two rooms' floors over each
    other, where rooms side by side stand a wall apart */
export const roomOverlaps = (
  rooms: readonly RoomSpec[],
  id: string,
): RoomSpec[] => {
  const r = rooms.find((x) => x.id === id);
  if (!r) return [];
  const mine = sheetOutline(r);
  return rooms.filter(
    (other) => other.id !== id && roomsOverlap(mine, sheetOutline(other)),
  );
};

/** the overlap in words, from the room's side */
export const overlapText = (
  rooms: readonly RoomSpec[],
  r: RoomSpec,
  other: RoomSpec,
) => `The ${roomLabel(rooms, r)} stands into the ${roomLabel(rooms, other)}`;

/** what a room is called in the flat: its kind, numbered past the first
    of that kind */
export const roomLabel = (rooms: readonly RoomSpec[], r: RoomSpec) => {
  const same = rooms.filter((x) => x.room === r.room);
  const n = same.indexOf(r);
  return n > 0 ? `${ROOM_NAMES[r.room]} ${n + 1}` : ROOM_NAMES[r.room];
};

/** the kind of room the flat has not got yet, else a living room */
export const nextRoomKind = (flat: FlatType, rooms: readonly RoomSpec[]) =>
  (Object.keys(PRESETS[flat]) as RoomId[]).find(
    (k) => !rooms.some((r) => r.room === k),
  ) ?? "living";

/** what joins two rooms: a door into the private one, else a passage;
    between two private rooms the door opens into the second */
const joinKind = (a: RoomSpec, b: RoomSpec) =>
  PRIVATE_ROOMS.includes(b.room)
    ? { kind: "door" as const, into: b.id }
    : PRIVATE_ROOMS.includes(a.room)
      ? { kind: "door" as const, into: a.id }
      : { kind: "passage" as const, into: b.id };

/** the id an opening carries when it comes from a join */
const JOIN_ID = "join:";
const joinOf = (openingId: string) =>
  openingId.startsWith(JOIN_ID) ? openingId.slice(JOIN_ID.length) : null;

/** a room's openings: its own, and the open doorways it shares, each
    as an opening in the wall on its side (a leaf swings in the room it
    opens into; the other side reads the doorway as a passage) */
export const openingsOf = (
  s: Pick<RoomConfig, "joins">,
  r: RoomSpec,
): Opening[] => [
  ...r.openings,
  ...s.joins
    .filter((j) => j.open && (j.a === r.id || j.b === r.id))
    .map((j): Opening => {
      const wall = j.a === r.id ? j.wallA : j.wallB;
      const horizontal = wall === "north" || wall === "south";
      return {
        id: JOIN_ID + j.id,
        join: j.id,
        kind: swings(j) && j.into !== r.id ? "passage" : j.kind,
        wall,
        at: j.at - (horizontal ? r.pos[0] : r.pos[1]),
        width: j.width,
      };
    }),
];

/** the stretches of a room's walls shared with another room: where the
    two stand wall to wall the 3D view builds the wall once, by the
    earlier room, and that wall shows from both sides */
export const sharedOf = (
  s: Pick<RoomConfig, "rooms">,
  r: RoomSpec,
): {
  wall: Wall;
  from: number;
  to: number;
  both: boolean;
  /** the room beyond the wall */
  other: string;
}[] => {
  const i = s.rooms.findIndex((x) => x.id === r.id);
  const mine = sheetOutline(r);
  return s.rooms.flatMap((other, k) =>
    k === i
      ? []
      : sharedRuns(mine, sheetOutline(other), r.thickness).map((run) => {
          const along = run.horizontal ? r.pos[0] : r.pos[1];
          // with a later room this room builds the wall, seen from both
          // sides; with an earlier one, that room does
          return {
            wall: run.wallA,
            from: run.from - along,
            to: run.to - along,
            both: k > i,
            other: other.id,
          };
        }),
  );
};

/** the joins as the rooms stand now, from the ones there were; and the
    rooms whose preset door the new doorway stands in for */
const settled = (
  s: Pick<RoomConfig, "rooms" | "joins">,
): { joins: Join[]; doored: Set<string> } => {
  const kept: Join[] = [];
  const doored = new Set<string>();
  for (let i = 0; i < s.rooms.length; i++)
    for (let k = i + 1; k < s.rooms.length; k++) {
      const a = s.rooms[i]!;
      const b = s.rooms[k]!;
      for (const run of sharedRuns(
        sheetOutline(a),
        sheetOutline(b),
        a.thickness,
      )) {
        if (run.to - run.from < JOIN_MIN) continue;
        const was = s.joins.find(
          (j) =>
            j.a === a.id &&
            j.b === b.id &&
            j.wallA === run.wallA &&
            j.at - j.width / 2 >= run.from - 1 &&
            j.at + j.width / 2 <= run.to + 1,
        );
        if (was) {
          kept.push(was);
          continue;
        }
        const width = OPENINGS.door.width;
        const kind = joinKind(a, b);
        if (kind.kind === "door") doored.add(kind.into);
        kept.push({
          id: newId("join"),
          a: a.id,
          b: b.id,
          wallA: run.wallA,
          wallB: run.wallB,
          at:
            Math.round((run.from + run.to) / 2 / OPENING_WIDTH.step) *
            OPENING_WIDTH.step,
          width,
          ...kind,
          open: true,
        });
      }
    }
  return { joins: kept, doored };
};

/** the box round every room on the sheet, mm */
export const sheetBox = (rooms: readonly RoomSpec[]) =>
  boxOf(rooms.flatMap(sheetOutline));

/**
 * The flat the studio opens on: a 5-room flat's living and dining room
 * in the middle, the master bedroom west of it with its window to the
 * north, the common bathroom below the bedroom and entered from the
 * living room, the kitchen east of the dining end by the entrance.
 * Each neighbour meets the living room on a different wall, so the
 * doorways do not line up and the walk to each room crosses the living
 * room its own way, as an HDB flat is walked. The sizes are the flat's
 * typical ones; the openings are set here, not by a lone room's
 * convention: a wide window for the 7 m room, a glass sliding door into
 * the kitchen, a narrow door into the bathroom, a small high window in
 * the bathroom's outer wall. The bathroom also shares a wall with the
 * bedroom; that doorway is kept but closed, so the wall stands solid
 * (it is the common bathroom, not an ensuite).
 */
const showcaseFlat = (): Pick<
  RoomConfig,
  "flat" | "rooms" | "joins" | "stops"
> => {
  const flat: FlatType = "5-room";
  const living = roomOf(flat, "living", [0, 0], SHOWCASE_ROOMS.living);
  living.wallTone = "warm";
  living.openings = [
    makeOpening("door", "south", {
      at: living.width - 800 - OPENINGS.door.width / 2,
      hdb: true,
    }),
    makeOpening("window", "north", { width: 3000 }),
  ];
  // the bedroom stands a metre north of the living room's line, so the
  // bathroom below it still meets the living room's west wall
  const master = roomOf(flat, "master", [-4300, -1000], SHOWCASE_ROOMS.master);
  master.start = "template";
  master.wallTone = "sage";
  master.openings = [makeOpening("window", "north")];
  const bathroom = roomOf(
    flat,
    "bathroom",
    [-2700, 2800],
    SHOWCASE_ROOMS.bathroom,
  );
  bathroom.start = "template";
  bathroom.floor = "Tiles";
  bathroom.openings = [
    makeOpening("window", "west", { width: 600, sill: 1500, head: 2100 }),
  ];
  const kitchen = roomOf(flat, "kitchen", [7300, 1800], SHOWCASE_ROOMS.kitchen);
  kitchen.start = "template";
  kitchen.floor = "Tiles";
  kitchen.openings = [makeOpening("window", "east", { width: 1200 })];
  const rooms = [living, master, bathroom, kitchen];
  const between = (a: string, b: string) => (j: Join) =>
    (j.a === a && j.b === b) || (j.a === b && j.b === a);
  const joins = settled({ rooms, joins: [] }).joins.map((j) => {
    if (between(living.id, kitchen.id)(j))
      return { ...j, kind: "sliding" as const, width: 1800, at: 3450 };
    // the bedroom's door 600 mm from its south-east corner, as HDB has it
    if (between(living.id, master.id)(j)) return { ...j, at: 1450 };
    if (between(living.id, bathroom.id)(j))
      return { ...j, width: 750, at: 3325 };
    if (between(master.id, bathroom.id)(j)) return { ...j, open: false };
    return j;
  });
  // the tour's round of the flat: in at the entry, through the lounge
  // and the dining end, into the kitchen and back, across to the
  // bedroom and back, and to the bathroom door, each doorway crossed
  // square on
  const stops: Point[] = [
    [5750, 3900],
    [3900, 3700],
    [3900, 900],
    [6400, 3450],
    [8400, 3450],
    [6400, 3450],
    [700, 1450],
    [-900, 1450],
    [-2300, -400],
    [-900, 1450],
    [700, 2300],
    [700, 3325],
    [-1200, 3325],
  ];
  return { flat, rooms, joins, stops };
};

/** The rooms of the flat, one of them active. */
export const useRoom = create<RoomState>((set, get) => {
  /** the active room changed */
  const active = (
    patch:
      Partial<RoomSpec> | ((r: RoomSpec, s: RoomState) => Partial<RoomSpec>),
  ) =>
    set((s) => ({
      rooms: s.rooms.map((r) =>
        r.id === s.activeId
          ? { ...r, ...(typeof patch === "function" ? patch(r, s) : patch) }
          : r,
      ),
    }));
  const home = showcaseFlat();
  return {
    ...home,
    activeId: home.rooms[0]!.id,
    drawing: [],
    setFlat: (flat) => {
      set((s) => ({
        flat,
        // a room the flat does not have becomes a living room, with a
        // living room's openings; one still at its typical size takes the
        // flat's and keeps its own openings, refitted to its walls (a
        // window set by hand, a door taken out for a doorway, stay so)
        rooms: s.rooms.map((r) => {
          const room = PRESETS[flat][r.room] ? r.room : "living";
          if (!r.preset && room === r.room) return r;
          const size = sized(flat, room);
          return {
            ...r,
            room,
            ...(r.preset ? size : {}),
            openings: !r.preset
              ? r.openings
              : room === r.room
                ? refit(r, size.width, size.depth)
                : openingsFor(room, size.width, size.depth),
            ...(room === r.room ? {} : { rules: rulesFor(room) }),
          };
        }),
      }));
      // the rooms' sizes changed: the doorways between them are read afresh
      get().settleJoins();
    },
    setRoom: (room) => {
      active((r, s) => {
        const size = sized(s.flat, room);
        return {
          room,
          ...size,
          drawn: null,
          openings: openingsFor(room, size.width, size.depth),
          preset: true,
          rules: rulesFor(room),
        };
      });
      get().settleJoins();
    },
    setSize: (patch, magnet = false) => {
      const s = get();
      const r = activeOf(s);
      let width = patch.width ?? r.width;
      let depth = patch.depth ?? r.depth;
      if (magnet && (patch.width !== undefined || patch.depth !== undefined)) {
        const grown = { ...r, ...stretched(r, width, depth), width, depth };
        const pull = magnetSize(
          sheetOutline(grown),
          s.rooms.filter((o) => o.id !== r.id).map(sheetOutline),
          r.thickness,
        );
        if (patch.width !== undefined) width += pull.dw;
        if (patch.depth !== undefined) depth += pull.dd;
      }
      active((cur) => ({
        ...stretched(cur, width, depth),
        ...patch,
        width,
        depth,
        preset: false,
      }));
      get().settleJoins();
    },
    set: (patch) => active(patch),
    setOpening: (id, patch) => {
      const jid = joinOf(id);
      if (!jid) {
        active((r) => ({
          openings: r.openings.map((o) =>
            o.id === id ? { ...o, hdb: false, ...patch } : o,
          ),
        }));
        return;
      }
      // a shared doorway: its place is kept on the sheet, its width and
      // kind are the join's; its wall is where the rooms meet
      const r = activeOf(get());
      set((s) => ({
        joins: s.joins.map((j) => {
          if (j.id !== jid) return j;
          const wall = j.a === r.id ? j.wallA : j.wallB;
          const horizontal = wall === "north" || wall === "south";
          return {
            ...j,
            ...(patch.width !== undefined ? { width: patch.width } : {}),
            ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            ...(patch.at !== undefined && patch.at !== null
              ? { at: patch.at + (horizontal ? r.pos[0] : r.pos[1]) }
              : {}),
          };
        }),
      }));
    },
    addOpening: (kind, wall, at) => {
      const r = activeOf(get());
      const o = makeOpening(kind, wall ?? freeWall(r.openings), {
        at: at ?? null,
      });
      active({ openings: [...r.openings, o] });
      return o.id;
    },
    removeOpening: (id) => {
      const jid = joinOf(id);
      if (jid)
        set((s) => ({
          joins: s.joins.map((j) => (j.id === jid ? { ...j, open: false } : j)),
        }));
      else active((r) => ({ openings: r.openings.filter((o) => o.id !== id) }));
    },
    resetSize: () => {
      active((r, s) => {
        const size = sized(s.flat, r.room);
        return {
          ...stretched(r, size.width, size.depth),
          ...size,
          height: CEILING.default,
          preset: true,
        };
      });
      get().settleJoins();
    },
    setRules: (patch) => active((r) => ({ rules: { ...r.rules, ...patch } })),
    resetRules: () => active((r) => ({ rules: rulesFor(r.room) })),
    setStart: (start) => active({ start }),
    setTemplate: (template) => {
      active({ template, start: "template", drawn: null });
      get().settleJoins();
    },
    addStop: ([x, y]) =>
      set((s) => {
        const p: Point = [
          Math.round(x / SNAP) * SNAP,
          Math.round(y / SNAP) * SNAP,
        ];
        return roomAt(s.rooms, p) ? { stops: [...s.stops, p] } : {};
      }),
    removeStop: (i) =>
      set((s) => ({ stops: s.stops.filter((_, k) => k !== i) })),
    clearStops: () => set({ stops: [] }),
    toggleCell: (x, y) => {
      active((r) => {
        const key = `${x},${y}`;
        const cells = r.cells.includes(key)
          ? r.cells.filter((c) => c !== key)
          : [...r.cells, key];
        // the squares must hold together to be a room
        return outlineFromCells(new Set(cells)).length
          ? { cells, drawn: null }
          : {};
      });
      get().settleJoins();
    },
    addCorner: ([x, y]) => {
      const p: Point = [
        Math.round(x / SNAP) * SNAP,
        Math.round(y / SNAP) * SNAP,
      ];
      const { drawing } = get();
      const first = drawing[0];
      if (
        first &&
        drawing.length >= 3 &&
        Math.hypot(p[0] - first[0], p[1] - first[1]) <= CLOSE_WITHIN
      ) {
        // the drawing is on the sheet: the room takes its shape and
        // stands where it was drawn
        const b = boxOf(drawing);
        set({ drawing: [] });
        active({
          drawn: drawing.map(([px, py]): Point => [px - b.x, py - b.y]),
          pos: [b.x, b.y],
          width: Math.max(ROOM_SIZE.min, b.w),
          depth: Math.max(ROOM_SIZE.min, b.h),
          preset: false,
        });
        get().settleJoins();
        return;
      }
      const last = drawing[drawing.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) return;
      set({ drawing: [...drawing, p] });
    },
    clearWalls: () => {
      set({ drawing: [] });
      active({ drawn: null });
      get().settleJoins();
    },
    setOutline: (points) => {
      const { points: drawn, dx, dy } = normalizeOutline(points);
      const b = boxOf(drawn);
      const r = activeOf(get());
      // the frame moved: the room's corner on the sheet moves the other
      // way, so the walls that stayed stay put on the sheet
      active({
        drawn,
        pos: [r.pos[0] - dx, r.pos[1] - dy],
        width: b.w,
        depth: b.h,
        preset: false,
        start: r.start ?? "template",
        openings: r.openings.map((o) =>
          o.at === null
            ? o
            : {
                ...o,
                at: o.at + (o.wall === "north" || o.wall === "south" ? dx : dy),
              },
        ),
      });
      useScene.getState().nudgeAll(dx, dy, r.id, get().rooms[0]!.id);
      get().settleJoins();
      return { dx, dy };
    },
    addRoom: (room) => {
      const s = get();
      const from = activeOf(s);
      // beside the active room, its walls' thickness away: east, south,
      // west or north, the first side where nothing stands yet
      const size = sized(s.flat, room);
      const sides: Point[] = [
        [from.pos[0] + from.width + from.thickness, from.pos[1]],
        [from.pos[0], from.pos[1] + from.depth + from.thickness],
        [from.pos[0] - size.width - from.thickness, from.pos[1]],
        [from.pos[0], from.pos[1] - size.depth - from.thickness],
      ];
      const clear = ([x, y]: Point) =>
        !s.rooms.some(
          (r) =>
            x < r.pos[0] + r.width &&
            x + size.width > r.pos[0] &&
            y < r.pos[1] + r.depth &&
            y + size.depth > r.pos[1],
        );
      const next = roomOf(s.flat, room, sides.find(clear) ?? sides[0]!);
      next.start = "template";
      set({ rooms: [...s.rooms, next], activeId: next.id });
      get().settleJoins();
      return next.id;
    },
    removeRoom: (id) => {
      const s = get();
      if (s.rooms.length < 2 || !s.rooms.some((r) => r.id === id)) return;
      const rooms = s.rooms.filter((r) => r.id !== id);
      useScene.getState().removeRoomPieces(id, s.rooms[0]!.id);
      set({
        rooms,
        joins: s.joins.filter((j) => j.a !== id && j.b !== id),
        activeId: s.activeId === id ? rooms[0]!.id : s.activeId,
      });
      get().settleJoins();
    },
    setActive: (id) =>
      set((s) => (s.rooms.some((r) => r.id === id) ? { activeId: id } : {})),
    moveRoom: (id, pos, done = false) => {
      set((s) => ({
        rooms: s.rooms.map((r) => (r.id === id ? { ...r, pos } : r)),
      }));
      if (done) get().settleJoins();
    },
    settleRoom: (id) => {
      const s = get();
      const r = s.rooms.find((x) => x.id === id);
      if (!r) return;
      const others = s.rooms.filter((o) => o.id !== id).map(sheetOutline);
      const clearAt = (pos: Point) => {
        const mine = sheetOutline({ ...r, pos });
        return others.every((o) => !roomsOverlap(mine, o));
      };
      let pos = r.pos;
      // out of one neighbour may be into the next (a room between two):
      // the nearest way out that clears them all, else the nearest way
      // out of this one and another round
      for (let round = 0; round < 4 && !clearAt(pos); round++) {
        const mine = sheetOutline({ ...r, pos });
        const hit = others.find((o) => roomsOverlap(mine, o))!;
        const ways = settleWays(mine, hit, r.thickness);
        const way =
          ways.find((w) => clearAt([pos[0] + w.dx, pos[1] + w.dy])) ?? ways[0]!;
        pos = [pos[0] + way.dx, pos[1] + way.dy];
      }
      if (pos === r.pos) return;
      get().moveRoom(id, pos, true);
    },
    settleJoins: () =>
      set((s) => {
        const { joins, doored } = settled(s);
        // a private room's door is the new doorway now: the preset door
        // it came with, still as HDB had it, goes
        const rooms = doored.size
          ? s.rooms.map((r) =>
              doored.has(r.id)
                ? {
                    ...r,
                    openings: r.openings.filter((o) => !(o.hdb && swings(o))),
                  }
                : r,
            )
          : s.rooms;
        return { joins, rooms };
      }),
    reopenJoin: (id) =>
      set((s) => ({
        joins: s.joins.map((j) => (j.id === id ? { ...j, open: true } : j)),
      })),
  };
});

/** the active room's fields, with the flat's, for a component to read */
export const useActiveRoom = (): ActiveRoom => {
  const r = useRoom(activeOf);
  const flat = useRoom((s) => s.flat);
  return { ...r, flat };
};
