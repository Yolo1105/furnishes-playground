import { CanvasTexture, NoColorSpace } from "three";

/**
 * Where hands and feet have been: the faint grey of fingers round a
 * light switch (a wall is touched there a thousand times), drawn as a
 * soft, uneven blotch, densest at the plate and fading out over a hand's
 * span, never a ring. A grey alpha map, painted once and shared; the
 * studio's own work.
 */

/** the patch a switch's marks cover, m (wide, tall), and how dark */
export const HAND_MARKS = { wide: 0.24, tall: 0.3, opacity: 0.07 };

const SIZE = 128;
let made: CanvasTexture | null = null;

const rng = (seed: number) => {
  let n = seed >>> 0 || 1;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
};

/** the marks' alpha: white where they are */
export const handMarks = () => {
  if (made) return made;
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, SIZE, SIZE);
  const next = rng(41);
  // fingertips: many small soft dabs, most on the plate's side and below
  // it where a hand reaches for it in the dark
  for (let i = 0; i < 70; i++) {
    const a = next() * Math.PI * 2;
    const r = Math.pow(next(), 0.7) * SIZE * 0.42;
    const x = SIZE / 2 + Math.cos(a) * r * 0.8;
    const y = SIZE / 2 + Math.sin(a) * r + SIZE * 0.06;
    const s = 3 + next() * 9;
    const grad = g.createRadialGradient(x, y, 0, x, y, s);
    const k = 0.25 + next() * 0.35;
    grad.addColorStop(0, `rgba(255,255,255,${k})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
  }
  made = new CanvasTexture(c);
  made.colorSpace = NoColorSpace;
  return made;
};
