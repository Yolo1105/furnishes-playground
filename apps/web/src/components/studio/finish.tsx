"use client";

import { filteredRoughness } from "./spec-aa";
import { useEffect, useMemo } from "react";
import { Color, type Texture, Vector2, type Vector3Tuple } from "three";
import { MeshPhysicalNodeMaterial, type Node } from "three/webgpu";
import { plausible, toned, toneOf } from "./albedo";
import { type MaterialName, repeated, useMaterial } from "./materials";
import { plyColour } from "./ply";
import { useRoomReflection } from "./Reflection";
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
        ? WOOD_ROUGH
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
  /** birch plywood: its boards' edges show the plies (ply.ts) */
  ply?: boolean;
};
export const cloth = (colour: string): Finish => ({
  colour,
  rough: 0.95,
  sheen: 0.5,
  grain: clothGrain(),
});
/** wood as oiled timber: the roughness map halves what is set here
    (its mean is 0.5), so 1.1 reads as about 0.55, a matt board that
    sheens only at a grazing angle, under a coat thin enough to catch
    the window and no more. Under the satin lacquer it had (0.45 and a
    0.25 coat, so about 0.23 under the coat) every board read as
    varnished plastic */
const WOOD_ROUGH = 1.1;
const WOOD_COAT = 0.06;
export const wood = (colour: string, grain = true): Finish => ({
  colour,
  rough: WOOD_ROUGH,
  coat: WOOD_COAT,
  grain: grain ? woodGrain() : undefined,
});
export const metal = (colour: string, rough = 0.35): Finish => ({
  colour,
  rough,
  metal: 0.85,
});
/** the Furnishes pieces' wood grain under a satin lacquer, as they are
    finished: the roughness map halves what is set here (its mean is
    0.5), so 0.9 reads as about 0.45, the map's grain breaking the
    window's reflection along it, under a clear coat faint enough to
    catch the window and no more (the 0.23 under a 0.25 coat it once
    had read as varnished plastic) */
const LACQUER_ROUGH = 0.9;
const LACQUER_COAT = 0.08;
/** a Furnishes piece's own finish, from the Detail tab's colour and
    texture: 18 mm birch plywood, its edges showing the plies whatever
    its faces are finished in */
export const finishOf = (colour: string, texture: string): Finish => ({
  colour,
  rough: texture === "Wood grain" ? LACQUER_ROUGH : roughnessOf(texture),
  ply: true,
  ...(texture === "Wood grain"
    ? { grain: woodGrain(), coat: LACQUER_COAT }
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

/** how strongly a plain finish's stipple bends the light */
const STIPPLE_SCALE = new Vector2(0.25, 0.25);
type Stipple = { normalMap: Texture; roughnessMap: Texture };
const stipples = new WeakMap<object, Stipple>();
/** a plain finish (a paint, a lacquer, a laminate with no grain) is
    never a perfectly even sheet: the plaster's fine relief and its
    roughness, faintly, so the light breaks across it as across a real
    coat. A copy of the plaster's maps, repeated over the wood tiles a
    part's texture lies in, so the walls keep their own repeat; the
    copies share the plaster's pictures */
const useStipple = (on: boolean): Stipple | null => {
  const m = useMaterial("plaster");
  if (!on) return null;
  let s = stipples.get(m.surface);
  if (!s) {
    const r = WOOD_M / m.tile;
    const copy = (t: Texture) => {
      const c = t.clone();
      c.repeat.set(r, r);
      c.needsUpdate = true;
      return c;
    };
    s = {
      normalMap: copy(m.surface.normalMap),
      roughnessMap: copy(m.surface.roughnessMap),
    };
    stipples.set(m.surface, s);
  }
  return s;
};

/** the roughness under which a finish shows what stands round it */
const GLOSSY_BELOW = 0.5;
/** a finish that shows what stands round it: a clear coat, or smooth
    enough to (a lacquer, a satin wood, a screen's glass) */
const glossy = (f: Finish) =>
  !f.metal && !f.mirror && ((f.coat ?? 0) > 0 || f.rough < GLOSSY_BELOW);
/** a coated or sheened finish's layers: the cloth's sheen soft and a
    shade under its colour, the coat a little rough */
const LAYERS = { sheenRoughness: 0.8, sheenShade: 0.1, coatRoughness: 0.3 };
/** the faces stand a hair behind their own joint lines: a line on its
    face fought it for depth and flickered in and out as the camera
    moved, the furniture seeming to blink (the walls' cure) */
const BEHIND = {
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
} as const;

type MatProps = {
  colour: string;
  f: Finish;
  maps: Partial<Record<"map" | "normalMap" | "roughnessMap", Texture | null>>;
  normalScale: Vector2;
  banded: boolean;
};
/** the node-built finishes' materials, one for each look (the finish,
    the colour, the maps): the glossy ones with the room's reflection,
    plywood with its plies; shared by every part that has it, and made
    again when the room's picture is */
const glossies = new Map<string, MeshPhysicalNodeMaterial>();
let glossiesOf: Node | null = null;
/** how many looks are kept; past it the oldest is let go (not disposed:
    a part may still be drawn with it, and the next picture of the room
    disposes them all) */
const GLOSSIES_KEPT = 400;
const glossyMaterial = (env: Node | null, p: MatProps) => {
  if (env && glossiesOf !== env) {
    for (const m of glossies.values()) m.dispose();
    glossies.clear();
    glossiesOf = env;
  }
  const key = [
    env ? "room" : "",
    p.f.ply ? "ply" : "",
    p.colour,
    p.f.rough,
    p.f.sheen ?? "",
    p.f.coat ?? "",
    p.banded,
    p.maps.map?.uuid ?? "",
    p.maps.normalMap?.uuid ?? "",
    p.maps.roughnessMap?.uuid ?? "",
    p.normalScale.x,
  ].join("|");
  const had = glossies.get(key);
  if (had) return had;
  const m = new MeshPhysicalNodeMaterial({
    color: new Color(p.colour),
    roughness: p.f.rough,
    metalness: 0,
    map: p.maps.map ?? null,
    normalMap: p.maps.normalMap ?? null,
    normalScale: p.normalScale,
    roughnessMap: p.maps.roughnessMap ?? null,
    vertexColors: p.banded,
    ...BEHIND,
    sheen: p.f.sheen ?? 0,
    sheenColor: new Color(shade(p.colour, LAYERS.sheenShade)),
    sheenRoughness: LAYERS.sheenRoughness,
    clearcoat: p.f.coat ?? 0,
    clearcoatRoughness: LAYERS.coatRoughness,
  });
  if (env) m.envNode = env;
  // plywood: its edges the plies, its faces as the material draws them
  if (p.f.ply) m.colorNode = plyColour;
  // the lacquer's highlight held still far off (spec-aa.ts)
  m.roughnessNode = filteredRoughness;
  if (glossies.size >= GLOSSIES_KEPT)
    glossies.delete(glossies.keys().next().value!);
  glossies.set(key, m);
  return m;
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
  // within what a real surface reflects (albedo.ts)
  const c = plausible(colour ?? f.colour);
  const maps = useGrainMaps(f.grain);
  const stipple = useStipple(!f.grain && !f.metal && !f.mirror);
  // a glossy finish reflects the room, where the room has its picture
  const room = useRoomReflection((s) => s.node);
  const grained = {
    ...BEHIND,
    map: maps?.map ?? null,
    normalMap: maps?.normalMap ?? stipple?.normalMap ?? null,
    normalScale: maps ? RELIEF_SCALE : STIPPLE_SCALE,
    roughnessMap: maps?.roughnessMap ?? stipple?.roughnessMap ?? null,
    vertexColors: banded,
  };
  // a glossy finish reflects the room where it has its picture; plywood
  // draws its plies on its edges: both are node materials
  if ((room && glossy(f)) || f.ply)
    return (
      <primitive
        object={glossyMaterial(room && glossy(f) ? room : null, {
          colour: c,
          f,
          maps: {
            map: grained.map,
            normalMap: grained.normalMap,
            roughnessMap: grained.roughnessMap,
          },
          normalScale: grained.normalScale,
          banded,
        })}
        attach="material"
        dispose={null}
      />
    );
  if (f.sheen !== undefined || f.coat !== undefined)
    return (
      <meshPhysicalMaterial
        color={c}
        roughness={f.rough}
        {...grained}
        sheen={f.sheen ?? 0}
        sheenColor={shade(c, LAYERS.sheenShade)}
        sheenRoughness={LAYERS.sheenRoughness}
        clearcoat={f.coat ?? 0}
        clearcoatRoughness={LAYERS.coatRoughness}
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
      {/* each cushion a hair its own tone, as no two are alike */}
      <Mat f={f} colour={toned(f.colour, toneOf(at))} banded />
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
