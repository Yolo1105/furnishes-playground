"use client";

import { RoundedBox } from "@react-three/drei";
import {
  BoxGeometry,
  type BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Vector2,
  type Vector3Tuple,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  CLOTH_M,
  clothSurface,
  shade,
  type Surface,
  WOOD_M,
  woodSurface,
} from "./textures";

/**
 * The surfaces and the simple parts every 3D form is built from: a
 * finish (a colour, how it catches the light, a grain), the material
 * that draws it, and a slab, a soft block and a rod. The pieces and
 * the room items in Furniture3D and the panels in Panels3D share
 * them, so a panel edited by hand looks like the same wood as the
 * piece it came from.
 */

/** an 18 mm panel, m */
export const PANEL = 0.018;
export const METAL = "#8d8780";

/** how a finish catches the light */
export const roughnessOf = (texture: string) =>
  texture === "Satin"
    ? 0.4
    : texture === "Linen"
      ? 0.95
      : texture === "Wood grain"
        ? 0.55
        : 0.85;

/** a surface's grain: the maps it is drawn with and the stretch, m,
    one tile of them covers */
type Grain = { surface: Surface; tile: number };
const woodGrain = (): Grain => ({ surface: woodSurface(), tile: WOOD_M });
const clothGrain = (): Grain => ({ surface: clothSurface(), tile: CLOTH_M });

/** a surface: its colour, how it catches the light, a grain if any */
export type Finish = {
  colour: string;
  rough: number;
  grain?: Grain | undefined;
  /** cloth: a soft sheen across the weave */
  sheen?: number;
  /** glaze: a clear coat over the colour */
  coat?: number;
  metal?: number;
};
export const cloth = (colour: string): Finish => ({
  colour,
  rough: 0.95,
  sheen: 0.5,
  grain: clothGrain(),
});
/** wood under a light lacquer: the grain's relief under a thin gloss */
export const wood = (colour: string, grain = true): Finish => ({
  colour,
  rough: 0.55,
  coat: 0.12,
  grain: grain ? woodGrain() : undefined,
});
export const metal = (colour: string, rough = 0.35): Finish => ({
  colour,
  rough,
  metal: 0.85,
});
/** a piece's own finish, from the Detail tab's colour and texture */
export const finishOf = (colour: string, texture: string): Finish => ({
  colour,
  rough: roughnessOf(texture),
  ...(texture === "Wood grain"
    ? { grain: woodGrain(), coat: 0.12 }
    : texture === "Linen"
      ? { grain: clothGrain(), sheen: 0.4 }
      : texture === "Satin"
        ? { coat: 0.3 }
        : {}),
});

/** how strongly a grain's relief bends the light */
const RELIEF_SCALE = new Vector2(0.6, 0.6);

/** a grain's maps repeated by the tile's stretch over a part whose
    texture lies in metres: a slab's wood is laid in its geometry
    already (slabGeometry, in wood tiles), so wood repeats once; cloth
    over a rounded part takes a few cloth tiles per wood tile */
const grainMaps = (grain: Grain | undefined) => {
  if (!grain) return null;
  const { surface, tile } = grain;
  const repeat = WOOD_M / tile;
  for (const t of [surface.map, surface.normalMap, surface.roughnessMap])
    if (t.repeat.x !== repeat) t.repeat.set(repeat, repeat);
  return surface;
};

export function Mat({
  f,
  colour,
  banded = false,
}: {
  f: Finish;
  colour?: string | undefined;
  /** the part is a slab with its edge band in its vertex colours */
  banded?: boolean;
}) {
  const c = colour ?? f.colour;
  const maps = grainMaps(f.grain);
  const grained = {
    map: maps?.map ?? null,
    normalMap: maps?.normalMap ?? null,
    normalScale: RELIEF_SCALE,
    roughnessMap: maps?.roughnessMap ?? null,
    vertexColors: banded,
  };
  if (f.sheen !== undefined || f.coat !== undefined)
    return (
      <meshPhysicalMaterial
        color={c}
        roughness={f.rough}
        {...grained}
        sheen={f.sheen ?? 0}
        sheenColor={shade(c, 0.1)}
        sheenRoughness={0.8}
        clearcoat={f.coat ?? 0}
        clearcoatRoughness={0.3}
      />
    );
  return (
    <meshStandardMaterial
      color={c}
      roughness={f.rough}
      {...grained}
      metalness={f.metal ?? 0}
    />
  );
}

/** the eased edge of a panel, m: two panels meeting leave a seam a
    few millimetres wide that catches a line of light or shadow, so
    where one board ends and the next begins is read at a glance */
const EDGE = 0.0025;
/** how much darker a panel's edge band stands than its face: the
    four narrow faces of a board are banded, and read as its outline */
const BAND = 0.86;
/** how dark the eased edge itself stands: the seam between two boards
    is drawn as the line a joint shows, so every board is outlined */
const SEAM = 0.72;
/** a slab's geometry: a box with its edges eased, its texture laid in
    metres with the grain along the panel's longer side (a top's along
    its length, a side's up its height, a door's up its height), so no
    two parts of a piece carry the grain the same way and each face
    takes the tile at one size; the four narrow faces carry the band's
    tone as a vertex colour. Kept by size, since a piece's panels
    repeat */
const slabs = new Map<string, BufferGeometry>();
const SLABS_KEPT = 512;
const slabGeometry = (dims: Vector3Tuple) => {
  const key = dims.join(",");
  const had = slabs.get(key);
  if (had) return had;
  const [w, h, d] = dims;
  const edge = Math.min(EDGE, Math.min(w, h, d) / 3);
  const g = new RoundedBoxGeometry(w, h, d, 2, edge);
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  const tone = new Float32Array(pos.count * 3);
  // the board's thickness runs along its shortest side: the two faces
  // across it are the board's faces, the other four its edge band
  const thin = Math.min(w, h, d);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // the face's two coordinates, the longer side first: the grain
    let a: number;
    let b: number;
    let across: number;
    if (nx >= ny && nx >= nz) {
      [a, b] = h >= d ? [y, z] : [z, y];
      across = w;
    } else if (ny >= nz) {
      [a, b] = w >= d ? [x, z] : [z, x];
      across = h;
    } else {
      [a, b] = w >= h ? [x, y] : [y, x];
      across = d;
    }
    uv.setXY(i, a / WOOD_M, b / WOOD_M);
    // a vertex on the eased edge faces no one axis
    const eased = Math.max(nx, ny, nz) < 0.98;
    const t = eased ? SEAM : across === thin ? 1 : BAND;
    tone[i * 3] = t;
    tone[i * 3 + 1] = t;
    tone[i * 3 + 2] = t;
  }
  uv.needsUpdate = true;
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
  if (slabs.size >= SLABS_KEPT) {
    const oldest = slabs.keys().next().value!;
    slabs.get(oldest)!.dispose();
    slabs.delete(oldest);
  }
  slabs.set(key, g);
  return g;
};

/** the joint lines of a slab: its twelve edges as the hairline two
    eased edges leave where boards meet, a hair outside the slab so
    they lie on its surface, drawn and never picked */
const joints = new Map<string, BufferGeometry>();
const JOINT_OUT = 0.0004;
/** how far below the board's colour its joint lines stand, and how
    much they cover */
const JOINT_SHADE = -0.3;
const JOINT_OPACITY = 0.55;
const jointGeometry = (dims: Vector3Tuple) => {
  const key = dims.join(",");
  const had = joints.get(key);
  if (had) return had;
  const [w, h, d] = dims;
  const g = new EdgesGeometry(
    new BoxGeometry(w + JOINT_OUT, h + JOINT_OUT, d + JOINT_OUT),
  );
  if (joints.size >= SLABS_KEPT) {
    const oldest = joints.keys().next().value!;
    joints.get(oldest)!.dispose();
    joints.delete(oldest);
  }
  joints.set(key, g);
  return g;
};
const unpickable = () => null;

/** a square-edged part: a panel, a plinth, a frame member */
export function Slab({
  at,
  dims,
  f,
  colour,
  rotation,
}: {
  at: Vector3Tuple;
  dims: Vector3Tuple;
  f: Finish;
  colour?: string | undefined;
  rotation?: Vector3Tuple | undefined;
}) {
  return (
    <mesh
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
      geometry={slabGeometry(dims)}
    >
      <Mat f={f} colour={colour} banded />
      <lineSegments geometry={jointGeometry(dims)} raycast={unpickable}>
        <lineBasicMaterial
          color={shade(colour ?? f.colour, JOINT_SHADE)}
          transparent
          opacity={JOINT_OPACITY}
        />
      </lineSegments>
    </mesh>
  );
}

/** a soft part: a cushion, a mattress, a table top */
export function Soft({
  at,
  dims,
  f,
  radius = 0.03,
  rotation,
}: {
  at: Vector3Tuple;
  dims: Vector3Tuple;
  f: Finish;
  radius?: number;
  rotation?: Vector3Tuple | undefined;
}) {
  const r = Math.min(radius, Math.min(...dims) / 2 - 0.001);
  return (
    <RoundedBox
      args={dims}
      radius={Math.max(0.002, r)}
      smoothness={3}
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
    >
      <Mat f={f} />
    </RoundedBox>
  );
}

/** a round part: a leg, a stem, a handle, a castor; upright unless turned */
export function Rod({
  at,
  r,
  h,
  f,
  top,
  rotation,
}: {
  at: Vector3Tuple;
  r: number;
  h: number;
  f: Finish;
  top?: number;
  rotation?: Vector3Tuple | undefined;
}) {
  return (
    <mesh
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[top ?? r, r, h, 20]} />
      <Mat f={f} />
    </mesh>
  );
}
