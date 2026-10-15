import {
  BufferAttribute,
  BufferGeometry,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
  Vector2,
  Vector3,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STUDIO_MATERIALS, type StudioMaterial } from "./studio-materials";

/**
 * A generated mesh made fit for the room (round 8, Part 3b), in the
 * browser: the brief asks for glTF Transform on the server, which is a
 * new dependency, so the same steps are done here with three's own
 * tools, once for each loaded mesh. Its vertices are welded where they
 * meet, so its parts can be told apart; the stray parts a generator
 * leaves floating round an object are dropped; a mesh with holes, or
 * with too few texels a metre to read up close, is turned away (the
 * item then stands as the studio's own form); and its colour picture is
 * de-lit, divided by a blurred luminance of itself, so the shadows the
 * picture was generated with do not lie over the room's own light. The
 * budget (model-budget.ts) then brings it within what a model may cost.
 */
export const CLEAN = {
  /** a part with less than this share of the triangles is a stray */
  stray: 0.02,
  /** welding: positions this close (m, as generated) are one */
  weld: 1e-4,
  /** a mesh with more than this share of its edges open has holes */
  holes: 0.02,
  /** the fewest texels a metre its picture may have */
  texels: 128,
  /** de-lighting: the blurred luminance's size, px, and how far one
      texel may be lifted or lowered */
  delight: { blur: 16, least: 0.6, most: 1.6 },
};

/** a geometry of its positions only, welded where they meet, its
    triangles in the order they came */
const welded = (g: BufferGeometry) => {
  const bare = new BufferGeometry();
  bare.setAttribute("position", g.attributes.position!);
  if (g.index) bare.setIndex(g.index);
  return mergeVertices(bare, CLEAN.weld);
};

const triangles = (g: BufferGeometry) =>
  Math.floor((g.index ? g.index.count : g.attributes.position!.count) / 3);

/** each triangle's part: the triangles joined by a shared corner */
export const partsOf = (g: BufferGeometry): Int32Array => {
  const w = welded(g);
  const index = w.index!;
  const parent = new Int32Array(w.attributes.position!.count).map((_, i) => i);
  const find = (v: number): number => {
    while (parent[v] !== v) v = parent[v] = parent[parent[v]!]!;
    return v;
  };
  const n = triangles(w);
  for (let t = 0; t < n; t++) {
    const a = find(index.getX(t * 3));
    const b = find(index.getX(t * 3 + 1));
    const c = find(index.getX(t * 3 + 2));
    parent[b] = a;
    parent[find(c)] = a;
  }
  const out = new Int32Array(n);
  for (let t = 0; t < n; t++) out[t] = find(index.getX(t * 3));
  return out;
};

/** the share of the welded mesh's edges that only one triangle has */
export const openShare = (g: BufferGeometry) => {
  const w = welded(g);
  const index = w.index!;
  const edges = new Map<string, number>();
  for (let t = 0; t < triangles(w); t++)
    for (let k = 0; k < 3; k++) {
      const a = index.getX(t * 3 + k);
      const b = index.getX(t * 3 + ((k + 1) % 3));
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  let open = 0;
  for (const n of edges.values()) if (n === 1) open += 1;
  return edges.size ? open / edges.size : 0;
};

/** the geometry with only the triangles `keep` says, its material
    groups kept, and only the vertices they use (so its box is theirs) */
const keepTriangles = (g: BufferGeometry, keep: (t: number) => boolean) => {
  const corner = (i: number) => (g.index ? g.index.getX(i) : i);
  const groups = g.groups.length
    ? g.groups
    : [{ start: 0, count: triangles(g) * 3, materialIndex: 0 }];
  const used = new Map<number, number>();
  const at = (v: number) => {
    let n = used.get(v);
    if (n === undefined) used.set(v, (n = used.size));
    return n;
  };
  const index: number[] = [];
  const out = new BufferGeometry();
  for (const group of groups) {
    const start = index.length;
    for (let i = group.start; i + 2 < group.start + group.count; i += 3)
      if (keep(i / 3))
        index.push(at(corner(i)), at(corner(i + 1)), at(corner(i + 2)));
    if (g.groups.length)
      out.addGroup(start, index.length - start, group.materialIndex ?? 0);
  }
  for (const [name, attr] of Object.entries(g.attributes)) {
    const src = attr as BufferAttribute;
    const data = new Float32Array(used.size * src.itemSize);
    for (const [v, n] of used)
      for (let k = 0; k < src.itemSize; k++)
        data[n * src.itemSize + k] = src.getComponent(v, k);
    out.setAttribute(
      name,
      new BufferAttribute(data, src.itemSize, src.normalized),
    );
  }
  out.setIndex(index);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
};

/** the geometry without the stray parts: those under CLEAN.stray of
    the triangles; how many were dropped */
export const dropStrays = (g: BufferGeometry) => {
  const parts = partsOf(g);
  const sizes = new Map<number, number>();
  for (const p of parts) sizes.set(p, (sizes.get(p) ?? 0) + 1);
  const least = parts.length * CLEAN.stray;
  const stray = new Set(
    [...sizes].filter(([, n]) => n < least).map(([p]) => p),
  );
  if (stray.size === 0 || stray.size === sizes.size)
    return { geometry: g, dropped: 0 };
  return {
    geometry: keepTriangles(g, (t) => !stray.has(parts[t]!)),
    dropped: stray.size,
  };
};

/** texels a metre a mesh's picture has: the picture's pixels over the
    share of it the mesh's coordinates cover, across its surface */
export const texelsPerMetre = (g: BufferGeometry, side: [number, number]) => {
  const pos = g.attributes.position as BufferAttribute;
  const uv = g.attributes.uv as BufferAttribute | undefined;
  if (!uv) return 0;
  const corner = (i: number) => (g.index ? g.index.getX(i) : i);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const p = new Vector2();
  const q = new Vector2();
  const r = new Vector2();
  let area = 0;
  let uvArea = 0;
  for (let t = 0; t < triangles(g); t++) {
    a.fromBufferAttribute(pos, corner(t * 3));
    b.fromBufferAttribute(pos, corner(t * 3 + 1));
    c.fromBufferAttribute(pos, corner(t * 3 + 2));
    area += b.sub(a).cross(c.sub(a)).length() / 2;
    p.fromBufferAttribute(uv, corner(t * 3));
    q.fromBufferAttribute(uv, corner(t * 3 + 1)).sub(p);
    r.fromBufferAttribute(uv, corner(t * 3 + 2)).sub(p);
    uvArea += Math.abs(q.x * r.y - q.y * r.x) / 2;
  }
  if (area <= 0) return 0;
  return Math.sqrt((side[0] * side[1] * Math.min(1, uvArea)) / area);
};

const meshesOf = (root: Object3D) => {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
};
const materialsOf = (m: Mesh): Material[] =>
  Array.isArray(m.material) ? m.material : [m.material];
const sideOf = (tex: Texture | null | undefined): [number, number] => {
  const img = tex?.image as { width?: number; height?: number } | undefined;
  return [img?.width ?? 0, img?.height ?? 0];
};

/** why a generated mesh is turned away, or null when it may stand: its
    holes, or too few texels a metre on its largest part. Its size is as
    generated, so the texels are read at the size it is asked to stand */
export const refuseMesh = (root: Object3D, longest: number) => {
  const meshes = meshesOf(root);
  if (meshes.length === 0) return "it came with no mesh";
  const box = meshes.reduce((n, m) => {
    m.geometry.computeBoundingBox();
    const s = m.geometry.boundingBox!.getSize(new Vector3());
    return Math.max(n, s.x, s.y, s.z);
  }, 0);
  const scale = box > 0 ? longest / box : 1;
  for (const m of meshes) {
    if (openShare(m.geometry) > CLEAN.holes) return "it came with holes";
    const map = (materialsOf(m)[0] as MeshStandardMaterial).map;
    if (map && texelsPerMetre(m.geometry, sideOf(map)) / scale < CLEAN.texels)
      return "its picture is too coarse to read up close";
  }
  return null;
};

/** a colour picture with its light taken out: each texel divided by the
    blurred luminance round it, over the picture's mean, clamped, so its
    colour and its pattern stay and its baked shading goes */
export const delight = (tex: Texture) => {
  const [w, h] = sideOf(tex);
  if (!w || !h || typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(tex.image as CanvasImageSource, 0, 0);
  const px = ctx.getImageData(0, 0, w, h);
  // the blur: the picture drawn small and back up, smoothed both ways
  const { blur, least, most } = CLEAN.delight;
  const small = document.createElement("canvas");
  small.width = blur;
  small.height = blur;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, blur, blur);
  const big = document.createElement("canvas");
  big.width = w;
  big.height = h;
  const bctx = big.getContext("2d", { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, w, h);
  const soft = bctx.getImageData(0, 0, w, h).data;
  const lum = (d: Uint8ClampedArray, i: number) =>
    0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
  let mean = 0;
  for (let i = 0; i < soft.length; i += 4) mean += lum(soft, i);
  mean /= soft.length / 4 || 1;
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = Math.min(most, Math.max(least, mean / Math.max(1, lum(soft, i))));
    d[i] = d[i]! * k;
    d[i + 1] = d[i + 1]! * k;
    d[i + 2] = d[i + 2]! * k;
  }
  ctx.putImageData(px, 0, 0);
  tex.image = canvas;
  tex.needsUpdate = true;
  return true;
};

const cleaned = new WeakSet<Object3D>();
/** a loaded generated mesh cleaned once (its copies share it): strays
    dropped, its colour pictures de-lit */
export const cleanModel = (root: Object3D) => {
  if (cleaned.has(root)) return;
  cleaned.add(root);
  const seen = new Set<Texture>();
  for (const mesh of meshesOf(root)) {
    const { geometry, dropped } = dropStrays(mesh.geometry);
    if (dropped) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
    for (const m of materialsOf(mesh)) {
      const map = (m as MeshStandardMaterial).map;
      if (map && !seen.has(map)) {
        seen.add(map);
        delight(map);
      }
    }
  }
};

/** a generated material as the studio's: its colour picture kept (de-lit)
    as the tint, its surface the studio's for what it is made of; the
    generated roughness and metal pictures left out, as they were drawn
    under the generator's light */
export const asStudio = (own: MeshStandardMaterial, kind: StudioMaterial) => {
  const m = own.clone();
  const s = STUDIO_MATERIALS[kind];
  m.roughness = s.roughness;
  m.metalness = s.metalness;
  m.roughnessMap = null;
  m.metalnessMap = null;
  if ("sheen" in m) (m as unknown as { sheen: number }).sheen = s.sheen;
  m.userData.own = true;
  return m;
};
