/**
 * The bounce check's sums (`?check=gi`, GiCheckPanel.tsx): the live
 * view and the traced photo of the same view, each cut into a grid of
 * regions, each region's mean luminance, and how far the live one
 * stands from the traced one. The tracer is the reference: its light
 * goes round the room as light does, so a region the bake lit too
 * brightly or too dimly shows here. Each is taken as a share of its own
 * picture's mean first, so the two pictures' exposures (the tracer's
 * window light is set apart from the live view's, window-light.ts)
 * weigh nothing: what is compared is where the light falls.
 */

/** the grid: columns and rows */
export const GI_GRID = { cols: 4, rows: 3 } as const;
/** a region may stand this far from the tracer's, a share */
export const GI_TOLERANCE = 0.15;

export type Picture = {
  w: number;
  h: number;
  data: Uint8ClampedArray | Uint8Array;
};

const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** each region's mean luminance (linear), row by row */
export const regionMeans = (p: Picture, grid = GI_GRID) => {
  const out: number[] = [];
  for (let r = 0; r < grid.rows; r++)
    for (let c = 0; c < grid.cols; c++) {
      const x0 = Math.floor((c * p.w) / grid.cols);
      const x1 = Math.floor(((c + 1) * p.w) / grid.cols);
      const y0 = Math.floor((r * p.h) / grid.rows);
      const y1 = Math.floor(((r + 1) * p.h) / grid.rows);
      let s = 0;
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const k = (y * p.w + x) * 4;
          s +=
            0.2126 * linear(p.data[k]!) +
            0.7152 * linear(p.data[k + 1]!) +
            0.0722 * linear(p.data[k + 2]!);
          n++;
        }
      out.push(n ? s / n : 0);
    }
  return out;
};

/** each region's difference, live against traced, each a share of its
    picture's mean; and whether every one is within the tolerance */
export const compareRegions = (live: number[], traced: number[]) => {
  const mean = (xs: number[]) =>
    xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const ml = mean(live) || 1;
  const mt = mean(traced) || 1;
  const diffs = live.map((l, i) => {
    const a = l / ml;
    const b = (traced[i] ?? 0) / mt;
    return b > 1e-6 ? (a - b) / b : 0;
  });
  return {
    diffs,
    worst: Math.max(0, ...diffs.map(Math.abs)),
    pass: diffs.every((d) => Math.abs(d) <= GI_TOLERANCE),
  };
};
