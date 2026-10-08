"use client";

import { RoundedBox } from "@react-three/drei";
import { type CanvasTexture, Vector2, type Vector3Tuple } from "three";
import { reliefOf, shade, woodTexture } from "./textures";

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
    ? 0.45
    : texture === "Linen"
      ? 1
      : texture === "Wood grain"
        ? 0.75
        : 0.9;

/** a surface: its colour, how it catches the light, a grain if any */
export type Finish = {
  colour: string;
  rough: number;
  map?: CanvasTexture | undefined;
  /** cloth: a soft sheen across the weave */
  sheen?: number;
  /** glaze: a clear coat over the colour */
  coat?: number;
  metal?: number;
};
export const cloth = (colour: string): Finish => ({
  colour,
  rough: 0.95,
  sheen: 0.6,
});
export const wood = (colour: string, grain = true): Finish => ({
  colour,
  rough: 0.7,
  map: grain ? woodTexture(colour) : undefined,
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
  map: texture === "Wood grain" ? woodTexture(colour) : undefined,
});

/** how strongly the grain's relief bends the light */
const RELIEF_SCALE = new Vector2(0.35, 0.35);

export function Mat({ f, colour }: { f: Finish; colour?: string | undefined }) {
  const c = colour ?? f.colour;
  if (f.sheen !== undefined || f.coat !== undefined)
    return (
      <meshPhysicalMaterial
        color={c}
        roughness={f.rough}
        sheen={f.sheen ?? 0}
        sheenColor={shade(c, 0.1)}
        sheenRoughness={0.8}
        clearcoat={f.coat ?? 0}
        clearcoatRoughness={0.25}
      />
    );
  const map = f.map && colour === undefined ? f.map : null;
  const relief = map ? reliefOf(map) : null;
  return (
    <meshStandardMaterial
      color={f.map ? shade(c, 0.02) : c}
      map={map}
      normalMap={relief?.normalMap ?? null}
      normalScale={RELIEF_SCALE}
      roughnessMap={relief?.roughnessMap ?? null}
      roughness={f.rough}
      metalness={f.metal ?? 0}
    />
  );
}

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
    >
      <boxGeometry args={dims} />
      <Mat f={f} colour={colour} />
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
