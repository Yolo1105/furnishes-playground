/**
 * Surfaces grown from noise, as the maps a material is drawn with: the
 * colour, the normals (the light caught along the grain, the weave or
 * the plaster) and the roughness, all read from one height field. Wood
 * is grown from rings that drift along the grain with fine pores
 * between them; a floor lays that wood in planks, each its own tone and
 * cut, with a bevelled seam between, or tiles with grout, or a screed;
 * cloth is a plain weave with its fuzz; plaster a fine, even grain. The
 * wood and the cloth are painted as light values and take their colour
 * from the material, so one map serves every colour of the palette; a
 * floor is painted in its own colour. A deterministic noise keeps a
 * surface the same every time, and it wraps, so a tile meets itself.
 *
 * Pure arithmetic, no document: painted in a worker (surface.worker.ts)
 * so the studio never waits on it, and made into textures by
 * textures.ts.
 */

/** a floor tile's stretch, m: long enough for a plank */
export const TILE_M = 2.4;
/** a panel's wood tile, m */
export const WOOD_M = 1.2;
/** a cloth tile, m */
export const CLOTH_M = 0.4;
/** a plaster tile, m */
export const PLASTER_M = 1;

export type SurfaceKind =
  "wood" | "cloth" | "plaster" | "parquet" | "vinyl" | "tiles" | "concrete";

/** what to paint: the kind, the tile's side in px, the tint the floors
    are painted in (null for light values), and how far the height
    bends the light */
export type SurfaceSpec = {
  kind: SurfaceKind;
  size: number;
  tint: string | null;
  relief: number;
};
/** the maps painted, each RGBA over size × size */
export type SurfaceMaps = {
  size: number;
  colour: Uint8ClampedArray;
  normal: Uint8ClampedArray;
  rough: Uint8ClampedArray;
};

/** the tile each kind is painted at, px, and how it is painted */
export const SPEC: Record<SurfaceKind, Omit<SurfaceSpec, "kind" | "tint">> = {
  wood: { size: 768, relief: 2.2 },
  cloth: { size: 512, relief: 2.5 },
  plaster: { size: 512, relief: 1.2 },
  parquet: { size: 1024, relief: 2.5 },
  vinyl: { size: 1024, relief: 2.5 },
  tiles: { size: 1024, relief: 2 },
  concrete: { size: 1024, relief: 2 },
};
/** the stretch one tile of a kind covers, m */
export const TILE_OF: Record<SurfaceKind, number> = {
  wood: WOOD_M,
  cloth: CLOTH_M,
  plaster: PLASTER_M,
  parquet: TILE_M,
  vinyl: TILE_M,
  tiles: TILE_M,
  concrete: TILE_M,
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
type Point = {
  lum: number;
  height: number;
  rough: number;
  /** how far the point leans warm (towards the latewood's red-brown),
      0 for the tint alone */
  warm?: number;
};
type Paint = (u: number, v: number) => Point;

/** how a wood is figured: the growth rings across the tile, how far
    they drift along the grain (the cathedral of a flat-cut face), how
    unevenly they are spaced, and how dark the latewood stands */
type Figure = {
  rings: number;
  drift: number;
  uneven: number;
  contrast: number;
};
/** a panel's veneer: fine rings, a wide cathedral, well spaced */
const VENEER: Figure = { rings: 110, drift: 2.4, uneven: 0.4, contrast: 0.1 };
/** a floorboard: narrow rings running straight along the plank */
const PLANK: Figure = { rings: 140, drift: 0.6, uneven: 0.3, contrast: 0.06 };
/** wood at a point of the tile: rings whose spacing wanders, drifting
    along the grain (u) into the cathedral figure of a flat-cut face;
    each ring's latewood a narrow band with a sharp late edge, darker,
    lower, rougher and a little redder than the earlywood; fine pores
    between, a slow figure over all */
const woodAt = (u: number, v: number, seed: number, f: Figure): Point => {
  const drift = fbm(u, v, 2, 1, seed, 3) - 0.5;
  const sway = fbm(u, v, 1, 3, seed + 7, 2) - 0.5;
  // the spacing: a slow noise along the rings stretches and crowds them
  const spacing = (fbm(u, v, 1, 5, seed + 3, 2) - 0.5) * f.uneven * f.rings;
  const phase = v * f.rings + spacing + drift * f.drift + sway * 0.3 * f.drift;
  const at = phase - Math.floor(phase);
  // earlywood for most of the ring, latewood at its end, sharp after
  const ring =
    smooth(clamp01((at - 0.5) / 0.3)) *
    (1 - smooth(clamp01((at - 0.86) / 0.1)));
  const pores = fbm(u, v, 6, 128, seed + 11, 3) - 0.5;
  const figure = fbm(u, v, 3, 2, seed + 23, 3) - 0.5;
  return {
    lum: clamp01(0.98 - f.contrast * ring - 0.07 * pores - 0.08 * figure),
    height: -0.5 * ring + 0.6 * pores + 0.15 * figure,
    rough: clamp01(0.5 + 0.2 * ring + 0.12 * pores),
    warm: ring * 0.8 + 0.2 * (figure + 0.5),
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

/** tiles of a size with grout between, a faint cloud and speckle */
const tilesAt = (u: number, v: number, size: number): Point => {
  const t = 0.6 / TILE_M; // 600 mm tiles
  const eu = Math.min(u % t, t - (u % t)) * size;
  const ev = Math.min(v % t, t - (v % t)) * size;
  const e = Math.min(eu, ev);
  const grout = e < 2 ? 1 : e < 4 ? (4 - e) / 2 : 0;
  const speck = fbm(u, v, 24, 24, 19, 3) - 0.5;
  const cloud = fbm(u, v, 3, 3, 29, 3) - 0.5;
  return {
    lum: clamp01(1 - 0.04 * speck - 0.05 * cloud - 0.22 * grout),
    height: 0.15 * speck - 1.5 * grout,
    rough: clamp01(0.35 + 0.1 * speck + 0.5 * grout),
  };
};

/** a screed: mottled, finely grained */
const concreteAt = (u: number, v: number): Point => {
  const mottle = fbm(u, v, 5, 5, 37, 3) - 0.5;
  const fine = fbm(u, v, 48, 48, 47, 3) - 0.5;
  return {
    lum: clamp01(1 - 0.12 * mottle - 0.05 * fine),
    height: 0.6 * fine + 0.3 * mottle,
    rough: clamp01(0.88 + 0.08 * fine),
  };
};

/** the painter of a kind at a tile size; board sizes as a share of the
    tile: parquet strips 90 mm by 600, vinyl planks 180 mm by 1.2 m */
const painterOf = (kind: SurfaceKind, size: number): Paint => {
  switch (kind) {
    case "wood":
      return (u, v) => woodAt(u, v, 11, VENEER);
    case "cloth":
      return (u, v) => clothAt(u, v, 31);
    case "plaster":
      return (u, v) => plasterAt(u, v, 41);
    case "parquet":
      return (u, v) => boardsAt(u, v, size, 0.09 / TILE_M, 0.6 / TILE_M, 7);
    case "vinyl":
      return (u, v) => boardsAt(u, v, size, 0.18 / TILE_M, 1.2 / TILE_M, 17);
    case "tiles":
      return (u, v) => tilesAt(u, v, size);
    case "concrete":
      return concreteAt;
  }
};

/** the surface's maps painted at the spec's size: the colour (the
    light values tinted, or the values alone when the material tints
    them), the normals from the height and the roughness */
export const paintMaps = (spec: SurfaceSpec): SurfaceMaps => {
  const { size, tint, relief } = spec;
  const paint = painterOf(spec.kind, size);
  const n = size * size;
  const lum = new Float32Array(n);
  const height = new Float32Array(n);
  const rough = new Float32Array(n);
  const warm = new Float32Array(n);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = paint(x / size, y / size);
      const i = y * size + x;
      lum[i] = p.lum;
      height[i] = p.height;
      rough[i] = p.rough;
      warm[i] = p.warm ?? 0;
    }
  const colour = new Uint8ClampedArray(n * 4);
  const normal = new Uint8ClampedArray(n * 4);
  const roughness = new Uint8ClampedArray(n * 4);
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
      // a warm point keeps its red and loses a little green and blue
      const wm = warm[i]!;
      colour[o] = Math.round(tr * l);
      colour[o + 1] = Math.round(tg * l * (1 - 0.06 * wm));
      colour[o + 2] = Math.round(tb * l * (1 - 0.14 * wm));
      colour[o + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * relief;
      const dy = (at(x, y + 1) - at(x, y - 1)) * relief;
      const len = Math.hypot(dx, dy, 1);
      normal[o] = Math.round((-dx / len) * 127.5 + 127.5);
      normal[o + 1] = Math.round((-dy / len) * 127.5 + 127.5);
      normal[o + 2] = Math.round((1 / len) * 127.5 + 127.5);
      normal[o + 3] = 255;
      const r = Math.round(rough[i]! * 255);
      roughness[o] = r;
      roughness[o + 1] = r;
      roughness[o + 2] = r;
      roughness[o + 3] = 255;
    }
  return { size, colour, normal, rough: roughness };
};
