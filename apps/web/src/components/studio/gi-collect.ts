import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  type Material,
  type Mesh,
  type Object3D,
  type PointLight,
  Vector3,
} from "three";
import {
  atlasUv,
  layoutGi,
  type GiChart,
  type GiJob,
  type GiLamp,
  type GiWindow,
  type V3,
} from "./gi-bake";

/**
 * The flat as the bounce bake reads it (round 9, Part 1b), from the
 * scene as it is drawn: each room's group (`giRoom` in its userData)
 * holds its shell and its pieces.
 *
 * - The shell's own surfaces (a mesh named Floor, Wall or Ceiling: the
 *   floors, the walls' solids with their reveals and caps, the
 *   ceilings) take the light. Each of their faces is the room's it
 *   faces into, found by its floor (`roomAt`): a wall between two rooms
 *   is drawn once, by one of them, and its far face is the other
 *   room's; a face that looks into no room (a wall's outside, its cut
 *   top) is lit as outdoors.
 * - A room's bake holds every triangle within `REACH` of its box,
 *   whichever room's group it is in, so a wall drawn by the next room
 *   still stands in it; a mesh over `MESH_TRIS` triangles counts as its
 *   box.
 * - Glass, sheers, decals and footprints let the light through (a
 *   transparent material), and lines, helpers and a window's drawn
 *   outside (the sky the bake stands for) are not surfaces. A
 *   wall's foot (`STUB`), shown where the wall has gone from the
 *   picture, is left out: the wall itself still stands for the bake,
 *   since the light is the room's and not the view's (and so the bake
 *   reads every object, shown or not).
 *
 * A surface's colour is its material's (linear), or its tone where the
 * material or the mesh says (`giAlbedo` in its userData: a floor's tone
 * under its photograph, a wall's paint under its plaster), held under
 * `ALBEDO_MAX`.
 */

/** a mesh with more triangles than this counts as its box */
export const MESH_TRIS = 3000;
/** no surface gives back more than this of the light on it */
export const ALBEDO_MAX = 0.88;
/** how far past a room's box its bake reaches for what stands round
    it (the walls the next room draws, a door in its frame), m */
export const REACH = 0.3;
/** a surface with a map, and no tone of its own given: its map's
    tone, near enough */
const MAPPED = 0.8;
/** how far off a face its room is looked for, m */
const OFF = 0.05;
/** a face beside no room's floor (a reveal, in the wall's thickness) is
    the nearest room's within this, m */
const NEAR = 0.35;

const RECEIVES = new Set(["Floor", "Wall", "Ceiling"]);
/** the name a wall's foot carries (Room3D's STUB_NAME) */
export const STUB = "Wall foot";

/** the nearest name up from an object, short of the room's group */
const nameOf = (o: Object3D | null, room: Object3D): string => {
  for (let x = o; x && x !== room; x = x.parent) {
    const n = (x.userData as { name?: unknown }).name;
    if (typeof n === "string") return n;
  }
  return "";
};

const clear = (m: Material) =>
  m.transparent || (m as Material & { opacity?: number }).opacity! < 1;

const albedoOf = (mesh: Mesh, m: Material | undefined): V3 => {
  const given =
    (m?.userData as { giAlbedo?: string } | undefined)?.giAlbedo ??
    (mesh.userData as { giAlbedo?: string }).giAlbedo;
  const c = new Color(1, 1, 1);
  if (given) c.set(given);
  else if (m) {
    const own = (m as Material & { color?: Color }).color;
    if (own) c.copy(own);
    if ((m as Material & { map?: unknown }).map) c.multiplyScalar(MAPPED);
  }
  return [
    Math.min(ALBEDO_MAX, c.r),
    Math.min(ALBEDO_MAX, c.g),
    Math.min(ALBEDO_MAX, c.b),
  ];
};

/** a geometry's triangles' vertex indices, and each one's material */
const triangles = (g: BufferGeometry) => {
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const n = Math.floor((index ? index.count : pos.count) / 3);
  const vert = (i: number) => (index ? index.getX(i) : i);
  const groupOf = new Int32Array(n).fill(0);
  for (const grp of g.groups)
    for (let t = grp.start / 3; t < (grp.start + grp.count) / 3 && t < n; t++)
      groupOf[t] = grp.materialIndex ?? 0;
  return { n, vert, groupOf };
};

/** a room as the bake is given it: its group in the scene, and its
    windows' openings in the group's own frame */
export type GiRoomIn = { id: string; group: Object3D; windows: GiWindow[] };

/** a room's floor in plan (x, z triangles, world) and its height */
export type GiFloor = { id: string; tris: number[]; y0: number; y1: number };

const inTri = (x: number, z: number, t: number[], o: number) => {
  const ax = t[o]!;
  const az = t[o + 1]!;
  const bx = t[o + 2]!;
  const bz = t[o + 3]!;
  const cx = t[o + 4]!;
  const cz = t[o + 5]!;
  const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
  const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
  const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};
/** the distance in plan from a point to a triangle's edges */
const edgeDist = (x: number, z: number, t: number[], o: number) => {
  let best = Infinity;
  for (let e = 0; e < 3; e++) {
    const ax = t[o + e * 2]!;
    const az = t[o + e * 2 + 1]!;
    const bx = t[o + ((e + 1) % 3) * 2]!;
    const bz = t[o + ((e + 1) % 3) * 2 + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l = dx * dx + dz * dz || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l));
    best = Math.min(best, Math.hypot(ax + dx * k - x, az + dz * k - z));
  }
  return best;
};

/** the room a point stands in (over its floor, between its floor and
    its ceiling), or the nearest within `NEAR`, or none */
export const roomAt = (floors: GiFloor[], p: V3): string | null => {
  let near: string | null = null;
  let nd = NEAR;
  for (const f of floors) {
    if (p[1] < f.y0 - NEAR || p[1] > f.y1 + 0.02) continue;
    const inside = p[1] >= f.y0 - 0.02;
    for (let o = 0; o < f.tris.length; o += 6) {
      if (inside && inTri(p[0], p[2], f.tris, o)) return f.id;
      const d = edgeDist(p[0], p[2], f.tris, o);
      if (d < nd) {
        nd = d;
        near = f.id;
      }
    }
  }
  return near;
};

/** a triangle's centre and normal */
const frame = (p: ArrayLike<number>) => {
  const e1 = [p[3]! - p[0]!, p[4]! - p[1]!, p[5]! - p[2]!];
  const e2 = [p[6]! - p[0]!, p[7]! - p[1]!, p[8]! - p[2]!];
  const n: V3 = [
    e1[1]! * e2[2]! - e1[2]! * e2[1]!,
    e1[2]! * e2[0]! - e1[0]! * e2[2]!,
    e1[0]! * e2[1]! - e1[1]! * e2[0]!,
  ];
  const l = Math.hypot(...n) || 1;
  return {
    c: [
      (p[0]! + p[3]! + p[6]!) / 3,
      (p[1]! + p[4]! + p[7]!) / 3,
      (p[2]! + p[5]! + p[8]!) / 3,
    ] as V3,
    n: [n[0] / l, n[1] / l, n[2] / l] as V3,
  };
};
/** the room a shell face looks into */
const roomOfFace = (floors: GiFloor[], p: ArrayLike<number>) => {
  const { c, n } = frame(p);
  return roomAt(floors, [
    c[0] + n[0] * OFF,
    c[1] + n[1] * OFF,
    c[2] + n[2] * OFF,
  ]);
};

const BOX_FACES = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 5, 7, 3],
] as const;

/** a triangle of the flat, world, with its colour and, for a shell
    surface's, the room whose light it takes */
type Tri = { p: number[]; a: V3; room: string | null; shell: boolean };

export type GiPlaced = {
  /** the job, short of the light (GiBake adds it) */
  job: Omit<GiJob, "sky" | "sun" | "away" | "rays" | "bounces" | "lamps">;
  lamps: GiLamp[];
  charts: GiChart[];
  /** the room's box, world, m */
  box: { lo: V3; hi: V3 };
};
export type GiFlat = {
  rooms: Map<string, GiPlaced>;
  /** every shell mesh, for its light's coordinates once baked */
  shells: Mesh[];
  floors: GiFloor[];
};

const v = new Vector3();
/** the flat's frame from the scene's: the scene is laid about the active
    room's middle, so a change of room moves every group; the bake works
    in the flat's own frame, where a room switch moves nothing */
const shift = new Vector3();
/** a point of a mesh (or the vector `v` already set) into the flat's
    frame */
const toFlat = (m: Object3D["matrixWorld"], p: Vector3) =>
  p.applyMatrix4(m).add(shift);

/** each room's floor in plan and its height, from its Floor and its
    Ceiling */
const floorsOf = (rooms: GiRoomIn[]) => {
  const floors: GiFloor[] = [];
  for (const r of rooms) {
    r.group.updateWorldMatrix(true, true);
    const f: GiFloor = { id: r.id, tris: [], y0: Infinity, y1: -Infinity };
    r.group.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const name = nameOf(mesh, r.group);
      if (name !== "Floor" && name !== "Ceiling") return;
      const g = mesh.geometry;
      const pos = g.getAttribute("position");
      const { n, vert } = triangles(g);
      for (let t = 0; t < n; t++)
        for (let c = 0; c < 3; c++) {
          toFlat(mesh.matrixWorld, v.fromBufferAttribute(pos, vert(t * 3 + c)));
          if (name === "Floor") {
            f.tris.push(v.x, v.z);
            f.y0 = Math.min(f.y0, v.y);
          } else f.y1 = Math.max(f.y1, v.y);
        }
    });
    if (!f.tris.length) continue;
    if (!Number.isFinite(f.y1)) f.y1 = f.y0 + 2.6;
    floors.push(f);
  }
  return floors;
};

/** a mesh the bake leaves out of the light: the small things set in
    rows (books), which count for little; the helpers; and a piece's
    footprint, its own bake's shadow on the floor (GiBake's room
    signature leaves out the same, or every piece's bake arriving would
    change its room's signature and bake the room again) */
export const bakeIgnores = (mesh: Mesh) => {
  if ((mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh)
    return true;
  const ud = mesh.userData as { export?: string; name?: string };
  // a window's drawn outside is the picture of what the bake's sky
  // stands for: opaque, a hand's width past the glass, it caught every
  // ray that left by a window, so no sun came in and the sky came back
  // as a dim grey wall
  return (
    ud.export === "helper" || ud.export === "outlook" || ud.name === "Footprint"
  );
};

/** a room's signature: where its meshes stand and their colours, and
    its lamps, each once, and a loaded model (its anchor marked
    `giItem`, Furniture3D.tsx) once where it stands, so a change of copy
    as the camera comes nearer, the two seen at once while one fades to
    the other, or the model taking its stand-in's place bakes nothing
    again; as one hash (FNV-1a) over them in order */
export const roomSignature = (group: Object3D, from: V3, extra: number) => {
  const seen = new Set<string>();
  const r = (x: number) => Math.round(x * 100);
  const walk = (o: Object3D) => {
    const l = o as Object3D & { isLight?: boolean; intensity?: number };
    const e = o.matrixWorld.elements;
    const at = `${r(e[12]! + from[0])},${r(e[13]! + from[1])},${r(e[14]! + from[2])}`;
    // a loaded model counts once, by where its item stands: its near
    // and far copies are scaled and placed apart inside it, and its
    // stand-in gives way to it, none of which moves the item
    if ((o.userData as { giItem?: boolean }).giItem) {
      seen.add(`I${at},${r(e[0]!)},${r(e[2]!)}`);
      return;
    }
    if (l.isLight) seen.add(`L${at},${r(l.intensity ?? 0)}`);
    else {
      const m = o as Mesh;
      if (m.isMesh && !bakeIgnores(m)) {
        const mat = Array.isArray(m.material) ? m.material[0] : m.material;
        const c = (mat as { color?: Color } | undefined)?.color;
        seen.add(`${at},${r(e[0]!)},${r(e[2]!)},${c ? c.getHex() : -1}`);
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(group);
  let h = 0x811c9dc5;
  for (const k of [...seen].sort()) {
    for (let i = 0; i < k.length; i++) {
      h ^= k.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  h ^= Math.round(extra * 100) | 0;
  return Math.imul(h, 0x01000193) >>> 0;
};

/** the flat's triangles, each room's job, and the shell's meshes, as
    the scene stands */
export const collectFlat = (
  rooms: GiRoomIn[],
  density: number,
  side: number,
  /** from the scene's frame to the flat's, m */
  from: V3 = [0, 0, 0],
): GiFlat => {
  shift.set(...from);
  const floors = floorsOf(rooms);
  const tris: Tri[] = [];
  const shells: Mesh[] = [];
  const lampsOf = new Map<string, GiLamp[]>();
  for (const r of rooms) {
    const lamps: GiLamp[] = [];
    lampsOf.set(r.id, lamps);
    r.group.traverse((o) => {
      const light = o as PointLight;
      if (light.isPointLight) {
        if (light.intensity <= 0) return;
        const at = light.getWorldPosition(new Vector3()).add(shift);
        lamps.push({
          at: [at.x, at.y, at.z],
          intensity: [
            light.color.r * light.intensity,
            light.color.g * light.intensity,
            light.color.b * light.intensity,
          ],
          reach: light.distance || 8,
        });
        return;
      }
      const mesh = o as Mesh & { isInstancedMesh?: boolean };
      if (!mesh.isMesh || !mesh.geometry?.getAttribute("position")) return;
      if (bakeIgnores(mesh)) return;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (mats.every((m) => !m || clear(m))) return;
      const name = nameOf(mesh, r.group);
      if (name === STUB) return;
      const shell = RECEIVES.has(name);
      const g = mesh.geometry;
      const { n, vert, groupOf } = triangles(g);
      const pos = g.getAttribute("position");
      if (!shell && n > MESH_TRIS) {
        // its box, turned as the mesh is
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox!;
        const cs: V3[] = [];
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              toFlat(mesh.matrixWorld, v.set(x, y, z));
              cs.push([v.x, v.y, v.z]);
            }
        const a = albedoOf(mesh, mats[0]);
        for (const [p, q, s, w] of BOX_FACES)
          for (const [i, j, k] of [
            [p, q, s],
            [p, s, w],
          ] as const)
            tris.push({
              p: [...cs[i]!, ...cs[j]!, ...cs[k]!],
              a,
              room: null,
              shell: false,
            });
        return;
      }
      let any = false;
      for (let t = 0; t < n; t++) {
        const m = mats[groupOf[t]!] ?? mats[0];
        if (!m || clear(m)) continue;
        const p: number[] = [];
        for (let c = 0; c < 3; c++) {
          toFlat(mesh.matrixWorld, v.fromBufferAttribute(pos, vert(t * 3 + c)));
          p.push(v.x, v.y, v.z);
        }
        tris.push({
          p,
          a: albedoOf(mesh, m),
          room: shell ? roomOfFace(floors, p) : null,
          shell,
        });
        any ||= shell;
      }
      if (any) shells.push(mesh);
    });
  }
  // each room's job: what stands within its reach, its faces charted
  const placed = new Map<string, GiPlaced>();
  for (const r of rooms) {
    const f = floors.find((x) => x.id === r.id);
    if (!f) continue;
    const lo: V3 = [Infinity, f.y0, Infinity];
    const hi: V3 = [-Infinity, f.y1, -Infinity];
    for (let o = 0; o < f.tris.length; o += 2) {
      lo[0] = Math.min(lo[0], f.tris[o]!);
      hi[0] = Math.max(hi[0], f.tris[o]!);
      lo[2] = Math.min(lo[2], f.tris[o + 1]!);
      hi[2] = Math.max(hi[2], f.tris[o + 1]!);
    }
    const within = (p: number[]) => {
      const { c } = frame(p);
      return [0, 1, 2].every(
        (a) => c[a]! > lo[a]! - REACH && c[a]! < hi[a]! + REACH,
      );
    };
    const mine = tris.filter((t) => t.room === r.id || within(t.p));
    const all = new Float32Array(mine.length * 9);
    const albedo = new Float32Array(mine.length * 3);
    const recv: number[] = [];
    mine.forEach((t, i) => {
      all.set(t.p, i * 9);
      albedo.set(t.a, i * 3);
      if (t.shell && t.room === r.id) recv.push(i);
    });
    if (!recv.length) continue;
    let lay: ReturnType<typeof layoutGi>;
    try {
      lay = layoutGi(all, recv, density, side);
    } catch (error) {
      // a room the atlas cannot hold keeps its live light
      console.warn(`The bounce bake left out room ${r.id}.`, error);
      continue;
    }
    // the windows, from the group's frame to the world's
    const m = r.group.matrixWorld;
    const point = (p: V3): V3 => {
      toFlat(m, v.set(...p));
      return [v.x, v.y, v.z];
    };
    const step = (d: V3): V3 => {
      v.set(...d)
        .transformDirection(m)
        .multiplyScalar(Math.hypot(...d));
      return [v.x, v.y, v.z];
    };
    placed.set(r.id, {
      job: {
        tris: all,
        albedo,
        chart: lay.chart,
        charts: lay.charts,
        size: lay.size,
        windows: r.windows.map((w) => ({
          o: point(w.o),
          u: step(w.u),
          v: step(w.v),
        })),
      },
      lamps: lampsOf.get(r.id) ?? [],
      charts: lay.charts,
      box: { lo, hi },
    });
  }
  return { rooms: placed, shells, floors };
};

/** where a room's light lies: its slot, its charts and its atlas */
export type GiPlace = {
  slot: number;
  charts: GiChart[];
  size: [number, number];
};

/**
 * A shell geometry's place in the light's texture: each triangle's
 * vertices on the chart of its plane in the room it faces into (the
 * nearest chart by facing and distance, so a face a wall's other
 * variant adds, an end shown whole, still reads the light of the face
 * it stands beside), and the room's slot; −1 for a face that looks into
 * no baked room (lit as outdoors). Written as `giuv` (three keeps a
 * shader for each set of a geometry's attributes, so the bake's way of
 * lighting starts with it). Not written, and false, while a room it
 * faces into has no bake yet.
 */
export const applyGiUv = (
  mesh: Mesh,
  g: BufferGeometry,
  floors: GiFloor[],
  places: Map<string, GiPlace>,
  layer: number,
  /** from the scene's frame to the flat's, m (as the bake was given) */
  from: V3 = [0, 0, 0],
) => {
  shift.set(...from);
  mesh.updateWorldMatrix(true, false);
  const pos = g.getAttribute("position");
  const { n, vert } = triangles(g);
  const uv = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) uv[i * 3 + 2] = -1;
  const p = new Array<number>(9).fill(0);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      toFlat(mesh.matrixWorld, v.fromBufferAttribute(pos, vert(t * 3 + k)));
      p[k * 3] = v.x;
      p[k * 3 + 1] = v.y;
      p[k * 3 + 2] = v.z;
    }
    const id = roomOfFace(floors, p);
    const place = id ? places.get(id) : undefined;
    // a face of a room not yet baked: the mesh keeps its live light
    // until it is
    if (id && !place) return false;
    if (!place || !place.charts.length) continue;
    const f = frame(p);
    const d = f.n[0] * p[0]! + f.n[1] * p[1]! + f.n[2] * p[2]!;
    let best = 0;
    let score = -Infinity;
    place.charts.forEach((ch, i) => {
      const facing = ch.n[0] * f.n[0] + ch.n[1] * f.n[1] + ch.n[2] * f.n[2];
      const dist = Math.abs(
        ch.n[0] * ch.o[0] + ch.n[1] * ch.o[1] + ch.n[2] * ch.o[2] - d,
      );
      const s = facing * 10 - dist;
      if (s > score) {
        score = s;
        best = i;
      }
    });
    const ch = place.charts[best]!;
    const { size } = place;
    // held within the chart, a half texel in from its edge
    const lo = [(ch.x + 0.5) / size[0], (ch.y + 0.5) / size[1]] as const;
    const hi = [
      (ch.x + ch.w - 0.5) / size[0],
      (ch.y + ch.h - 0.5) / size[1],
    ] as const;
    for (let k = 0; k < 3; k++) {
      const vi = vert(t * 3 + k);
      let [u, w] = atlasUv(ch, size, [p[k * 3]!, p[k * 3 + 1]!, p[k * 3 + 2]!]);
      u = Math.min(hi[0], Math.max(lo[0], u));
      w = Math.min(hi[1], Math.max(lo[1], w));
      // the atlas sits in the corner of its layer, texel for texel
      uv[vi * 3] = (u * size[0]) / layer;
      uv[vi * 3 + 1] = (w * size[1]) / layer;
      uv[vi * 3 + 2] = place.slot;
    }
  }
  g.setAttribute("giuv", new BufferAttribute(uv, 3));
  return true;
};
