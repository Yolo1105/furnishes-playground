/**
 * A mild Panini lens for the traced photo (round 8, Part 5; the
 * photo's own, never the live view, whose picking, name tags and handles
 * assume a pinhole camera). A wide interior shot through a pinhole
 * stretches what stands at the frame's sides; the Panini projection
 * (Sharpless, Gennarelli and Dersch, 2010) keeps verticals and the
 * middle's straight lines straight while it eases that stretch, as an
 * architectural photographer's lens does. `d` sets how much: 0 is the
 * pinhole, 1 the full Panini; a mild one is a fraction of it.
 *
 * The photo is remapped once it is taken: each pixel of the lens's
 * picture looks up where its ray falls on the pinhole picture, with the
 * picture zoomed just enough that no edge comes up empty.
 */

/** how much of the Panini a photo takes */
export const PANINI = 0.35;

/** a pixel of the lens's picture, in the plane of the Panini image
    (`h`, `v`, units of the focal length), back to the pinhole's (`x`,
    `y`, the same units): its azimuth from `h`, then the ray's height */
export const fromPanini = (h: number, v: number, d: number) => {
  const k = (h * h) / ((d + 1) * (d + 1));
  const dscr = k * k * d * d - (k + 1) * (k * d * d - 1);
  const cos = (-k * d + Math.sqrt(Math.max(0, dscr))) / (k + 1);
  const phi = Math.sign(h) * Math.acos(Math.max(-1, Math.min(1, cos)));
  const s = (d + 1) / (d + Math.cos(phi));
  const x = Math.tan(phi);
  const y = v / s / Math.cos(phi);
  return [x, y] as const;
};

/** the other way: a pinhole point to the Panini image's plane */
export const toPanini = (x: number, y: number, d: number) => {
  const phi = Math.atan(x);
  const s = (d + 1) / (d + Math.cos(phi));
  return [s * Math.sin(phi), s * y * Math.cos(phi)] as const;
};

/** the picture `src` (RGBA, `w` × `h`) as the lens takes it, for a
    camera whose vertical field is `fov` radians: the same size, zoomed
    so the frame's edges are filled, each pixel sampled bilinearly */
export const paniniPicture = (
  src: Uint8ClampedArray,
  w: number,
  h: number,
  fov: number,
  d = PANINI,
): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(src.length);
  // the focal length in pixels, and the frame's half-extents in its units
  const f = h / 2 / Math.tan(fov / 2);
  const ax = w / 2 / f;
  const ay = h / 2 / f;
  // the zoom: the Panini image of the pinhole's frame is narrower at the
  // sides' middles than at its corners; take its edge's middle across
  // and the height at that column, so every pixel finds the picture
  const [hEdge] = toPanini(ax, 0, d);
  const zoom = Math.min(hEdge / ax, toPanini(ax, ay, d)[1] / ay, 1);
  const sample = (px: number, py: number, o: number) => {
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(px)));
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = Math.max(0, Math.min(1, px - x0));
    const ty = Math.max(0, Math.min(1, py - y0));
    for (let c = 0; c < 4; c++) {
      const a = src[(y0 * w + x0) * 4 + c]!;
      const b = src[(y0 * w + x1) * 4 + c]!;
      const e = src[(y1 * w + x0) * 4 + c]!;
      const g = src[(y1 * w + x1) * 4 + c]!;
      out[o + c] = (a + (b - a) * tx) * (1 - ty) + (e + (g - e) * tx) * ty;
    }
  };
  for (let j = 0; j < h; j++) {
    const v = ((j + 0.5 - h / 2) / f) * zoom;
    for (let i = 0; i < w; i++) {
      const hh = ((i + 0.5 - w / 2) / f) * zoom;
      const [x, y] = fromPanini(hh, v, d);
      sample(x * f + w / 2 - 0.5, y * f + h / 2 - 0.5, (j * w + i) * 4);
    }
  }
  return out;
};
