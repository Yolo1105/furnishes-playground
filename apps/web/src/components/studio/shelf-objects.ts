import {
  type BufferGeometry,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  SphereGeometry,
  Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ShelfObject } from "./shelf-style";
import { shade } from "./textures";

/**
 * A shelf's objects (shelf-style.ts) as one mesh: each a few simple
 * solids in its own colour and roughness, carried on its vertices, so
 * every object on a piece's shelves is one draw with one material, as
 * its books are (books.ts). Plain geometry, so it is tested here.
 */

/** each kind's finishes (shelf-style.ts's `tone`), as colour and
    roughness: glazed and matt stoneware; terracotta, white and
    charcoal pots; a linen box, kraft card and woven rattan */
export const FINISHES = {
  vase: [
    { colour: "#e9e4da", rough: 0.25 },
    { colour: "#8f9c88", rough: 0.55 },
    { colour: "#3d3a37", rough: 0.4 },
  ],
  pot: [
    { colour: "#b4673f", rough: 0.85 },
    { colour: "#e6e1d8", rough: 0.6 },
    { colour: "#4a4643", rough: 0.7 },
  ],
  box: [
    { colour: "#d8cfbf", rough: 0.9 },
    { colour: "#b08d62", rough: 0.85 },
    { colour: "#a5814f", rough: 0.95 },
  ],
} as const;
/** leaves, a few greens about the house's foliage; how rough, and how
    much darker a leaf's underside is */
const LEAVES = ["#4f6b3a", "#5d7a43", "#465f34"] as const;
const LEAF_ROUGH = 0.7;
const LEAF_UNDER = 0.35;

/** a solid painted in one finish: its colour and roughness on every
    vertex, and whether it is a leaf, the attributes the material reads
    (`color`, `rough`, `leaf`). A leaf's underside is darker than its
    top, as the light falls on the one and not the other */
const painted = (
  g: BufferGeometry,
  colour: string,
  rough: number,
  leaf = false,
) => {
  const n = g.getAttribute("position").count;
  const normal = g.getAttribute("normal");
  const c = new Color(colour);
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = leaf ? 1 - LEAF_UNDER * Math.max(0, -normal.getY(i)) : 1;
    c.toArray(colours, i * 3);
    for (let j = 0; j < 3; j++) colours[i * 3 + j] = colours[i * 3 + j]! * k;
  }
  g.setAttribute("color", new Float32BufferAttribute(colours, 3));
  g.setAttribute(
    "rough",
    new Float32BufferAttribute(new Float32Array(n).fill(rough), 1),
  );
  g.setAttribute(
    "leaf",
    new Float32BufferAttribute(new Float32Array(n).fill(leaf ? 1 : 0), 1),
  );
  // the solids differ in what they carry: only what all of them have
  for (const name of Object.keys(g.attributes))
    if (!["position", "normal", "uv", "color", "rough", "leaf"].includes(name))
      g.deleteAttribute(name);
  return g;
};

/** a vase's profile, turned: a foot, a belly and a lip, its height `h`
    and widest `w` */
const vase = (w: number, h: number) => {
  const r = w / 2;
  const points = [
    [0, 0],
    [r * 0.55, 0],
    [r * 0.85, h * 0.18],
    [r, h * 0.42],
    [r * 0.7, h * 0.72],
    [r * 0.45, h * 0.88],
    [r * 0.52, h],
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(points, 20);
};

/** a small plant: a tapered pot a third of its height, soil, and a few
    leaves, flattened blobs, about the stem's top */
const plant = (o: ShelfObject) => {
  const potH = o.h * 0.38;
  const r = Math.min(o.w, o.d) / 2;
  const pot = FINISHES.pot[o.tone % FINISHES.pot.length]!;
  const parts = [
    painted(
      new CylinderGeometry(r * 0.62, r * 0.48, potH, 16).translate(
        0,
        potH / 2,
        0,
      ),
      pot.colour,
      pot.rough,
    ),
  ];
  const leaves = 6;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + o.tone;
    const lift = potH + (o.h - potH) * (0.35 + (i % 3) * 0.22);
    const reach = r * (0.45 + (i % 2) * 0.25);
    const leaf = new IcosahedronGeometry(0.5, 1)
      .scale(r * 0.55, r * 0.16, r * 0.9)
      .applyMatrix4(new Matrix4().makeRotationX(-0.35))
      .applyMatrix4(new Matrix4().makeRotationY(-a))
      .translate(Math.cos(a) * reach, lift, Math.sin(a) * reach);
    parts.push(painted(leaf, LEAVES[i % LEAVES.length]!, LEAF_ROUGH, true));
  }
  return parts;
};

/** a potted plant's leaves (Furniture3D's Plant, standing on the floor):
    `count` flattened blobs about the stem, each turned out and tipped
    up, in a shade of the foliage, as one solid painted as a shelf's
    objects are; `r` the plant's reach, `from` and `to` how high the
    leaves start and end, m */
export const plantLeaves = (
  r: number,
  from: number,
  to: number,
  colour: string,
  seed: number,
  count = 9,
) => {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (seed % 7) * 0.3;
    const lift = from + (to - from) * (0.45 + ((i * 37 + seed) % 10) / 22);
    const len = r * (0.9 + ((i * 11 + seed) % 5) / 10);
    const leaf = new SphereGeometry(0.5, 10, 8)
      .scale(len * 0.42, r * 0.16, len)
      .applyMatrix4(new Matrix4().makeRotationX(0.35 + ((i * 5) % 3) * 0.12))
      .applyMatrix4(new Matrix4().makeRotationY(-a))
      .translate(Math.cos(a) * len * 0.5, lift, Math.sin(a) * len * 0.5);
    const tone = shade(colour, (((i * 3 + seed) % 5) - 2) * 0.03);
    parts.push(painted(leaf, tone, LEAF_ROUGH, true));
  }
  const merged = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
  );
  for (const p of parts) p.dispose();
  return merged;
};

/** a lidded box: its body, and a lid a little proud of it */
const box = (o: ShelfObject) => {
  const f = FINISHES.box[o.tone % FINISHES.box.length]!;
  const lid = Math.min(0.02, o.h * 0.2);
  return [
    painted(
      new BoxGeometry(o.w, o.h - lid, o.d).translate(0, (o.h - lid) / 2, 0),
      f.colour,
      f.rough,
    ),
    painted(
      new BoxGeometry(o.w + 0.004, lid, o.d + 0.004).translate(
        0,
        o.h - lid / 2,
        0,
      ),
      f.colour,
      Math.max(0, f.rough - 0.1),
    ),
  ];
};

/** a shelf's (or a piece's) objects as one geometry, each at its place
    and turn; none when there are none */
export const shelfObjectsGeometry = (
  objects: readonly ShelfObject[],
): BufferGeometry | null => {
  const parts: BufferGeometry[] = [];
  for (const o of objects) {
    const placed = new Matrix4()
      .makeTranslation(o.x, o.y, o.z)
      .multiply(new Matrix4().makeRotationY(o.turn));
    const solids =
      o.kind === "vase"
        ? (() => {
            const f = FINISHES.vase[o.tone % FINISHES.vase.length]!;
            return [painted(vase(o.w, o.h), f.colour, f.rough)];
          })()
        : o.kind === "plant"
          ? plant(o)
          : box(o);
    for (const s of solids) parts.push(s.applyMatrix4(placed));
  }
  if (parts.length === 0) return null;
  // the solids made indexed or not alike, as the merge asks
  const merged = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
  );
  for (const p of parts) p.dispose();
  return merged;
};
