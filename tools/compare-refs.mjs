#!/usr/bin/env node
/**
 * The studio's pictures set beside the Cycles references: for each
 * view present in both folders, the mean luminance difference, an
 * SSIM (structural similarity, over 8 px windows of luminance) and a
 * side-by-side picture, so the live view can be judged against a
 * ground truth. Plain Node: PNGs are read and written here (8-bit RGB
 * or RGBA, no interlace), no dependency added.
 *
 *   node tools/compare-refs.mjs --studio shots/ --refs refs/ --out compare/
 *
 * The studio's pictures come from a Playwright script run in headed
 * Chrome on WebGPU at Full quality, screenshots of .stage-3d, one per
 * bookmark, named like the references (perspective.png, front.png...).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { inflateSync, deflateSync } from "node:zlib";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const studioDir = arg("studio", "shots");
const refsDir = arg("refs", "refs");
const outDir = arg("out", "compare");

/* ---------- PNG in ---------- */
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
/** an 8-bit RGB/RGBA PNG as { width, height, rgb: Uint8Array } */
export const readPng = (file) => {
  const buf = readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let at = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data[8];
      const colour = data[9];
      if (depth !== 8) throw new Error(`${file}: only 8-bit PNGs are read`);
      if (data[12] !== 0)
        throw new Error(`${file}: interlaced PNGs are not read`);
      channels = colour === 6 ? 4 : colour === 2 ? 3 : colour === 0 ? 1 : 0;
      if (!channels)
        throw new Error(`${file}: only RGB, RGBA and grey PNGs are read`);
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgb = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = new Uint8Array(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      const s = x * channels;
      if (channels === 1) rgb[o] = rgb[o + 1] = rgb[o + 2] = line[s];
      else {
        rgb[o] = line[s];
        rgb[o + 1] = line[s + 1];
        rgb[o + 2] = line[s + 2];
      }
    }
    prev = line;
  }
  return { width, height, rgb };
};

/* ---------- PNG out ---------- */
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
export const writePng = (file, { width, height, rgb }) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      raw,
      y * (width * 3 + 1) + 1,
    );
  }
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
};

/* ---------- the measures ---------- */
const luminance = ({ width, height, rgb }) => {
  const l = new Float32Array(width * height);
  for (let i = 0; i < l.length; i++)
    l[i] =
      (0.2126 * rgb[i * 3] +
        0.7152 * rgb[i * 3 + 1] +
        0.0722 * rgb[i * 3 + 2]) /
      255;
  return l;
};
/** the two pictures scaled to the smaller size by sampling */
const sameSize = (a, b) => {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const fit = (p) => {
    if (p.width === width && p.height === height) return p;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sx = Math.floor((x * p.width) / width);
        const sy = Math.floor((y * p.height) / height);
        const s = (sy * p.width + sx) * 3;
        const o = (y * width + x) * 3;
        rgb[o] = p.rgb[s];
        rgb[o + 1] = p.rgb[s + 1];
        rgb[o + 2] = p.rgb[s + 2];
      }
    return { width, height, rgb };
  };
  return [fit(a), fit(b)];
};
/** SSIM over 8 px windows of luminance, the usual constants */
export const ssim = (a, b, width, height, win = 8) => {
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let sum = 0;
  let n = 0;
  for (let y = 0; y + win <= height; y += win)
    for (let x = 0; x + win <= width; x += win) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const k = (y + j) * width + (x + i);
          ma += a[k];
          mb += b[k];
        }
      const N = win * win;
      ma /= N;
      mb /= N;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const k = (y + j) * width + (x + i);
          va += (a[k] - ma) ** 2;
          vb += (b[k] - mb) ** 2;
          cov += (a[k] - ma) * (b[k] - mb);
        }
      va /= N - 1;
      vb /= N - 1;
      cov /= N - 1;
      sum +=
        ((2 * ma * mb + C1) * (2 * cov + C2)) /
        ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  return n ? sum / n : 1;
};
export const compare = (studio, ref) => {
  const [a, b] = sameSize(studio, ref);
  const la = luminance(a);
  const lb = luminance(b);
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < la.length; i++) {
    ma += la[i];
    mb += lb[i];
  }
  ma /= la.length;
  mb /= lb.length;
  return {
    meanStudio: ma,
    meanRef: mb,
    meanDiff: mb ? Math.abs(ma - mb) / mb : 0,
    ssim: ssim(la, lb, a.width, a.height),
    side: {
      width: a.width * 2,
      height: a.height,
      rgb: (() => {
        const rgb = new Uint8Array(a.width * 2 * a.height * 3);
        for (let y = 0; y < a.height; y++) {
          rgb.set(
            a.rgb.subarray(y * a.width * 3, (y + 1) * a.width * 3),
            y * a.width * 6,
          );
          rgb.set(
            b.rgb.subarray(y * a.width * 3, (y + 1) * a.width * 3),
            y * a.width * 6 + a.width * 3,
          );
        }
        return rgb;
      })(),
    },
  };
};

const main = () => {
  mkdirSync(outDir, { recursive: true });
  const studio = new Set(
    readdirSync(studioDir).filter((f) => f.endsWith(".png")),
  );
  const refs = readdirSync(refsDir).filter((f) => f.endsWith(".png"));
  const rows = [];
  for (const f of refs) {
    if (!studio.has(f)) {
      console.log(`${basename(f, ".png")}: no studio picture, skipped`);
      continue;
    }
    const r = compare(readPng(join(studioDir, f)), readPng(join(refsDir, f)));
    writePng(join(outDir, `${basename(f, ".png")}-side.png`), r.side);
    rows.push({ view: basename(f, ".png"), ...r });
    console.log(
      `${basename(f, ".png")}: SSIM ${r.ssim.toFixed(3)}, mean luminance studio ${r.meanStudio.toFixed(3)} vs reference ${r.meanRef.toFixed(3)} (${(r.meanDiff * 100).toFixed(1)}% off)`,
    );
  }
  writeFileSync(
    join(outDir, "report.json"),
    JSON.stringify(
      rows.map(({ side: _side, ...rest }) => rest),
      null,
      2,
    ),
  );
};

if (process.argv[1] && basename(process.argv[1]) === "compare-refs.mjs") main();
