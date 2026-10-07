#!/usr/bin/env node
/**
 * The studio's own light panels as a surroundings map: two soft
 * rectangles and a ring of light on a grey studio, brighter above
 * than below, written as public/sky/panels.hdr (daylight) and
 * panels-evening.hdr (warm, lower). They stand in for the rig the room
 * used to build at run time (drei's Lightformer inside Environment),
 * which only the WebGL renderer could draw; a file lights the room on
 * every renderer. Run once after a change here:
 *
 *   node scripts/make-panels.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const W = 512;
const H = 256;
const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "sky",
);

/** a soft-edged patch of sky: its centre (azimuth, elevation in degrees),
    its half-width and half-height in degrees, its brightness; a ring has
    a dark middle */
const PANELS = {
  day: {
    tint: [1, 1, 1],
    base: [0.3, 0.48, 0.2],
    patches: [
      { az: 90, el: 48, w: 48, h: 22, lum: 3.4 },
      { az: 180, el: 18, w: 22, h: 14, lum: 1.8 },
      { az: -45, el: 30, w: 14, h: 14, lum: 1.1, ring: 0.55 },
    ],
  },
  evening: {
    tint: [1, 0.85, 0.72],
    base: [0.26, 0.4, 0.18],
    patches: [
      { az: 90, el: 48, w: 48, h: 22, lum: 2.2 },
      { az: 180, el: 18, w: 22, h: 14, lum: 1.3 },
      { az: -45, el: 30, w: 14, h: 14, lum: 0.8, ring: 0.55 },
    ],
  },
};

const smooth = (edge, x) => {
  const t = Math.max(0, Math.min(1, x / edge));
  return t * t * (3 - 2 * t);
};
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/** radiance's RGBE: a shared exponent, the three mantissas */
const rgbe = (r, g, b) => {
  const v = Math.max(r, g, b);
  if (v < 1e-32) return [0, 0, 0, 0];
  const e = Math.ceil(Math.log2(v));
  const scale = 256 / Math.pow(2, e);
  return [
    Math.min(255, Math.floor(r * scale)),
    Math.min(255, Math.floor(g * scale)),
    Math.min(255, Math.floor(b * scale)),
    e + 128,
  ];
};

for (const [name, rig] of Object.entries(PANELS)) {
  const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`;
  const pixels = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const el = 90 - ((y + 0.5) / H) * 180;
    for (let x = 0; x < W; x++) {
      const az = ((x + 0.5) / W) * 360 - 180;
      // the studio: lighter above the horizon, darker below
      const up = smooth(1, (el + 90) / 180);
      let lum = rig.base[2] + (rig.base[1] - rig.base[2]) * up;
      for (const p of rig.patches) {
        const dx = Math.abs(wrap(az - p.az)) / p.w;
        const dy = Math.abs(el - p.el) / p.h;
        const d = Math.max(dx, dy);
        let inside = 1 - smooth(1, Math.max(0, d - 0.8) / 0.25);
        if (p.ring !== undefined)
          inside *= smooth(1, Math.max(0, d - p.ring) / 0.15);
        lum += p.lum * inside;
      }
      const [r, g, b, e] = rgbe(
        lum * rig.tint[0],
        lum * rig.tint[1],
        lum * rig.tint[2],
      );
      const i = (y * W + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = e;
    }
  }
  const file = path.join(
    out,
    name === "day" ? "panels.hdr" : "panels-evening.hdr",
  );
  writeFileSync(file, Buffer.concat([Buffer.from(header, "ascii"), pixels]));
  console.log("wrote", file, `${(pixels.length / 1024).toFixed(0)} KB`);
}
