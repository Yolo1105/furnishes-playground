import { hash01 } from "./seeded";
/**
 * A colour as a real surface can carry it. A paint, a lacquer or a dyed
 * cloth reflects neither all the light nor none of it, and no dye is a
 * pure hue: a colour picked or typed near those ends (a pure white, a
 * jet black, a full red) draws as a flat sticker that no light can
 * model, and it is then hard to tell whether the room reads real. Every
 * finish passes through `plausible` before it is drawn, so the light
 * and the grain always have room to show; the palette's own colours are
 * inside these bounds and keep their tone.
 *
 * Each part also takes a hair of its own tone (`toneOf`): no two
 * cushions or boards are ever quite the same, and a piece drawn in one
 * flat colour reads as a model, not a thing.
 */

/** the lightest and the darkest a surface is drawn, HSL lightness: a
    white paint reflects about 85 % of the light (linear), a black one
    about 4 % */
export const LIGHTEST = 0.92;
export const DARKEST = 0.08;
/** the most saturated a dye is drawn, HSL saturation */
export const PUREST = 0.62;

const hsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const l = (hi + lo) / 2;
  const d = hi - lo;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    hi === r
      ? ((g - b) / d + 6) % 6
      : hi === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [h * 60, s, l];
};

const hex = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const ch = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
};

/** what a surface reflects, linear luminance: a white melamine or
    paint about 0.8 (never all of it; the palette's Ash white, the
    lightest finish offered, is 0.823), a black or a dark wood about
    0.04 (never none) (round 8, 1c) */
export const ALBEDO = { least: 0.035, most: 0.83 } as const;
/** a cloth's dye is never as pure as a paint's: its most saturation */
export const CLOTH_PUREST = 0.45;
/** a rug's, lower still (round 9, Part 3): the largest cloth in the
    room, lying in the light, its colour reads the loudest of anything
    in it (on screen a rug may carry 0.4 of saturation, a cloth 0.5) */
export const RUG_PUREST = 0.3;

/** an sRGB channel (0–1) as linear light */
export const linear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
/** a hex's linear luminance */
export const luminanceOf = (colour: string) => {
  const n = parseInt(colour.slice(1, 7), 16);
  return (
    0.2126 * linear(((n >> 16) & 255) / 255) +
    0.7152 * linear(((n >> 8) & 255) / 255) +
    0.0722 * linear((n & 255) / 255)
  );
};
/** the lightness at which a hue and saturation reflect `y` (by halving) */
const lightnessFor = (h: number, s: number, y: number) => {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (luminanceOf(hex(h, s, mid)) < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

const kept = new Map<string, string>();
/** the colour within what a real surface reflects: its lightness and
    its saturation held inside the bounds, its hue kept; a colour
    already inside comes back as it was */
export const plausible = (colour: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const had = kept.get(colour);
  if (had) return had;
  const [h, s, l] = hsl(colour);
  let out =
    l > LIGHTEST || l < DARKEST || s > PUREST
      ? hex(h, Math.min(s, PUREST), Math.min(LIGHTEST, Math.max(DARKEST, l)))
      : colour;
  // and within what a real surface reflects, by its luminance
  const y = luminanceOf(out);
  if (y > ALBEDO.most || y < ALBEDO.least) {
    const [h2, s2] = hsl(out);
    out = hex(
      h2,
      s2,
      lightnessFor(h2, s2, Math.min(ALBEDO.most, Math.max(ALBEDO.least, y))),
    );
  }
  kept.set(colour, out);
  return out;
};

/** a cloth's colour: its dye held under `CLOTH_PUREST`, as a woven
    cloth never carries a paint's purity (an orange sofa read as a
    plastic one) */
export const clothColour = (colour: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const [h, s, l] = hsl(colour);
  return s > CLOTH_PUREST ? hex(h, CLOTH_PUREST, l) : colour;
};

/** a rug's colour: its dye held under `RUG_PUREST` */
export const rugColour = (colour: string) => {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const [h, s, l] = hsl(colour);
  return s > RUG_PUREST ? hex(h, RUG_PUREST, l) : colour;
};

/** a piece's own wood: its hue turned up to ±3° and its value up to
    ±6 % by its seed, as two oak pieces are never cut from the same
    tree (round 8, 1h) */
export const WOOD_SPREAD = { hue: 3, value: 0.06 } as const;
export const variedWood = (colour: string, seed: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  const u = (k: number) => hash01(seed, k);
  const [h, s, l] = hsl(colour);
  const hue = (h + (u(1) * 2 - 1) * WOOD_SPREAD.hue + 360) % 360;
  return hex(hue, s, Math.min(1, l * (1 + (u(2) * 2 - 1) * WOOD_SPREAD.value)));
};

/** how far a part's tone strays from its finish's, either way */
export const TONE_SPREAD = 0.04;
/** a part's own tone as a factor on its colour, read from where it
    stands in its piece: the same part the same tone every time */
export const toneOf = (at: readonly number[]) => {
  let n = 0;
  for (const v of at) n = (n * 31 + Math.round(v * 1000)) | 0;
  // a hash folded into [-1, 1]
  const u = (Math.imul(n ^ (n >>> 13), 0x5bd1e995) >>> 0) / 0xffffffff;
  return 1 + TONE_SPREAD * (u * 2 - 1);
};

/** where in the grain a board is cut from, in wood tiles: its place
    hashed into [0, 1) along and across */
export const grainShiftOf = (at: readonly number[]): [number, number] => {
  let n = 0x2545f491;
  for (const v of at) n = (n * 33 + Math.round(v * 1000)) | 0;
  const a = (Math.imul(n ^ (n >>> 15), 0x2c1b3c6d) >>> 0) / 0xffffffff;
  const b = (Math.imul(n ^ (n >>> 12), 0x297a2d39) >>> 0) / 0xffffffff;
  return [a, b];
};

/** a colour with its channels scaled by a factor */
export const toned = (colour: string, k: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(colour) || k === 1) return colour;
  const n = parseInt(colour.slice(1), 16);
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * k)))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};
