import {
  BufferAttribute,
  BufferGeometry,
  type Intersection,
  type Material,
  Matrix4,
  type Mesh,
  type Object3D,
  Ray,
  type Raycaster,
  type Texture,
  Vector3,
} from "three";

/**
 * What a model may cost once it is in the room, whatever made it: a
 * stock prop, or one generated while the studio runs (a generated mesh
 * comes with hundreds of thousands of triangles and pictures four
 * thousand pixels a side). The stock props stand inside it (the largest
 * has some eleven thousand triangles, its pictures 768 pixels a side),
 * so only a model past it is changed.
 */
export const MODEL_BUDGET = {
  /** triangles for the whole model */
  triangles: 12_000,
  /** the longest side of any of its pictures, px */
  textureSide: 1024,
};

/** the triangles a geometry draws */
export const trianglesOf = (g: BufferGeometry) =>
  Math.floor((g.index ? g.index.count : g.attributes.position!.count) / 3);

/** the cells along the longest side a model is clustered into, at most:
    the key packs three cell numbers of ten bits */
const AXIS_CELLS = 1023;
/** how far apart two vertices' picture coordinates may be and still be
    gathered into one: past it they stand either side of a seam in the
    picture, and are kept apart so the picture is not smeared across it */
const SEAM = 0.05;

/**
 * The geometry drawn with fewer triangles: its vertices gathered into
 * cells of a grid over its box (those either side of a seam in its
 * picture apart), each cell's first vertex standing for the rest, and the triangles that
 * fold to a line or a point left out. One pass over the triangles and
 * one over the vertices, so a model of half a million triangles is
 * brought down in a moment; the cell is first sized from the surface's
 * area for about two triangles a cell, and grown until the count fits.
 */
export const clusterGeometry = (
  g: BufferGeometry,
  target: number,
): BufferGeometry => {
  if (trianglesOf(g) <= target) return g;
  const pos = g.attributes.position as BufferAttribute;
  const uv = g.attributes.uv as BufferAttribute | undefined;
  const corner = (t: number, k: number) =>
    g.index ? g.index.getX(t * 3 + k) : t * 3 + k;
  g.computeBoundingBox();
  const box = g.boundingBox!;
  const size = box.getSize(new Vector3());
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let area = 0;
  const tris = trianglesOf(g);
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, corner(t, 0));
    b.fromBufferAttribute(pos, corner(t, 1));
    c.fromBufferAttribute(pos, corner(t, 2));
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  const longest = Math.max(size.x, size.y, size.z) || 1;
  let cell = Math.max(
    Math.sqrt(area / Math.max(1, target / 2)),
    longest / AXIS_CELLS,
  );
  let out = clusterAt(g, cell, box.min, uv);
  for (let pass = 0; pass < 6 && trianglesOf(out) > target; pass++) {
    cell *= 1.35;
    out = clusterAt(g, cell, box.min, uv);
  }
  return out;
};

const clusterAt = (
  g: BufferGeometry,
  cell: number,
  min: Vector3,
  uv: BufferAttribute | undefined,
) => {
  const pos = g.attributes.position as BufferAttribute;
  const count = pos.count;
  const keep = new Int32Array(count);
  // each cell's standing vertices; more than one only across a seam
  const standing = new Map<number, number[]>();
  const kept: number[] = [];
  for (let v = 0; v < count; v++) {
    const ix = Math.min(AXIS_CELLS, Math.floor((pos.getX(v) - min.x) / cell));
    const iy = Math.min(AXIS_CELLS, Math.floor((pos.getY(v) - min.y) / cell));
    const iz = Math.min(AXIS_CELLS, Math.floor((pos.getZ(v) - min.z) / cell));
    const key = (ix * 1024 + iy) * 1024 + iz;
    let list = standing.get(key);
    if (!list) standing.set(key, (list = []));
    let at = -1;
    for (const k of list) {
      const w = kept[k]!;
      if (
        !uv ||
        (Math.abs(uv.getX(w) - uv.getX(v)) <= SEAM &&
          Math.abs(uv.getY(w) - uv.getY(v)) <= SEAM)
      ) {
        at = k;
        break;
      }
    }
    if (at < 0) {
      at = kept.length;
      kept.push(v);
      list.push(at);
    }
    keep[v] = at;
  }
  const index: number[] = [];
  const corner = (i: number) => keep[g.index ? g.index.getX(i) : i]!;
  // each material's triangles kept together, as its group says
  const groups = g.groups.length
    ? g.groups
    : [{ start: 0, count: trianglesOf(g) * 3, materialIndex: 0 }];
  const ranges: { start: number; count: number; materialIndex: number }[] = [];
  for (const group of groups) {
    const start = index.length;
    for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
      const i0 = corner(i);
      const i1 = corner(i + 1);
      const i2 = corner(i + 2);
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      index.push(i0, i1, i2);
    }
    ranges.push({
      start,
      count: index.length - start,
      materialIndex: group.materialIndex ?? 0,
    });
  }
  const out = new BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const src = attr as BufferAttribute;
    const size = src.itemSize;
    const data = new Float32Array(kept.length * size);
    kept.forEach((v, i) => {
      for (let k = 0; k < size; k++)
        data[i * size + k] = src.getComponent(v, k);
    });
    // getComponent gives the values as they are meant (a quantized
    // model's are normalized integers), so the floats are not: WebGPU
    // has no vertex format for normalized float32
    out.setAttribute(name, new BufferAttribute(data, size));
  }
  out.setIndex(index);
  if (g.groups.length)
    for (const r of ranges) out.addGroup(r.start, r.count, r.materialIndex);
  if (g.attributes.normal) out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
};

/** every picture a material draws with */
const texturesOf = (m: Material) =>
  Object.values(m).filter(
    (v): v is Texture => !!v && (v as Texture).isTexture === true,
  );

/** a picture past the side brought down to it, drawn into a canvas */
const fitTexture = (tex: Texture, side: number) => {
  const img = tex.image as
    | { width: number; height: number }
    | (CanvasImageSource & { width: number; height: number })
    | null;
  if (!img || !img.width || !img.height) return false;
  const longest = Math.max(img.width, img.height);
  if (longest <= side || typeof document === "undefined") return false;
  const k = side / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * k));
  canvas.height = Math.max(1, Math.round(img.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  tex.image = canvas;
  tex.needsUpdate = true;
  return true;
};

const inverse = new Matrix4();
const localRay = new Ray();
const hit = new Vector3();
/**
 * A model's mesh picked by its box, not by each of its triangles: the
 * pointer is read against every piece the canvas can pick at each move,
 * and a model of tens of thousands of triangles cost that many tests.
 */
export function boxRaycast(
  this: Mesh,
  raycaster: Raycaster,
  intersects: Intersection[],
) {
  const g = this.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  inverse.copy(this.matrixWorld).invert();
  localRay.copy(raycaster.ray).applyMatrix4(inverse);
  if (!localRay.intersectBox(g.boundingBox!, hit)) return;
  const point = hit.clone().applyMatrix4(this.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(point);
  if (distance < raycaster.near || distance > raycaster.far) return;
  intersects.push({ distance, point, object: this });
}

/** what bringing a model within the budget did, for the stage to say */
export type Budgeted = {
  /** its triangles as it came, and as it stands */
  from: number;
  to: number;
  /** pictures brought down */
  textures: number;
};

const done = new WeakMap<Object3D, Budgeted>();

/**
 * A loaded model brought within `MODEL_BUDGET`, once (its clones share
 * what was done): each mesh simplified in its share of the triangles,
 * each picture past the side brought down, and every mesh picked by its
 * box.
 */
export const budgetModel = (root: Object3D): Budgeted => {
  const known = done.get(root);
  if (known) return known;
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  const from = meshes.reduce((n, m) => n + trianglesOf(m.geometry), 0);
  let to = 0;
  const seen = new Set<Texture>();
  let textures = 0;
  for (const mesh of meshes) {
    if (from > MODEL_BUDGET.triangles) {
      const share = Math.max(
        12,
        Math.floor(
          (MODEL_BUDGET.triangles * trianglesOf(mesh.geometry)) / from,
        ),
      );
      const before = mesh.geometry;
      mesh.geometry = clusterGeometry(before, share);
      if (mesh.geometry !== before) before.dispose();
    }
    to += trianglesOf(mesh.geometry);
    mesh.raycast = boxRaycast;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const m of materials)
      for (const tex of texturesOf(m)) {
        if (seen.has(tex)) continue;
        seen.add(tex);
        if (fitTexture(tex, MODEL_BUDGET.textureSide)) textures += 1;
      }
  }
  const result = { from, to, textures };
  done.set(root, result);
  return result;
};
