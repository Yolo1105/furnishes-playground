import { CanvasTexture, NoColorSpace, RepeatWrapping } from "three";
import { seeded } from "./seeded";

/**
 * Where hands and feet have been (the Lived-in setting; a Tidy room has
 * none): the faint grey of fingers round a light switch and a door's
 * handle (touched there a thousand times), drawn as a soft, uneven
 * blotch, densest at the plate and fading out over a hand's span, never
 * a ring; the scuffs of shoes and the vacuum along the skirting's top;
 * and the floor a little paler and duller where the way through a room
 * runs from its door. Grey alpha maps, painted once and shared; the
 * studio's own work.
 */

/** the patch a switch's marks cover, m (wide, tall), and how dark; a
    handle's, smaller */
export const HAND_MARKS = { wide: 0.24, tall: 0.3, opacity: 0.07 };
export const HANDLE_MARKS = { wide: 0.14, tall: 0.18, opacity: 0.06 };
/** the band of scuffs over the skirting, m tall, how dark, and the
    stretch one repeat of its map covers, m */
export const SCUFFS = { tall: 0.05, opacity: 0.05, repeat: 1.2 };
/** the worn way in from a door: how long and wide, m, and how much
    paler (under 3 %, as a floor wears) */
export const WALKWAY = { long: 1.8, wide: 0.8, opacity: 0.025 };

const SIZE = 128;
const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  return { c, g };
};
const alpha = (c: HTMLCanvasElement, wrap = false) => {
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  if (wrap) t.wrapS = RepeatWrapping;
  return t;
};
/** a soft round dab, `k` strong at its middle */
const dab = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  k: number,
) => {
  const grad = g.createRadialGradient(x, y, 0, x, y, s);
  grad.addColorStop(0, `rgba(255,255,255,${k})`);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, s, 0, Math.PI * 2);
  g.fill();
};

let made: CanvasTexture | null = null;
/** the marks' alpha: white where they are */
export const handMarks = () => {
  if (made) return made;
  const { c, g } = canvasOf(SIZE, SIZE);
  const next = seeded(41);
  // fingertips: many small soft dabs, most on the plate's side and below
  // it where a hand reaches for it in the dark
  for (let i = 0; i < 70; i++) {
    const a = next() * Math.PI * 2;
    const r = Math.pow(next(), 0.7) * SIZE * 0.42;
    const x = SIZE / 2 + Math.cos(a) * r * 0.8;
    const y = SIZE / 2 + Math.sin(a) * r + SIZE * 0.06;
    dab(g, x, y, 3 + next() * 9, 0.25 + next() * 0.35);
  }
  made = alpha(c);
  return made;
};

let scuffMap: CanvasTexture | null = null;
/** the skirting's scuffs, a strip repeating along the wall: densest at
    its foot (the skirting's top), thinning up it */
export const scuffs = () => {
  if (scuffMap) return scuffMap;
  const W = 512;
  const H = 32;
  const { c, g } = canvasOf(W, H);
  const next = seeded(53);
  for (let i = 0; i < 140; i++) {
    const x = next() * W;
    const y = H - Math.pow(next(), 2) * H;
    dab(g, x, y, 1.5 + next() * 5, 0.2 + next() * 0.4);
  }
  scuffMap = alpha(c, true);
  return scuffMap;
};

let pathMap: CanvasTexture | null = null;
/** the worn way in from a door: an oval, strongest near the door and
    fading to nothing at its far end */
export const pathWear = () => {
  if (pathMap) return pathMap;
  const { c, g } = canvasOf(64, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(32, 40, 26, 88, 0, 0, Math.PI * 2);
  g.fill();
  pathMap = alpha(c);
  return pathMap;
};
