import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { ATLAS, type Cell, PAGE_CELLS, pageCell, SPINE_CELLS } from "./books";

/**
 * The picture a shelf's books are cut from (books.ts lays out its
 * cells): spines in the muted colours real cloth and paper bindings
 * come in, never a saturated primary; on some a printed or stamped
 * title bar or two, lettering as fine strokes, a band at the head and
 * foot; each a little worn at its edges, its top darker with the dust
 * and light of years on a shelf; and four page edges, cream, white,
 * aged, and the dusty tops. Painted once on a canvas, the studio's own
 * work (no third-party file).
 */

/** cloth and paper bindings */
const CLOTHS = [
  "#6b3a32", // oxblood
  "#3d4a5c", // navy-grey
  "#6f7a63", // sage
  "#a8864e", // ochre
  "#cfc4ae", // linen
  "#3a3836", // charcoal
  "#7f8f9e", // dusty blue
  "#9a5a43", // terracotta
  "#e2d9c6", // cream paper
  "#5c5b3f", // olive
  "#6e5f68", // plum-grey
  "#b8a88a", // sand
  "#2f3d36", // bottle green
  "#8c7b6a", // taupe
  "#c9b79a", // kraft
  "#4f4440", // brown-black
] as const;
/** a title's ink or foil */
const INKS = ["#e9e0cc", "#b8955a", "#2b2724", "#f2ece0", "#8a6a3c"] as const;
const PAPERS = ["#efe6d0", "#f6f3ec", "#e3d3b0", "#cfc6b6"] as const;

const rng = (seed: number) => {
  let n = seed >>> 0 || 1;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
};

const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) =>
    Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

const spine = (g: CanvasRenderingContext2D, c: Cell, i: number) => {
  const next = rng(i * 104729 + 7);
  const base = CLOTHS[Math.floor(next() * CLOTHS.length)]!;
  g.fillStyle = base;
  g.fillRect(c.x, c.y, c.w, c.h);
  // the weave or the paper's tooth: fine speckle
  for (let k = 0; k < c.w * c.h * 0.08; k++) {
    g.fillStyle = next() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
    g.fillRect(c.x + next() * c.w, c.y + next() * c.h, 1, 1);
  }
  const ink = INKS[Math.floor(next() * INKS.length)]!;
  // a band at the head and the foot (a cloth binding's)
  if (next() < 0.55) {
    const at = 0.05 + next() * 0.04;
    g.fillStyle = ink;
    g.globalAlpha = 0.75;
    g.fillRect(c.x, c.y + c.h * at, c.w, 2);
    g.fillRect(c.x, c.y + c.h * (0.92 - at), c.w, 2);
    g.globalAlpha = 1;
  }
  // title bars: a panel of colour with the lettering on it, or the
  // lettering straight on the cloth
  const bars = next() < 0.35 ? 0 : next() < 0.7 ? 1 : 2;
  const titleAt = 0.18 + next() * 0.2;
  for (let b = 0; b < bars; b++) {
    const y = c.y + c.h * (titleAt + b * 0.36);
    const bh = c.h * (0.1 + next() * 0.12);
    g.fillStyle = mix(base, ink, 0.55 + next() * 0.3);
    g.fillRect(c.x + 3, y, c.w - 6, bh);
  }
  // the lettering: short strokes down the spine, as a title read sideways
  g.fillStyle = ink;
  const lines = c.w > 40 ? 2 : 1;
  for (let l = 0; l < lines; l++) {
    const x = c.x + c.w * (lines === 1 ? 0.5 : 0.35 + l * 0.3) - 1;
    let y = c.y + c.h * (titleAt + 0.02);
    const end = y + c.h * (0.2 + next() * 0.25);
    while (y < end) {
      const len = 3 + next() * 7;
      g.globalAlpha = 0.85;
      g.fillRect(x, y, c.w > 40 ? 3 : 2, len);
      y += len + 2 + (next() < 0.2 ? 6 : 0);
    }
    g.globalAlpha = 1;
  }
  // the author or the house's mark low on the spine
  g.fillRect(c.x + c.w / 2 - 2, c.y + c.h * 0.84, 4, 6);
  // worn where hands take it: the edges paler, a scuff or two
  const wear = g.createLinearGradient(c.x, 0, c.x + c.w, 0);
  wear.addColorStop(0, "rgba(255,255,255,0.12)");
  wear.addColorStop(0.15, "rgba(255,255,255,0)");
  wear.addColorStop(0.85, "rgba(255,255,255,0)");
  wear.addColorStop(1, "rgba(255,255,255,0.12)");
  g.fillStyle = wear;
  g.fillRect(c.x, c.y, c.w, c.h);
  for (let k = 0; k < 3; k++) {
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(
      c.x + next() * c.w,
      c.y + next() * c.h,
      2 + next() * 4,
      1 + next() * 3,
    );
  }
  // the head darker: the dust and the light of years on a shelf
  const top = g.createLinearGradient(0, c.y, 0, c.y + c.h * 0.18);
  top.addColorStop(0, "rgba(20,14,8,0.32)");
  top.addColorStop(1, "rgba(20,14,8,0)");
  g.fillStyle = top;
  g.fillRect(c.x, c.y, c.w, c.h * 0.18);
  // the joints where the spine turns into the covers
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(c.x, c.y, 1, c.h);
  g.fillRect(c.x + c.w - 1, c.y, 1, c.h);
};

/** page edges: the leaves as fine lines along, the paper's tone */
const pages = (g: CanvasRenderingContext2D, c: Cell, i: number) => {
  const next = rng(i * 7907 + 3);
  g.fillStyle = PAPERS[i]!;
  g.fillRect(c.x, c.y, c.w, c.h);
  for (let y = c.y; y < c.y + c.h; y += 1) {
    g.fillStyle = `rgba(80,60,40,${0.04 + next() * 0.07})`;
    g.fillRect(c.x, y, c.w, 1);
  }
  if (i === PAGE_CELLS - 1) {
    // the tops: the dust settled on them
    g.fillStyle = "rgba(90,80,70,0.25)";
    g.fillRect(c.x, c.y, c.w, c.h);
  }
};

let painted: CanvasTexture | null = null;
/** the spines' picture, painted once and shared by every shelf */
export const spineAtlas = (): CanvasTexture => {
  if (painted) return painted;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const g = canvas.getContext("2d")!;
  SPINE_CELLS.forEach((c, i) => spine(g, c, i));
  for (let i = 0; i < PAGE_CELLS; i++) pages(g, pageCell(i), i);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  painted = t;
  return t;
};
