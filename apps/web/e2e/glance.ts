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
  /** round 9, Part 0: the surfaces as a grid over the picture finds
      them (the first thing seen through each point), the sofa's seat
      cushions and all of it seen, and the floor within 20 cm of the
      sofa's base against open floor */
  walls: UV[];
  floor: UV[];
  ceiling: UV[];
  rug: UV[];
  sofa: UV[];
  seat: UV[];
  bleed: { near: UV[]; open: UV[] } | null;
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
      unproject: (c: unknown) => V;
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
      walls: [],
      floor: [],
      ceiling: [],
      rug: [],
      sofa: [],
      seat: [],
      bleed: null,
    };
    // the surfaces through a grid over the picture: what each point
    // shows first, by its name and its facing
    const sofaPiece = find("Sofa");
    for (let i = 0; i < 64; i++)
      for (let j = 0; j < 40; j++) {
        const uv: UV = [(i + 0.5) / 64, (j + 0.5) / 40];
        const far = v3(uv[0] * 2 - 1, 1 - uv[1] * 2, 0.5).unproject(camera);
        const l = look(far);
        if (!l) continue;
        let o: O | null = l.hit.object;
        let kind: "walls" | "floor" | "ceiling" | "rug" | "sofa" | null = null;
        for (; o && !kind; o = o.parent) {
          const n = o.userData?.name ?? "";
          if (n === "Wall" && Math.abs(l.n.y) < 0.3) kind = "walls";
          else if (n === "Floor" && l.n.y > 0.9) kind = "floor";
          else if (n === "Ceiling" && l.n.y < -0.9) kind = "ceiling";
          else if (/^rug/i.test(n)) kind = "rug";
          else if (o === sofaPiece) kind = "sofa";
        }
        if (kind && onScreen(uv)) out[kind].push(uv);
      }
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
        // the seat cushions: the sofa seen from above between its arms,
        // in front of its back, up to a hand over the seat's height
        const up = dirOf(p, 0, 1, 0);
        const seatTop = lo[1]! + (hi[1]! - lo[1]!) * 0.55;
        const seat: V[] = [];
        for (let i = 0; i < 11; i++)
          for (let j = 0; j < 5; j++) {
            const x = lo[0]! + (hi[0]! - lo[0]!) * (0.18 + (0.64 * i) / 10);
            const z = lo[2]! + (hi[2]! - lo[2]!) * (0.45 + (0.45 * j) / 4);
            const q = onPiece(p.localToWorld(v3(x, seatTop, z)), p, up);
            if (q && p.worldToLocal(q.clone()).y < seatTop + 0.1) seat.push(q);
          }
        out.seat = seat.map(at).filter(onScreen);
        // the floor 5 to 20 cm off the sofa's base, front and sides,
        // against open floor 0.8 m and more away
        const bleedNear: UV[] = [];
        for (const off of [0.05, 0.1, 0.15, 0.2]) {
          for (let i = 0; i < 9; i++) {
            const x = lo[0]! + (hi[0]! - lo[0]!) * (0.1 + (0.8 * i) / 8);
            const q = onFloor(p.localToWorld(v3(x, 0.002, hi[2]! + off)));
            if (q) bleedNear.push(at(q));
          }
          for (const sx of [lo[0]! - off, hi[0]! + off])
            for (let j = 0; j < 5; j++) {
              const z = lo[2]! + (hi[2]! - lo[2]!) * (0.1 + (0.8 * j) / 4);
              const q = onFloor(p.localToWorld(v3(sx, 0.002, z)));
              if (q) bleedNear.push(at(q));
            }
        }
        // open floor all round it, 0.8 to 1.4 m off its base (in front
        // of a sofa stands its rug, which is not the floor)
        const bleedOpen: UV[] = [];
        for (const off of [0.8, 1.1, 1.4])
          for (let i = 0; i <= 10; i++) {
            const k = i / 10;
            const x = lo[0]! - off + (hi[0]! - lo[0]! + 2 * off) * k;
            const z = lo[2]! - off + (hi[2]! - lo[2]! + 2 * off) * k;
            for (const w of [
              v3(x, 0.002, lo[2]! - off),
              v3(x, 0.002, hi[2]! + off),
              v3(lo[0]! - off, 0.002, z),
              v3(hi[0]! + off, 0.002, z),
            ]) {
              const q = onFloor(p.localToWorld(w));
              if (q) bleedOpen.push(at(q));
            }
          }
        out.bleed = {
          near: bleedNear.filter(onScreen),
          open: bleedOpen.filter(onScreen),
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

/** the screenshot brought down to `GLANCE_W` across in colour (sRGB,
    0–1 a channel), for the saturation and the colour bleed */
export const glanceColour = (shot: Pixels) => {
  const k = shot.w / GLANCE_W;
  const w = GLANCE_W;
  const h = Math.max(1, Math.round(shot.h / k));
  const c = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = [0, 0, 0];
      let n = 0;
      for (
        let yy = Math.floor(y * k);
        yy < Math.min(shot.h, Math.floor((y + 1) * k));
        yy++
      )
        for (
          let xx = Math.floor(x * k);
          xx < Math.min(shot.w, Math.floor((x + 1) * k));
          xx++
        ) {
          const i = (yy * shot.w + xx) * 4;
          for (let ch = 0; ch < 3; ch++) s[ch]! += shot.data[i + ch]! / 255;
          n++;
        }
      for (let ch = 0; ch < 3; ch++)
        c[(y * w + x) * 3 + ch] = n ? s[ch]! / n : 0;
    }
  return { w, h, c };
};
type Colour = ReturnType<typeof glanceColour>;
const rgbAt = (img: Colour, [u, v]: UV) => {
  const i =
    (Math.min(img.h - 1, Math.max(0, Math.round(v * img.h))) * img.w +
      Math.min(img.w - 1, Math.max(0, Math.round(u * img.w)))) *
    3;
  return [img.c[i]!, img.c[i + 1]!, img.c[i + 2]!] as const;
};
/** HSV: hue in degrees, saturation and value 0–1 */
export const hsv = ([r, g, b]: readonly [number, number, number]) => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let hue = 0;
  if (d > 1e-6)
    hue =
      mx === r
        ? 60 * (((g - b) / d + 6) % 6)
        : mx === g
          ? 60 * ((b - r) / d + 2)
          : 60 * ((r - g) / d + 4);
  return { h: hue, s: mx > 1e-6 ? d / mx : 0, v: mx };
};
/** a hue's mean round the circle, degrees */
const meanHue = (hs: number[]) => {
  const x = mean(hs.map((h) => Math.cos((h * Math.PI) / 180)));
  const y = mean(hs.map((h) => Math.sin((h * Math.PI) / 180)));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/** round 9, Part 0: how flat the faces read (luminance's standard
    deviation within a face and its 90th over 10th percentile), the sofa's
    and the rug's saturation on screen, and the floor's hue and
    saturation within 20 cm of the sofa against open floor (record only) */
export const glanceColourNumbers = (
  img: Grey,
  colour: Colour,
  p: GlancePoints,
) => {
  const flat = (uvs: UV[]) => {
    const vs = uvs.map((uv) => read(img, uv));
    return vs.length < 6
      ? null
      : {
          n: vs.length,
          mean: mean(vs),
          sd: sd(vs),
          spread: quantile(vs, 0.9) / Math.max(1e-4, quantile(vs, 0.1)),
        };
  };
  const sat = (uvs: UV[]) =>
    uvs.length < 6 ? null : mean(uvs.map((uv) => hsv(rgbAt(colour, uv)).s));
  const tone = (uvs: UV[]) =>
    uvs.length < 6
      ? null
      : {
          hue: meanHue(uvs.map((uv) => hsv(rgbAt(colour, uv)).h)),
          sat: sat(uvs),
          value: mean(uvs.map((uv) => hsv(rgbAt(colour, uv)).v)),
        };
  return {
    flatness: {
      seat: flat(p.seat),
      wall: flat(p.walls),
      floor: flat(p.floor),
      ceiling: flat(p.ceiling),
    },
    saturation: { sofa: sat(p.sofa), rug: sat(p.rug) },
    bleed: p.bleed
      ? { near: tone(p.bleed.near), open: tone(p.bleed.open) }
      : null,
  };
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
