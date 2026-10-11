"use client";

import { useEffect, useMemo } from "react";
import { Vector2, type Vector3Tuple } from "three";
import { type MaterialName, repeated, useMaterial } from "./materials";
import {
  batchesOf,
  JOINT_OPACITY,
  JOINT_SHADE,
  jointGeometry,
  type Part,
  rodGeometry,
  slabGeometry,
  softGeometry,
} from "./part-geometry";
import { shade, WOOD_M } from "./textures";

export type { Part } from "./part-geometry";

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
  texture === "Satin" || texture === "Mirror"
    ? 0.4
    : texture === "Linen"
      ? 0.95
      : texture === "Wood grain"
        ? 0.55
        : 0.85;

/** a surface's grain: the material (materials.ts) it is drawn with */
type Grain = Extract<MaterialName, "wood" | "cloth">;
const woodGrain = (): Grain => "wood";
const clothGrain = (): Grain => "cloth";

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
  /** the doors' faces are mirrors (Mirror.tsx); the body keeps the
      satin finish */
  mirror?: boolean;
};
export const cloth = (colour: string): Finish => ({
  colour,
  rough: 0.95,
  sheen: 0.5,
  grain: clothGrain(),
});
/** wood under a satin lacquer: the grain's relief under a soft gloss
    that catches the window as a sheen across the panel */
export const wood = (colour: string, grain = true): Finish => ({
  colour,
  rough: 0.45,
  coat: 0.25,
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
    ? { grain: woodGrain(), coat: 0.25 }
    : texture === "Linen"
      ? { grain: clothGrain(), sheen: 0.4 }
      : texture === "Satin"
        ? { coat: 0.3 }
        : texture === "Mirror"
          ? { coat: 0.3, mirror: true }
          : {}),
});

/** how strongly a grain's relief bends the light */
const RELIEF_SCALE = new Vector2(0.6, 0.6);

/** a grain's maps repeated by its tile over a part whose texture lies
    in wood tiles (slabGeometry lays a slab's so; a rounded part's runs
    once over each face): the grown wood repeats once, a photographed
    set by its own stretch, cloth a few times. Follows the store, so a
    part is drawn again when its photographed set arrives */
const useGrainMaps = (grain: Grain | undefined) => {
  const m = useMaterial(grain ?? "wood");
  if (!grain) return null;
  return repeated(m, m.tile / WOOD_M);
};

export function Mat({
  f,
  colour,
  banded = false,
}: {
  f: Finish;
  colour?: string | undefined;
  /** the part carries a tone in its vertex colours: a slab its edge
      band, a soft block and a rod plain white. Every part a piece is
      built from carries one, so a finish is one shader to build and
      not two (the shader with vertex colours and the one without),
      which is most of what a furnished room costs to open */
  banded?: boolean;
}) {
  const c = colour ?? f.colour;
  const maps = useGrainMaps(f.grain);
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

/**
 * A built piece's boards and rods drawn a few meshes at a time: the
 * parts that share a finish and a colour are merged into one mesh, and
 * their joint lines into one set of lines, so a carcass of twenty
 * boards costs a draw or two a finish and not two a board (on screen,
 * again for each shadow, again for the outline). Each board keeps its
 * grain laid along its own longer side and its band, as a lone Slab
 * draws it; the piece is still picked as a whole, by its group.
 */
export function Built({ parts }: { parts: Part[] }) {
  // the parts as plain data: a piece drawn again with the same parts
  // keeps its merged geometry
  const key = JSON.stringify(parts);
  const batches = useMemo(() => batchesOf(JSON.parse(key) as Part[]), [key]);
  useEffect(
    () => () => {
      for (const b of batches) {
        b.faces.dispose();
        b.joints?.dispose();
      }
    },
    [batches],
  );
  return (
    <>
      {batches.map((b) => (
        <mesh key={b.key} geometry={b.faces} castShadow receiveShadow>
          <Mat f={b.f} colour={b.colour} banded />
          {b.joints && (
            <lineSegments geometry={b.joints} raycast={unpickable}>
              <lineBasicMaterial
                color={shade(b.colour ?? b.f.colour, JOINT_SHADE)}
                transparent
                opacity={JOINT_OPACITY}
              />
            </lineSegments>
          )}
        </mesh>
      ))}
    </>
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
    <mesh
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
      geometry={softGeometry(dims, Math.max(0.002, r))}
    >
      <Mat f={f} banded />
    </mesh>
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
      geometry={rodGeometry([r, h, top])}
    >
      <Mat f={f} banded />
    </mesh>
  );
}
