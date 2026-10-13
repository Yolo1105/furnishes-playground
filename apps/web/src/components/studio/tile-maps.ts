import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

/**
 * Ceramic tiles as an HDB kitchen and bathroom have them: 300 × 600 mm
 * on the walls, laid long side level, 600 × 600 on the floor, each tile
 * a hair off its neighbour in tone and gloss (no two from a box quite
 * match), set in 2 mm grout lines that sit a little back from the
 * tiles' faces, so the light catches the tiles' rounded edges and the
 * grout lies in their shade. Three maps painted on canvases: the colour
 * (sRGB), the normal (the tiles' edges rolling into the joint, OpenGL
 * convention) and the roughness (the glaze smooth, the grout matt).
 * One repeat of the maps covers `across` × `up` tiles; the studio's own
 * work, no third-party file.
 */

export type TileSpec = {
  /** a tile's size, m: along, up */
  tile: readonly [number, number];
  /** the joint, m */
  grout: number;
  /** the glaze and the grout, sRGB */
  colour: string;
  groutColour: string;
  /** how far apart in tone one tile may be from the next, a share */
  spread: number;
  /** each row shifted along by this share of a tile (a running bond) */
  bond: number;
};

export const WALL_TILE: TileSpec = {
  tile: [0.6, 0.3],
  grout: 0.002,
  colour: "#f1efea",
  groutColour: "#c9c4ba",
  spread: 0.025,
  bond: 0,
};
export const FLOOR_TILE: TileSpec = {
  tile: [0.6, 0.6],
  grout: 0.002,
  colour: "#d8d3ca",
  groutColour: "#a9a296",
  spread: 0.03,
  bond: 0,
};

/** tiles across and up one repeat of the maps, and its pixels a metre */
const REPEAT = { across: 4, up: 4 } as const;
const PX_PER_M = 420;
/** how far the tile's edge rolls into the joint, m */
const ROLL = 0.003;

const rng = (seed: number) => {
  let n = seed >>> 0 || 1;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
};

const rgb = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
};

export type TileMaps = {
  map: CanvasTexture;
  normalMap: CanvasTexture;
  roughnessMap: CanvasTexture;
  /** the stretch, m, one repeat of the maps covers: along, up */
  size: readonly [number, number];
};

const made = new Map<string, TileMaps>();

/** the maps for a spec, seeded, made once and shared */
export const tileMaps = (spec: TileSpec, seed = 1): TileMaps => {
  const key = `${JSON.stringify(spec)}|${seed}`;
  const had = made.get(key);
  if (had) return had;
  const [tw, th] = spec.tile;
  const sizeM = [tw * REPEAT.across, th * REPEAT.up] as const;
  const W = Math.round(sizeM[0] * PX_PER_M);
  const H = Math.round(sizeM[1] * PX_PER_M);
  const canvas = (w: number, h: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const colour = canvas(W, H);
  const normal = canvas(W, H);
  const rough = canvas(W, H);
  const cg = colour.getContext("2d")!;
  const ng = normal.getContext("2d")!;
  const rg = rough.getContext("2d")!;
  const c = cg.createImageData(W, H);
  const n = ng.createImageData(W, H);
  const r = rg.createImageData(W, H);
  const next = rng(seed * 7919 + 13);
  // each tile's own tone and gloss
  const tones = Array.from({ length: REPEAT.across * REPEAT.up }, () => ({
    tone: 1 + (next() - 0.5) * 2 * spec.spread,
    gloss: 0.12 + next() * 0.06,
  }));
  const glaze = rgb(spec.colour);
  const grout = rgb(spec.groutColour);
  const g = spec.grout / 2;
  for (let y = 0; y < H; y++) {
    const ym = (y + 0.5) / PX_PER_M;
    const row = Math.floor(ym / th);
    const inY = ym - row * th;
    for (let x = 0; x < W; x++) {
      const shift = (row % 2) * spec.bond * tw;
      const xm = ((x + 0.5) / PX_PER_M - shift + sizeM[0]) % sizeM[0];
      const col = Math.floor(xm / tw);
      const inX = xm - col * tw;
      // distance to the tile's nearest edge, and which way it lies
      const dl = inX;
      const dr = tw - inX;
      const db = inY;
      const dt = th - inY;
      const edge = Math.min(dl, dr, db, dt);
      const i = (y * W + x) * 4;
      const t =
        tones[(row % REPEAT.up) * REPEAT.across + (col % REPEAT.across)]!;
      if (edge < g) {
        // the joint: matt grout, set back, flat
        c.data[i] = grout[0];
        c.data[i + 1] = grout[1];
        c.data[i + 2] = grout[2];
        n.data[i] = 128;
        n.data[i + 1] = 128;
        n.data[i + 2] = 255;
        r.data[i] = r.data[i + 1] = r.data[i + 2] = 235;
      } else {
        // the glaze; within ROLL of the edge it rolls down into the
        // joint, the normal turning towards it
        const roll = Math.max(0, 1 - (edge - g) / ROLL);
        const shade = t.tone * (1 - roll * 0.06);
        c.data[i] = Math.min(255, glaze[0] * shade);
        c.data[i + 1] = Math.min(255, glaze[1] * shade);
        c.data[i + 2] = Math.min(255, glaze[2] * shade);
        let nx = 0;
        let ny = 0;
        if (roll > 0) {
          const s = Math.sin(roll * Math.PI * 0.45);
          if (edge === dl) nx = -s;
          else if (edge === dr) nx = s;
          else if (edge === db) ny = s;
          else ny = -s;
        }
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        n.data[i] = Math.round((nx * 0.5 + 0.5) * 255);
        n.data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        n.data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        r.data[i] = r.data[i + 1] = r.data[i + 2] = Math.round(t.gloss * 255);
      }
      c.data[i + 3] = n.data[i + 3] = r.data[i + 3] = 255;
    }
  }
  cg.putImageData(c, 0, 0);
  ng.putImageData(n, 0, 0);
  rg.putImageData(r, 0, 0);
  const tex = (el: HTMLCanvasElement, srgb: boolean) => {
    const t = new CanvasTexture(el);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    return t;
  };
  const out: TileMaps = {
    map: tex(colour, true),
    normalMap: tex(normal, false),
    roughnessMap: tex(rough, false),
    size: sizeM,
  };
  made.set(key, out);
  return out;
};
