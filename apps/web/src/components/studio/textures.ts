import {
  CanvasTexture,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import type { Floor } from "./room-data";

/**
 * Surfaces painted on a canvas, so the room and the pieces have grain
 * without a single image file: a floor by its kind (planks, tiles, a
 * vinyl board, a concrete screed) and wood grain in any colour of the
 * palette. Each is painted once and kept; a tile covers TILE_M metres
 * and repeats. A deterministic noise keeps a surface the same every
 * time it is painted. From each colour map a relief is read (the
 * darker grain lies lower): a normal map that catches the light along
 * the grain and a roughness map that varies with it, so a flat panel
 * stops reading as paint.
 */
export const TILE_M = 1.2;
const SIZE = 512;

const kept = new Map<string, CanvasTexture>();

/** a small, repeatable noise in 0..1 */
const noise = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

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

const texture = (key: string, paint: (c: CanvasRenderingContext2D) => void) => {
  const had = kept.get(key);
  if (had) return had;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const c = canvas.getContext("2d")!;
  paint(c);
  const t = new CanvasTexture(canvas);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  kept.set(key, t);
  return t;
};

/** fine grain along x: long strokes a little lighter and darker */
const grain = (
  c: CanvasRenderingContext2D,
  hex: string,
  rnd: () => number,
  strength: number,
  along: "x" | "y" = "x",
) => {
  for (let i = 0; i < 900; i++) {
    const p = rnd() * SIZE;
    const q = rnd() * SIZE;
    const len = 30 + rnd() * 160;
    const dark = rnd() < 0.5;
    c.strokeStyle = shade(hex, (dark ? -1 : 1) * strength * (0.3 + rnd()));
    c.lineWidth = 0.6 + rnd() * 1.2;
    c.globalAlpha = 0.35;
    c.beginPath();
    if (along === "x") {
      c.moveTo(p, q);
      c.quadraticCurveTo(p + len / 2, q + (rnd() - 0.5) * 4, p + len, q);
    } else {
      c.moveTo(q, p);
      c.quadraticCurveTo(q + (rnd() - 0.5) * 4, p + len / 2, q, p + len);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
};

/** boards of a given size laid in rows, each its own tone, seams between */
const boards = (
  c: CanvasRenderingContext2D,
  hex: string,
  rnd: () => number,
  boardW: number,
  boardL: number,
  stagger: boolean,
) => {
  const rows = Math.round(SIZE / boardW);
  const bw = SIZE / rows;
  const cols = Math.max(1, Math.round(SIZE / boardL));
  const bl = SIZE / cols;
  for (let r = 0; r < rows; r++) {
    const off = stagger ? ((r % 3) * bl) / 3 : 0;
    for (let k = -1; k <= cols; k++) {
      const x = k * bl + off;
      c.fillStyle = shade(hex, (rnd() - 0.5) * 0.08);
      c.fillRect(x, r * bw, bl, bw);
    }
  }
  grain(c, hex, rnd, 0.06);
  c.strokeStyle = shade(hex, -0.14);
  c.lineWidth = 1.2;
  for (let r = 0; r <= rows; r++) {
    c.beginPath();
    c.moveTo(0, r * bw);
    c.lineTo(SIZE, r * bw);
    c.stroke();
    const off = stagger ? ((r % 3) * bl) / 3 : 0;
    for (let k = -1; k <= cols; k++) {
      c.beginPath();
      c.moveTo(k * bl + off, r * bw);
      c.lineTo(k * bl + off, (r + 1) * bw);
      c.stroke();
    }
  }
};

/** the floor of a kind in its tone: planks, tiles, boards or a screed */
export const floorTexture = (floor: Floor, hex: string) =>
  texture(`floor:${floor}:${hex}`, (c) => {
    const rnd = noise(7);
    c.fillStyle = hex;
    c.fillRect(0, 0, SIZE, SIZE);
    const px = SIZE / TILE_M; // pixels per metre
    if (floor === "Parquet") boards(c, hex, rnd, 0.1 * px, 0.6 * px, true);
    else if (floor === "Vinyl") boards(c, hex, rnd, 0.2 * px, 1.2 * px, true);
    else if (floor === "Tiles") {
      const t = 0.6 * px;
      for (let y = 0; y < SIZE; y += t)
        for (let x = 0; x < SIZE; x += t) {
          c.fillStyle = shade(hex, (rnd() - 0.5) * 0.04);
          c.fillRect(x, y, t, t);
        }
      c.strokeStyle = shade(hex, -0.12);
      c.lineWidth = 2;
      for (let v = 0; v <= SIZE; v += t) {
        c.beginPath();
        c.moveTo(v, 0);
        c.lineTo(v, SIZE);
        c.moveTo(0, v);
        c.lineTo(SIZE, v);
        c.stroke();
      }
    } else {
      // concrete: a mottled screed
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = shade(hex, (rnd() - 0.5) * 0.1);
        c.globalAlpha = 0.25;
        c.beginPath();
        c.arc(rnd() * SIZE, rnd() * SIZE, 4 + rnd() * 22, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  });

/** wood grain in a palette colour, the grain running along x */
export const woodTexture = (hex: string) =>
  texture(`wood:${hex}`, (c) => {
    const rnd = noise(11);
    c.fillStyle = hex;
    c.fillRect(0, 0, SIZE, SIZE);
    // the broad figure of the wood: soft bands across the grain
    for (let i = 0; i < 14; i++) {
      c.fillStyle = shade(hex, (rnd() - 0.5) * 0.06);
      c.globalAlpha = 0.5;
      const y = rnd() * SIZE;
      c.fillRect(0, y, SIZE, 10 + rnd() * 40);
    }
    c.globalAlpha = 1;
    grain(c, hex, rnd, 0.08);
  });

/** the maps a surface's relief gives a material: normals from the
    grain's height and a roughness that follows it; the same wrap and
    repeat as the colour map, so the three stay in step */
export type Relief = { normalMap: CanvasTexture; roughnessMap: CanvasTexture };
const reliefs = new Map<CanvasTexture, Relief>();
/** how far the grain's light and dark are read as height */
const RELIEF = 3;
export const reliefOf = (map: CanvasTexture): Relief => {
  const had = reliefs.get(map);
  if (had) return had;
  const source = map.image as HTMLCanvasElement;
  const w = source.width;
  const h = source.height;
  const px = source.getContext("2d")!.getImageData(0, 0, w, h).data;
  const height = new Float32Array(w * h);
  let mean = 0;
  for (let i = 0; i < w * h; i++) {
    const v =
      (0.299 * px[i * 4]! + 0.587 * px[i * 4 + 1]! + 0.114 * px[i * 4 + 2]!) /
      255;
    height[i] = v;
    mean += v;
  }
  mean /= w * h;
  const at = (x: number, y: number) =>
    height[((y + h) % h) * w + ((x + w) % w)]!;
  const normal = document.createElement("canvas");
  normal.width = w;
  normal.height = h;
  const rough = document.createElement("canvas");
  rough.width = w;
  rough.height = h;
  const nc = normal.getContext("2d")!;
  const rc = rough.getContext("2d")!;
  const nd = nc.createImageData(w, h);
  const rd = rc.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * RELIEF;
      const dy = (at(x, y + 1) - at(x, y - 1)) * RELIEF;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      nd.data[i] = Math.round((-dx / len) * 127.5 + 127.5);
      nd.data[i + 1] = Math.round((-dy / len) * 127.5 + 127.5);
      nd.data[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      nd.data[i + 3] = 255;
      // the lower grain is a little rougher; the map scales the
      // material's own roughness, so it stays near one
      const r = Math.max(0, Math.min(1, 0.85 - (at(x, y) - mean) * 0.6));
      const rv = Math.round(r * 255);
      rd.data[i] = rv;
      rd.data[i + 1] = rv;
      rd.data[i + 2] = rv;
      rd.data[i + 3] = 255;
    }
  nc.putImageData(nd, 0, 0);
  rc.putImageData(rd, 0, 0);
  const make = (canvas: HTMLCanvasElement) => {
    const t = new CanvasTexture(canvas);
    t.wrapS = map.wrapS;
    t.wrapT = map.wrapT;
    t.repeat.copy(map.repeat);
    t.colorSpace = NoColorSpace;
    t.anisotropy = map.anisotropy;
    return t;
  };
  const relief = { normalMap: make(normal), roughnessMap: make(rough) };
  reliefs.set(map, relief);
  return relief;
};
