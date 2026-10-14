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
 * single pixel of the small picture, and only where the camera sees
 * that point itself (a ray from the camera, `__ray`, first meets the
 * scene there, on the piece), so a cushion or a neighbour standing in
 * front never counts as the face. And the squint image itself:
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
  /** what the points were found from, for a failing run */
  debug: number[];
};

/** the pieces the glance looks at, by their names in the scene */
export const GLANCE_PIECES = [
  "Bookwall",
  "Three-bay sideboard",
  "Sofa",
  "TV console",
  "Coffee table",
];

/** the points, worked out in the page. Each is where a ray from the
    camera meets the scene: a face's point where the ray through a grid
    on the piece's box first lands on the piece, on a surface turned the
    face's way (so a cushion's front counts as the sofa's front, and the
    floor seen past it does not); the floor's where it lands on the
    floor itself */
export const glancePoints = (page: Page) =>
  page.evaluate((names: string[]): GlancePoints => {
    type V = {
      clone: () => V;
      normalize: () => V;
      distanceTo: (v: V) => number;
      set: (x: number, y: number, z: number) => V;
      project: (c: unknown) => V;
      applyMatrix4: (m: unknown) => V;
      transformDirection: (m: unknown) => V;
      sub: (v: V) => V;
      dot: (v: V) => number;
      x: number;
      y: number;
      z: number;
    };
    type O = {
      userData: { name?: string; export?: string };
      matrixWorld: unknown;
      geometry?: {
        computeBoundingBox: () => void;
        boundingBox: { min: V; max: V } | null;
      };
      isMesh?: boolean;
      visible: boolean;
      parent: O | null;
      traverse: (f: (o: O) => void) => void;
      updateMatrixWorld: (force: boolean) => void;
      worldToLocal: (v: V) => V;
      localToWorld: (v: V) => V;
    };
    type Hit = {
      distance: number;
      object: O;
      point: V;
      face?: { normal: V } | null;
    };
    const w = window as unknown as {
      __camera: { position: V };
      __scene: O;
      __ray: {
        set: (o: V, d: V) => void;
        far: number;
        intersectObject: (o: O, deep: boolean) => Hit[];
      };
    };
    const camera = w.__camera;
    // the world as drawn: a piece re-made since the last frame (the
    // studio draws on demand) has not had its place worked out yet
    w.__scene.updateMatrixWorld(true);
    const shown = (o: O | null): boolean =>
      !o || (o.visible && shown(o.parent));
    const within = (o: O | null, of: O): boolean =>
      !!o && (o === of || within(o.parent, of));
    const v3 = (x: number, y: number, z: number) =>
      camera.position.clone().set(x, y, z);
    /** the first thing the camera sees through a point, with its normal */
    const look = (pt: V) => {
      w.__ray.set(camera.position, pt.clone().sub(camera.position).normalize());
      w.__ray.far = 100;
      // a model answers a ray by its box, with no face (model-budget.ts):
      // it hides what stands behind it all the same
      const hit = w.__ray
        .intersectObject(w.__scene, true)
        .find((h) => shown(h.object));
      if (!hit?.face) return null;
      const n = hit
        .face!.normal.clone()
        .transformDirection(hit.object.matrixWorld);
      return { hit, n };
    };
    /** where the camera sees a piece through a point, on a surface facing
        `dir` (world), or null */
    const onPiece = (pt: V, p: O, dir: V) => {
      const l = look(pt);
      if (!l || !within(l.hit.object, p) || l.n.dot(dir) < 0.7) return null;
      return l.hit.point;
    };
    /** what the ground is where the camera sees it through a point: the
        floor itself or a rug on it (each its own surface), or neither */
    const groundAt = (pt: V) => {
      const l = look(pt);
      if (!l || l.n.y < 0.9) return null;
      let o: O | null = l.hit.object;
      if (o.userData?.name === "Floor")
        return { q: l.hit.point, kind: "floor" };
      for (; o; o = o.parent)
        if (/rug/i.test(o.userData?.name ?? ""))
          return { q: l.hit.point, kind: "rug" };
      return null;
    };
    /** where the camera sees the floor itself through a point */
    const onFloor = (pt: V) => {
      const g = groundAt(pt);
      return g?.kind === "floor" ? g.q : null;
    };
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
        // the piece itself: not its pick halo, nor its footprint
        if (!m.isMesh || !m.geometry || !m.visible) return;
        if (m.userData?.export === "helper" || m.userData?.name === "Footprint")
          return;
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
      debug: [],
    };
    /** a grid of points on a face of the box, inset 8 % */
    const grid = (
      p: O,
      axis: 0 | 1 | 2,
      at0: number,
      lo: number[],
      hi: number[],
      n = 9,
    ) => {
      const pts: V[] = [];
      const others = [0, 1, 2].filter((i) => i !== axis);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const c = [0, 0, 0];
          c[axis] = at0;
          const [a, b] = others as [number, number];
          c[a] = lo[a]! + (hi[a]! - lo[a]!) * (0.08 + (0.84 * i) / (n - 1));
          c[b] = lo[b]! + (hi[b]! - lo[b]!) * (0.08 + (0.84 * j) / (n - 1));
          pts.push(p.localToWorld(v3(c[0]!, c[1]!, c[2]!)));
        }
      return pts;
    };
    /** a direction in the piece's frame, in the world */
    const dirOf = (p: O, x: number, y: number, z: number) =>
      p
        .localToWorld(v3(x, y, z))
        .sub(p.localToWorld(v3(0, 0, 0)))
        .normalize();
    const kept = <T>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
    for (const name of names) {
      const p = find(name);
      if (!p) continue;
      const { lo, hi } = boxOf(p);
      if (!Number.isFinite(lo[0]!)) continue;
      const faces: [string, 0 | 1 | 2, number, V][] = [
        ["front", 2, hi[2]!, dirOf(p, 0, 0, 1)],
        ["top", 1, hi[1]!, dirOf(p, 0, 1, 0)],
        ["left", 0, lo[0]!, dirOf(p, -1, 0, 0)],
        ["right", 0, hi[0]!, dirOf(p, 1, 0, 0)],
      ];
      for (const [face, axis, plane, dir] of faces) {
        const pts = kept(
          grid(p, axis, plane, lo, hi).map((q) => onPiece(q, p, dir)),
        );
        const uv = pts.map(at).filter(onScreen);
        if (uv.length > 10) out.faces.push({ piece: name, face, pts: uv });
      }
      // the top of the piece's front face, found down the front at each
      // place across, and the face a hand below it
      const front = dirOf(p, 0, 0, 1);
      const edge: UV[] = [];
      const below: UV[] = [];
      for (let i = 0; i < 9; i++) {
        const x = lo[0]! + (hi[0]! - lo[0]!) * (0.15 + (0.7 * i) / 8);
        let top: V | null = null;
        for (let y = hi[1]!; y > hi[1]! - 0.6 && !top; y -= 0.005)
          top = onPiece(p.localToWorld(v3(x, y, hi[2]! + 0.05)), p, front);
        if (!top) continue;
        const t = p.worldToLocal(top.clone());
        const e = onPiece(p.localToWorld(v3(x, t.y - 0.004, t.z)), p, front);
        const b = onPiece(p.localToWorld(v3(x, t.y - 0.06, t.z)), p, front);
        if (!e || !b) continue;
        edge.push(at(e));
        below.push(at(b));
      }
      if (name !== "Bookwall" && edge.length >= 3)
        out.edges.push({ piece: name, edge, below });
      if (name === "Bookwall") {
        // a bay's back: the back panel seen at bay middles; its front
        // edge: the boards' front edges seen across the bays
        // the boards' front edges stand furthest forward; a bay's back
        // (its back panel, or the middle panel of a shelf open both
        // ways) is the face seen at least 8 cm behind them
        const seenAt: { q: V; z: number }[] = [];
        for (let i = 0; i < 16; i++)
          for (let j = 0; j < 10; j++) {
            const x = lo[0]! + (hi[0]! - lo[0]!) * ((i + 0.5) / 16);
            const y = lo[1]! + (hi[1]! - lo[1]!) * ((j + 0.5) / 10);
            const q = onPiece(p.localToWorld(v3(x, y, hi[2]!)), p, front);
            if (q) seenAt.push({ q, z: p.worldToLocal(q.clone()).z });
          }
        const zFront = Math.max(...seenAt.map((s) => s.z));
        const back = seenAt
          .filter((s) => s.z < zFront - 0.08)
          .map((s) => at(s.q));
        const fronts = seenAt
          .filter((s) => s.z > zFront - 0.004)
          .map((s) => at(s.q));
        out.bays = {
          back: back.filter(onScreen),
          front: fronts.filter(onScreen),
        };
      }
      if (name === "Sofa") {
        // the ground 3 cm off the base's front, and open ground of the
        // same kind (the floor, or the rug it stands at) round it
        const nears: { q: V; kind: string }[] = [];
        for (let i = 0; i < 9; i++) {
          const x = lo[0]! + (hi[0]! - lo[0]!) * (0.15 + (0.7 * i) / 8);
          const g = groundAt(p.localToWorld(v3(x, 0.002, hi[2]! + 0.03)));
          if (g) nears.push(g);
        }
        const kind =
          nears.filter((g) => g.kind === "rug").length * 2 > nears.length
            ? "rug"
            : "floor";
        const near = nears.filter((g) => g.kind === kind).map((g) => at(g.q));
        const open: UV[] = [];
        for (let i = 0; i < 11; i++)
          for (let j = 0; j < 6; j++) {
            const x = lo[0]! - 1.2 + (hi[0]! - lo[0]! + 2.4) * (i / 10);
            const g = groundAt(
              p.localToWorld(v3(x, 0.002, hi[2]! + 0.6 + j * 0.3)),
            );
            if (g?.kind === kind) open.push(at(g.q));
          }
        out.contact = {
          near: near.filter(onScreen),
          open: open.filter(onScreen),
        };
      }
      if (name === "Coffee table") {
        const up = dirOf(p, 0, 1, 0);
        const top = kept(
          grid(p, 1, hi[1]!, lo, hi, 7).map((q) => onPiece(q, p, up)),
        )
          .map(at)
          .filter(onScreen);
        const floor: UV[] = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          for (const r of [0.5, 0.8, 1.1]) {
            const q = onFloor(
              p.localToWorld(
                v3(
                  Math.cos(a) * ((hi[0]! - lo[0]!) / 2 + r),
                  0.002,
                  Math.sin(a) * ((hi[2]! - lo[2]!) / 2 + r),
                ),
              ),
            );
            if (q) floor.push(at(q));
          }
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
