import { inflateSync } from "node:zlib";

/**
 * A PNG read back into its pixels, for comparing two screenshots of the
 * stage (the still test): Playwright takes PNGs, and nothing in the
 * suite decodes them, so this reads the 8-bit RGB and RGBA kind the
 * browser writes (no palette, no interlace), with node's own zlib.
 */
export type Pixels = { w: number; h: number; data: Uint8Array };

export const decodePng = (png: Buffer): Pixels => {
  let at = 8;
  let w = 0;
  let h = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      if (depth !== 8 || (colour !== 2 && colour !== 6) || body[12] !== 0)
        throw new Error("only 8-bit RGB or RGBA, not interlaced");
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels]! : 0;
      const b = prev[i]!;
      const c = i >= channels ? prev[i - channels]! : 0;
      const x = src[i]!;
      let v: number;
      switch (filter) {
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = x;
      }
      row[i] = v & 255;
    }
    for (let p = 0; p < w; p++) {
      out[(y * w + p) * 4] = row[p * channels]!;
      out[(y * w + p) * 4 + 1] = row[p * channels + 1]!;
      out[(y * w + p) * 4 + 2] = row[p * channels + 2]!;
      out[(y * w + p) * 4 + 3] = channels === 4 ? row[p * channels + 3]! : 255;
    }
    prev.set(row);
  }
  return { w, h, data: out };
};

/** the share of pixels whose largest channel differs by more than
    `step` of 255 between two pictures of a size */
export const changedShare = (a: Pixels, b: Pixels, step = 1) => {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i]! - b.data[i]!),
      Math.abs(a.data[i + 1]! - b.data[i + 1]!),
      Math.abs(a.data[i + 2]! - b.data[i + 2]!),
    );
    if (d > step) changed++;
  }
  return changed / (a.w * a.h);
};
