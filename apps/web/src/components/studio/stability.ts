/**
 * How steady the picture is, from frames read back as RGBA bytes: the
 * still test (a camera at rest must draw the same picture frame after
 * frame: no pixel may move by more than a step of 1/255) and the motion
 * test (a slowly moving camera's frames, each compared with the next
 * after the expected motion is taken out, so what is left is shimmer:
 * crawling edges, sparkle, flicker). Each builds a heat map of where the
 * change gathers, so the hot regions can be laid at a cause by turning
 * the picture's layers off one at a time (dev-flags.ts).
 */

/** a frame: its size and its RGBA bytes, top row first */
export type Frame = { w: number; h: number; data: Uint8ClampedArray };

/** the step a pixel may change by and still count as still, of 255 */
export const STILL_STEP = 1;

/** the largest change of any channel between two frames at each pixel */
export const changeOf = (a: Frame, b: Frame): Uint8Array => {
  if (a.w !== b.w || a.h !== b.h) throw new Error("frames differ in size");
  const out = new Uint8Array(a.w * a.h);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    const d = Math.max(
      Math.abs(a.data[i]! - b.data[i]!),
      Math.abs(a.data[i + 1]! - b.data[i + 1]!),
      Math.abs(a.data[i + 2]! - b.data[i + 2]!),
    );
    out[p] = d;
  }
  return out;
};

/** the still test over a run of frames: the share of pixels that ever
    moved past STILL_STEP, the largest move, and the heat map (how many
    of the steps each pixel moved in) */
export const stillTest = (frames: readonly Frame[]) => {
  const first = frames[0];
  if (!first) return { moved: 0, worst: 0, heat: new Uint16Array(0) };
  const heat = new Uint16Array(first.w * first.h);
  let worst = 0;
  for (let k = 1; k < frames.length; k++) {
    const c = changeOf(frames[k - 1]!, frames[k]!);
    for (let p = 0; p < c.length; p++) {
      if (c[p]! > STILL_STEP) heat[p]!++;
      if (c[p]! > worst) worst = c[p]!;
    }
  }
  let moved = 0;
  for (const h of heat) if (h > 0) moved++;
  return { moved: moved / heat.length, worst, heat };
};

/** a frame's luminance, 0–1 at each pixel */
const lumaOf = (f: Frame) => {
  const out = new Float32Array(f.w * f.h);
  for (let i = 0, p = 0; p < out.length; p++, i += 4)
    out[p] =
      (0.2126 * f.data[i]! +
        0.7152 * f.data[i + 1]! +
        0.0722 * f.data[i + 2]!) /
      255;
  return out;
};

/**
 * The motion test over a run of frames from a slow, smooth camera move:
 * each pixel's change from the frame before is compared with the
 * average of its change from the frames either side (what a smooth
 * motion moves it by), and what is left over (a pixel that jumps one
 * frame and back the next) is shimmer. Returns the heat map (the mean
 * shimmer at each pixel, 0–1) and its mean over the frame.
 */
export const shimmerOf = (frames: readonly Frame[]) => {
  const first = frames[0];
  if (!first || frames.length < 3)
    return { heat: new Float32Array(0), mean: 0 };
  const l = frames.map(lumaOf);
  const heat = new Float32Array(first.w * first.h);
  for (let k = 1; k < l.length - 1; k++) {
    const a = l[k - 1]!;
    const b = l[k]!;
    const c = l[k + 1]!;
    // a smooth change carries on: b sits between a and c; a flicker
    // stands out from both
    for (let p = 0; p < heat.length; p++)
      heat[p]! += Math.abs(b[p]! - (a[p]! + c[p]!) / 2);
  }
  let sum = 0;
  for (let p = 0; p < heat.length; p++) {
    heat[p]! /= l.length - 2;
    sum += heat[p]!;
  }
  return { heat, mean: sum / heat.length };
};

/** a heat map as an image to look at: black where steady, through red to
    white where it changes most (scaled to its own hottest pixel) */
export const heatImage = (
  heat: ArrayLike<number>,
  w: number,
  h: number,
): Frame => {
  let top = 0;
  for (let p = 0; p < heat.length; p++) top = Math.max(top, heat[p]!);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < heat.length; p++) {
    const t = top > 0 ? heat[p]! / top : 0;
    data[p * 4] = Math.min(255, t * 2 * 255);
    data[p * 4 + 1] = Math.max(0, t * 2 - 1) * 255;
    data[p * 4 + 2] = Math.max(0, t * 2 - 1) * 255;
    data[p * 4 + 3] = 255;
  }
  return { w, h, data };
};

/** the hot regions of a heat map: the hottest cells of a coarse grid,
    each with its place as a share of the frame (left, top) and its heat */
export const hotRegions = (
  heat: ArrayLike<number>,
  w: number,
  h: number,
  cells = 16,
  count = 5,
) => {
  const cw = Math.ceil(w / cells);
  const ch = Math.ceil(h / cells);
  const grid: { x: number; y: number; heat: number }[] = [];
  for (let gy = 0; gy < cells; gy++)
    for (let gx = 0; gx < cells; gx++) {
      let s = 0;
      let n = 0;
      for (let y = gy * ch; y < Math.min(h, (gy + 1) * ch); y++)
        for (let x = gx * cw; x < Math.min(w, (gx + 1) * cw); x++) {
          s += heat[y * w + x]!;
          n++;
        }
      grid.push({ x: gx / cells, y: gy / cells, heat: n ? s / n : 0 });
    }
  return grid
    .filter((g) => g.heat > 0)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, count);
};
