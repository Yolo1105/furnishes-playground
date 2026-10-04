import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { Floor } from "./room-data";

/**
 * Surfaces painted on a canvas, so the room and the pieces have grain
 * without a single image file: a floor by its kind (planks, tiles, a
 * vinyl board, a concrete screed) and wood grain in any colour of the
 * palette. Each is painted once and kept; a tile covers TILE_M metres
 * and repeats. A deterministic noise keeps a surface the same every
 * time it is painted.
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
