import { deflateSync, crc32 } from "node:zlib";
import type { Page } from "@playwright/test";
import type { Pixels } from "./png";

/**
 * The glance test's measuring (round 8, 1i): the day Corner view as
 * the eye takes it in from across a room. The stage's screenshot is
 * brought down to 480 px across, read as greyscale (sRGB luma, 0–1, the
 * value an eye and a squint image see), and sampled where the pieces'
 * faces fall on it: points on each named piece's faces found through
 * the camera (`__camera`, `__scene`, development only), each point a
 * single pixel of the small picture. And the squint image itself:
 * greyscale, blurred 4 px, cut to 8 tones.
 */

/** the picture's width the glance is taken at, px */
export const GLANCE_W = 480;

/** a point on the picture, 0–1 across and down */
type UV = readonly [number, number];
/** what is sampled where: each piece's faces (seen from the camera),
    its top front edge and the face just below it; the bookwall's bays
    at the back and at their front edges; the floor beside the sofa's
    base and open floor; the coffee table's top and the floor by it */
export type GlancePoints = {
  faces: { piece: string; face: string; pts: UV[] }[];
  edges: { piece: string; edge: UV[]; below: UV[] }[];
  bays: { back: UV[]; front: UV[] } | null;
  contact: { near: UV[]; open: UV[] } | null;
  table: { top: UV[]; floor: UV[] } | null;
};

/** the pieces the glance looks at, by their names in the scene */
export const GLANCE_PIECES = [
  "Bookwall",
  "Three-bay sideboard",
  "Sofa",
  "TV console",
  "Coffee table",
];

/** the points, worked out in the page */
export const glancePoints = (page: Page) =>
  page.evaluate((names: string[]): GlancePoints => {
    type V = {
      clone: () => V;
      set: (x: number, y: number, z: number) => V;
      project: (c: unknown) => V;
      applyMatrix4: (m: unknown) => V;
      sub: (v: V) => V;
      dot: (v: V) => number;
      x: number;
      y: number;
      z: number;
    };
    type O = {
      userData: { name?: string };
      matrixWorld: unknown;
      geometry?: {
        computeBoundingBox: () => void;
        boundingBox: { min: V; max: V } | null;
      };
      isMesh?: boolean;
      visible: boolean;
      traverse: (f: (o: O) => void) => void;
      updateMatrixWorld: (force: boolean) => void;
      worldToLocal: (v: V) => V;
      localToWorld: (v: V) => V;
    };
    const w = window as unknown as { __camera: { position: V }; __scene: O };
    const camera = w.__camera;
    const v3 = (x: number, y: number, z: number) =>
      camera.position.clone().set(x, y, z);
    const at = (v: V): UV => {
      const s = v.clone().project(camera);
      return [(s.x + 1) / 2, (1 - s.y) / 2];
    };
    const onScreen = ([u, v]: UV) =>
      u > 0.01 && u < 0.99 && v > 0.01 && v < 0.99;
    const find = (name: string) => {
      let hit: O | null = null;
      w.__scene.traverse((o) => {
        if (!hit && o.userData?.name === name) hit = o;
      });
      return hit as O | null;
    };
    /** a piece's box in its own frame (its front its +z) */
    const boxOf = (p: O) => {
      p.updateMatrixWorld(true);
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      p.traverse((m) => {
        if (!m.isMesh || !m.geometry || !m.visible) return;
        m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox;
        if (!b) return;
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              const l = p.worldToLocal(v3(x, y, z).applyMatrix4(m.matrixWorld));
              [l.x, l.y, l.z].forEach((c, i) => {
                lo[i] = Math.min(lo[i]!, c);
                hi[i] = Math.max(hi[i]!, c);
              });
            }
      });
      return { lo, hi };
    };
    const out: GlancePoints = {
      faces: [],
      edges: [],
      bays: null,
      contact: null,
      table: null,
    };
    /** a grid of points on a face of the box, inset 12 % */
    const grid = (
      p: O,
      axis: 0 | 1 | 2,
      at0: number,
      lo: number[],
      hi: number[],
      n = 7,
    ) => {
      const pts: V[] = [];
      const others = [0, 1, 2].filter((i) => i !== axis);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const c = [0, 0, 0];
          c[axis] = at0;
          const [a, b] = others as [number, number];
          c[a] = lo[a]! + (hi[a]! - lo[a]!) * (0.12 + (0.76 * i) / (n - 1));
          c[b] = lo[b]! + (hi[b]! - lo[b]!) * (0.12 + (0.76 * j) / (n - 1));
          pts.push(p.localToWorld(v3(c[0]!, c[1]!, c[2]!)));
        }
      return pts;
    };
    for (const name of names) {
      const p = find(name);
      if (!p) continue;
      const { lo, hi } = boxOf(p);
      if (!Number.isFinite(lo[0]!)) continue;
      const centre = p.localToWorld(
        v3((lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2),
      );
      const facing = (pt: V) =>
        camera.position.clone().sub(pt).dot(pt.clone().sub(centre)) > 0;
      const faces: [string, 0 | 1 | 2, number][] = [
        ["front", 2, hi[2]!],
        ["top", 1, hi[1]!],
        ["left", 0, lo[0]!],
        ["right", 0, hi[0]!],
      ];
      for (const [face, axis, plane] of faces) {
        // the bookwall's front is its open bays: its sides and top
        if (name === "Bookwall" && face === "front") continue;
        const pts = grid(p, axis, plane, lo, hi);
        const mid = pts[Math.floor(pts.length / 2)]!;
        if (!facing(mid)) continue;
        const uv = pts.map(at).filter(onScreen);
        if (uv.length > 10) out.faces.push({ piece: name, face, pts: uv });
      }
      // the top front edge, and the front face a hand below it
      const edge: UV[] = [];
      const below: UV[] = [];
      for (let i = 0; i < 9; i++) {
        const x = lo[0]! + (hi[0]! - lo[0]!) * (0.15 + (0.7 * i) / 8);
        edge.push(at(p.localToWorld(v3(x, hi[1]! - 0.002, hi[2]! - 0.002))));
        below.push(at(p.localToWorld(v3(x, hi[1]! - 0.06, hi[2]! + 0.001))));
      }
      if (name !== "Bookwall" && edge.every(onScreen))
        out.edges.push({ piece: name, edge, below });
      if (name === "Bookwall") {
        // a bay's back: 3 cm in front of the back, at bay middles; its
        // front edge: the side panels' front edges, mid-height
        const back: UV[] = [];
        const front: UV[] = [];
        for (let i = 0; i < 6; i++)
          for (let j = 0; j < 4; j++) {
            const x = lo[0]! + (hi[0]! - lo[0]!) * ((i + 0.5) / 6);
            const y = lo[1]! + (hi[1]! - lo[1]!) * ((j + 0.5) / 4);
            back.push(at(p.localToWorld(v3(x, y, lo[2]! + 0.03))));
          }
        for (const x of [lo[0]! + 0.009, hi[0]! - 0.009])
          for (let j = 0; j < 8; j++) {
            const y = lo[1]! + (hi[1]! - lo[1]!) * (0.15 + (0.7 * j) / 7);
            front.push(at(p.localToWorld(v3(x, y, hi[2]! - 0.004))));
          }
        out.bays = {
          back: back.filter(onScreen),
          front: front.filter(onScreen),
        };
      }
      if (name === "Sofa") {
        // the floor 3 cm off the base's front, and 1.2 m off it
        const near: UV[] = [];
        const open: UV[] = [];
        for (let i = 0; i < 9; i++) {
          const x = lo[0]! + (hi[0]! - lo[0]!) * (0.15 + (0.7 * i) / 8);
          near.push(at(p.localToWorld(v3(x, 0.002, hi[2]! + 0.03))));
          open.push(at(p.localToWorld(v3(x, 0.002, hi[2]! + 1.2))));
        }
        out.contact = {
          near: near.filter(onScreen),
          open: open.filter(onScreen),
        };
      }
      if (name === "Coffee table") {
        const top = grid(p, 1, hi[1]!, lo, hi, 5).map(at).filter(onScreen);
        const floor: UV[] = [];
        for (let i = 0; i < 9; i++) {
          const x = lo[0]! + (hi[0]! - lo[0]!) * (i / 8);
          floor.push(at(p.localToWorld(v3(x, 0.002, hi[2]! + 0.35))));
        }
        out.table = { top, floor: floor.filter(onScreen) };
      }
    }
    return out;
  }, GLANCE_PIECES);

/** the screenshot brought down to `GLANCE_W` across (a box filter), as
    greyscale sRGB luma, 0–1 */
export const glanceGrey = (shot: Pixels) => {
  const k = shot.w / GLANCE_W;
  const w = GLANCE_W;
  const h = Math.max(1, Math.round(shot.h / k));
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      const y0 = Math.floor(y * k);
      const x0 = Math.floor(x * k);
      for (let yy = y0; yy < Math.min(shot.h, Math.floor((y + 1) * k)); yy++)
        for (
          let xx = x0;
          xx < Math.min(shot.w, Math.floor((x + 1) * k));
          xx++
        ) {
          const i = (yy * shot.w + xx) * 4;
          sum +=
            (0.2126 * shot.data[i]! +
              0.7152 * shot.data[i + 1]! +
              0.0722 * shot.data[i + 2]!) /
            255;
          n++;
        }
      g[y * w + x] = n ? sum / n : 0;
    }
  return { w, h, g };
};

type Grey = ReturnType<typeof glanceGrey>;
const read = (img: Grey, [u, v]: UV) =>
  img.g[
    Math.min(img.h - 1, Math.max(0, Math.round(v * img.h))) * img.w +
      Math.min(img.w - 1, Math.max(0, Math.round(u * img.w)))
  ]!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return (
    s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] ?? 0
  );
};

/** the glance's numbers: each face's spread (90th over 10th
    percentile), each top front edge over the face below it, the bays'
    backs against their front edges (how much darker), the floor by the
    sofa against open floor (how much darker), the coffee table's top
    against the floor (how different), and the darkest 1 % of the
    picture */
export const glanceNumbers = (img: Grey, p: GlancePoints) => {
  const faces = p.faces.map((f) => {
    const vs = f.pts.map((uv) => read(img, uv));
    return {
      piece: f.piece,
      face: f.face,
      spread: quantile(vs, 0.9) / Math.max(1e-4, quantile(vs, 0.1)),
      mean: mean(vs),
    };
  });
  const edges = p.edges.map((e) => ({
    piece: e.piece,
    lift:
      mean(e.edge.map((uv) => read(img, uv))) /
        Math.max(1e-4, mean(e.below.map((uv) => read(img, uv)))) -
      1,
  }));
  const bays = p.bays
    ? 1 -
      mean(p.bays.back.map((uv) => read(img, uv))) /
        Math.max(1e-4, mean(p.bays.front.map((uv) => read(img, uv))))
    : null;
  const contact = p.contact
    ? 1 -
      mean(p.contact.near.map((uv) => read(img, uv))) /
        Math.max(1e-4, mean(p.contact.open.map((uv) => read(img, uv))))
    : null;
  const table = p.table
    ? Math.abs(
        mean(p.table.top.map((uv) => read(img, uv))) /
          Math.max(1e-4, mean(p.table.floor.map((uv) => read(img, uv)))) -
          1,
      )
    : null;
  const black = quantile(Array.from(img.g), 0.01);
  return { faces, edges, bays, contact, table, black };
};

/** the squint image: the glance's greyscale blurred 4 px (a box blur
    three times over, near enough a Gaussian) and cut to 8 tones, as a
    PNG */
export const squintPng = (img: Grey) => {
  const { w, h } = img;
  let a = Float32Array.from(img.g);
  const r = 4;
  for (let pass = 0; pass < 3; pass++) {
    const b = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let d = -r; d <= r; d++) {
          const xx = x + d;
          if (xx < 0 || xx >= w) continue;
          s += a[y * w + xx]!;
          n++;
        }
        b[y * w + x] = s / n;
      }
    const c = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let d = -r; d <= r; d++) {
          const yy = y + d;
          if (yy < 0 || yy >= h) continue;
          s += b[yy * w + x]!;
          n++;
        }
        c[y * w + x] = s / n;
      }
    a = c;
  }
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = Math.min(7, Math.floor(a[y * w + x]! * 8));
      raw[y * (w + 1) + 1 + x] = Math.round((t / 7) * 255);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
