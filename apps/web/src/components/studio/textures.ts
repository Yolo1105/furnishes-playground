import {
  CanvasTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import type { Floor } from "./room-data";

/**
 * Surfaces made from noise rather than image files, each a set of three
 * maps painted together from one height field: the colour, the normals
 * (the light caught along the grain, the weave or the plaster) and the
 * roughness that follows the height, so a flat panel reads as a
 * material rather than paint. Wood is grown from rings that drift along
 * the grain with fine pores between them; the floor lays that wood in
 * boards, each its own tone and cut, with a bevelled seam between; cloth
 * is a plain weave with its fuzz; plaster a fine, even grain. The wood
 * and the cloth are painted once as light values and take their colour
 * from the material, so one map serves every colour of the palette; a
 * floor is painted in its own colour. A tile covers a fixed stretch and
 * repeats; a deterministic noise keeps a surface the same every time.
 */
/** a floor tile's stretch, m: long enough for a plank */
export const TILE_M = 2.4;
/** a floor tile's side, px */
const FLOOR_PX = 1024;
/** a panel's wood tile, m */
export const WOOD_M = 1.2;
/** a cloth tile, m */
export const CLOTH_M = 0.4;
/** a plaster tile, m */
export const PLASTER_M = 1;

/** a surface's three maps, sharing their wrap and repeat */
export type Surface = {
  map: CanvasTexture;
  normalMap: CanvasTexture;
  roughnessMap: CanvasTexture;
};
export type Relief = Pick<Surface, "normalMap" | "roughnessMap">;

const kept = new Map<string, Surface>();
const reliefs = new Map<CanvasTexture, Relief>();

/** a hex colour lightened (dl > 0) or darkened (dl < 0), with its hue kept */
export const shade = (hex: string, dl: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + dl * 255)));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

/* ---------- noise ---------- */

/** a lattice point's value in 0..1, the same for the same point */
const hash = (x: number, y: number, seed: number) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
/** value noise at a point in lattice units, wrapping every `px` cells
    along x and `py` along y, so a tile meets itself */
const noise2 = (x: number, y: number, px: number, py: number, seed: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const x0 = ((xi % px) + px) % px;
  const x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py;
  const y1 = (y0 + 1) % py;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
};
/** fractal noise in 0..1 over the unit tile, `fx` cells across it and
    `fy` up it at the coarsest octave, each octave twice as fine */
const fbm = (
  u: number,
  v: number,
  fx: number,
  fy: number,
  seed: number,
  octaves = 3,
) => {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let px = fx;
  let py = fy;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(u * px, v * py, px, py, seed + o * 101);
    total += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / total;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---------- the painters ---------- */

/** one point of a surface: how light it is (1 the material's own
    colour), its height (about 0, in the relief's units) and roughness */
type Point = { lum: number; height: number; rough: number };
type Paint = (u: number, v: number) => Point;

/** how a wood is figured: the growth rings across the tile, how far
    they drift along the grain, and how dark the latewood stands */
type Figure = { rings: number; drift: number; contrast: number };
/** a panel's veneer: broad rings that wander, a cathedral figure */
const VENEER: Figure = { rings: 44, drift: 1.1, contrast: 0.12 };
/** a floorboard: narrow rings running straight along the plank */
const PLANK: Figure = { rings: 64, drift: 0.5, contrast: 0.06 };
/** wood at a point of the tile: rings that drift along the grain (u),
    fine pores between, a slow figure over all; the latewood sits lower,
    darker and a little rougher */
const woodAt = (u: number, v: number, seed: number, f: Figure): Point => {
  const drift = fbm(u, v, 2, 1, seed, 3) - 0.5;
  const sway = fbm(u, v, 1, 3, seed + 7, 2) - 0.5;
  const phase = v * f.rings + drift * f.drift + sway * 0.3 * f.drift;
  const ring = Math.pow(0.5 + 0.5 * Math.sin(phase * Math.PI * 2), 3);
  const pores = fbm(u, v, 6, 128, seed + 11, 3) - 0.5;
  const figure = fbm(u, v, 3, 2, seed + 23, 3) - 0.5;
  return {
    lum: clamp01(0.98 - f.contrast * ring - 0.08 * pores - 0.07 * figure),
    height: -0.5 * ring + 0.6 * pores + 0.15 * figure,
    rough: clamp01(0.52 + 0.2 * ring + 0.12 * pores),
  };
};

/** a plain weave: threads crossing both ways, with its fuzz */
const THREADS = 110;
const clothAt = (u: number, v: number, seed: number): Point => {
  const a = Math.sin(u * THREADS * Math.PI);
  const b = Math.sin(v * THREADS * Math.PI);
  const weave = (a * a + b * b) / 2;
  const fuzz = fbm(u, v, 12, 12, seed, 3) - 0.5;
  const slub = fbm(u, v, 3, 40, seed + 5, 2) - 0.5;
  return {
    lum: clamp01(0.93 + 0.1 * (weave - 0.5) + 0.07 * fuzz + 0.04 * slub),
    height: 0.6 * weave + 0.35 * fuzz,
    rough: clamp01(0.9 - 0.08 * (weave - 0.5) + 0.05 * fuzz),
  };
};

/** plaster: a fine, even grain over a slow unevenness */
const plasterAt = (u: number, v: number, seed: number): Point => {
  const fine = fbm(u, v, 40, 40, seed, 3) - 0.5;
  const slow = fbm(u, v, 3, 3, seed + 9, 3) - 0.5;
  return {
    lum: clamp01(1 - 0.05 * fine - 0.03 * slow),
    height: 0.4 * fine + 0.5 * slow,
    rough: clamp01(0.9 + 0.06 * fine),
  };
};

/** the surface's maps painted at `size` px square: the colour (the
    light values tinted by `tint`, or the values alone when the material
    tints them), the normals from the height and the roughness; `relief`
    is how far the height bends the light */
const paintSurface = (
  size: number,
  tint: string | null,
  relief: number,
  paint: Paint,
): Surface => {
  const n = size * size;
  const lum = new Float32Array(n);
  const height = new Float32Array(n);
  const rough = new Float32Array(n);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = paint(x / size, y / size);
      const i = y * size + x;
      lum[i] = p.lum;
      height[i] = p.height;
      rough[i] = p.rough;
    }
  const canvas = () => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    return { c, ctx, data: ctx.createImageData(size, size) };
  };
  const colour = canvas();
  const normal = canvas();
  const roughness = canvas();
  const t = tint ? parseInt(tint.slice(1), 16) : 0xffffff;
  const tr = t >> 16;
  const tg = (t >> 8) & 255;
  const tb = t & 255;
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = i * 4;
      const l = lum[i]!;
      colour.data.data[o] = Math.round(tr * l);
      colour.data.data[o + 1] = Math.round(tg * l);
      colour.data.data[o + 2] = Math.round(tb * l);
      colour.data.data[o + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * relief;
      const dy = (at(x, y + 1) - at(x, y - 1)) * relief;
      const len = Math.hypot(dx, dy, 1);
      normal.data.data[o] = Math.round((-dx / len) * 127.5 + 127.5);
      normal.data.data[o + 1] = Math.round((-dy / len) * 127.5 + 127.5);
      normal.data.data[o + 2] = Math.round((1 / len) * 127.5 + 127.5);
      normal.data.data[o + 3] = 255;
      const r = Math.round(rough[i]! * 255);
      roughness.data.data[o] = r;
      roughness.data.data[o + 1] = r;
      roughness.data.data[o + 2] = r;
      roughness.data.data[o + 3] = 255;
    }
  colour.ctx.putImageData(colour.data, 0, 0);
  normal.ctx.putImageData(normal.data, 0, 0);
  roughness.ctx.putImageData(roughness.data, 0, 0);
  const make = (c: HTMLCanvasElement, colorSpace: string) => {
    const tex = new CanvasTexture(c);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.colorSpace = colorSpace;
    tex.anisotropy = 8;
    return tex;
  };
  // light values alone are not a colour: the material's colour is
  // multiplied by them as they are
  const s: Surface = {
    map: make(colour.c, tint ? SRGBColorSpace : NoColorSpace),
    normalMap: make(normal.c, NoColorSpace),
    roughnessMap: make(roughness.c, NoColorSpace),
  };
  reliefs.set(s.map, { normalMap: s.normalMap, roughnessMap: s.roughnessMap });
  return s;
};

const surface = (
  key: string,
  size: number,
  tint: string | null,
  relief: number,
  paint: Paint,
) => {
  const had = kept.get(key);
  if (had) return had;
  const s = paintSurface(size, tint, relief, paint);
  kept.set(key, s);
  return s;
};

/** the relief that goes with a surface's colour map */
export const reliefOf = (map: CanvasTexture): Relief => {
  const had = reliefs.get(map);
  if (!had) throw new Error("not a painted surface");
  return had;
};

/** wood grain as light values, the grain along u: one for every colour */
export const woodSurface = () =>
  surface("wood", 768, null, 2.2, (u, v) => woodAt(u, v, 11, VENEER));

/** a plain weave as light values */
export const clothSurface = () =>
  surface("cloth", 512, null, 2.5, (u, v) => clothAt(u, v, 31));

/** plaster as light values, for the walls */
export const plasterSurface = () =>
  surface("plaster", 512, null, 1.2, (u, v) => plasterAt(u, v, 41));

/** boards of a size laid in staggered rows, each wood cut from its own
    place with its own tone, a bevelled seam between */
const boardsAt = (
  u: number,
  v: number,
  size: number,
  boardW: number,
  boardL: number,
  seed: number,
): Point => {
  const rows = Math.max(1, Math.round(1 / boardW));
  const cols = Math.max(1, Math.round(1 / boardL));
  const bw = 1 / rows;
  const bl = 1 / cols;
  const r = Math.floor(v / bw);
  const off = ((r % 3) * bl) / 3;
  // along the row, from the row's own start, wrapped to the tile
  const along = (((u - off) % 1) + 1) % 1;
  const k = Math.floor(along / bl);
  const tone = (hash(k, r, seed) - 0.5) * 0.1;
  const du = hash(k, r, seed + 1);
  const dv = hash(k, r, seed + 2);
  // each plank cut from its own place in the wood, the rings along it
  const p = woodAt((u + du) % 1, (v + dv) % 1, seed, PLANK);
  // the seam: how far, px, to the board's nearest edge
  const lu = along - k * bl;
  const lv = v - r * bw;
  const e = Math.min(lu, bl - lu, lv, bw - lv) * size;
  const seam = e < 1.5 ? 1 : e < 5 ? (5 - e) / 3.5 : 0;
  return {
    lum: clamp01(p.lum + tone - 0.2 * seam),
    height: p.height - 1.8 * seam,
    rough: clamp01(p.rough + 0.2 * seam),
  };
};

/** the floor of a kind in its tone: planks, tiles, boards or a screed */
export const floorTexture = (floor: Floor, hex: string) => {
  const key = `floor:${floor}:${hex}`;
  // board sizes as a share of the tile: parquet strips 90 mm by 600,
  // vinyl planks 180 mm by 1.2 m
  if (floor === "Parquet")
    return surface(key, FLOOR_PX, hex, 2.5, (u, v) =>
      boardsAt(u, v, FLOOR_PX, 0.09 / TILE_M, 0.6 / TILE_M, 7),
    ).map;
  if (floor === "Vinyl")
    return surface(key, FLOOR_PX, hex, 2.5, (u, v) =>
      boardsAt(u, v, FLOOR_PX, 0.18 / TILE_M, 1.2 / TILE_M, 17),
    ).map;
  if (floor === "Tiles")
    return surface(key, FLOOR_PX, hex, 2, (u, v) => {
      const t = 0.6 / TILE_M; // 600 mm tiles
      const eu = Math.min(u % t, t - (u % t)) * FLOOR_PX;
      const ev = Math.min(v % t, t - (v % t)) * FLOOR_PX;
      const e = Math.min(eu, ev);
      const grout = e < 2 ? 1 : e < 4 ? (4 - e) / 2 : 0;
      const speck = fbm(u, v, 24, 24, 19, 3) - 0.5;
      const cloud = fbm(u, v, 3, 3, 29, 3) - 0.5;
      return {
        lum: clamp01(1 - 0.04 * speck - 0.05 * cloud - 0.22 * grout),
        height: 0.15 * speck - 1.5 * grout,
        rough: clamp01(0.35 + 0.1 * speck + 0.5 * grout),
      };
    }).map;
  return surface(key, FLOOR_PX, hex, 2, (u, v) => {
    const mottle = fbm(u, v, 5, 5, 37, 3) - 0.5;
    const fine = fbm(u, v, 48, 48, 47, 3) - 0.5;
    return {
      lum: clamp01(1 - 0.12 * mottle - 0.05 * fine),
      height: 0.6 * fine + 0.3 * mottle,
      rough: clamp01(0.88 + 0.08 * fine),
    };
  }).map;
};
