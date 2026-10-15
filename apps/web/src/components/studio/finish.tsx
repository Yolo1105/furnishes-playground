"use client";

import { ROD_SQUARE } from "./bake-defaults";
import { unpickable } from "./no-pick";
import { filtered } from "./spec-aa";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  type Mesh,
  type Texture,
  Vector2,
  type Vector3Tuple,
} from "three";
import { useBakeMembers } from "./Bake";
import {
  materialColor,
  materialRoughness,
  mx_noise_float,
  normalLocal,
  positionLocal,
  smoothstep,
  vec3,
  vec4,
} from "three/tsl";
import {
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  type Node,
} from "three/webgpu";
import { bakedOcclusion, bakedSky, edgeLift } from "./lightmap-nodes";
import { clothColour, plausible, toned, toneOf } from "./albedo";
import { type MaterialName, repeated, useMaterial } from "./materials";
import { jointLine } from "./edge-line";
import { plyColour } from "./ply";
import { useRoomReflection } from "./Reflection";
import {
  batchesOf,
  cushionGeometry,
  type CushionShape,
  JOINT_OPACITY,
  JOINT_SHADE,
  jointGeometry,
  type Part,
  rodGeometry,
  slabGeometry,
  softGeometry,
} from "./part-geometry";
import { shade, WOOD_M } from "./textures";
import { type Drape, drapeGeometry } from "./drape";

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
/** a rounded body's bake box stands this share of its rounding inside
    its box, as the rounds take the corners away */
const ROUND_IN = 0.3;
/** polished chrome: taps, traps, wire racks, a towel rail */
export const CHROME = "#c9ced2";

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
  colour: clothColour(colour),
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

/** a finish's roughness is never one even value: a slow drift of
    ±`ROUGH_DRIFT` across a piece, as a real coat lies thicker and
    thinner, and on its tops a few faint smudges `SMUDGE` rougher where
    hands and cups have been; then held still far off (spec-aa.ts) */
const ROUGH_DRIFT = 0.05;
const SMUDGE = 0.07;
const drift = mx_noise_float(positionLocal.mul(2.3)).mul(ROUGH_DRIFT);
const smudges = smoothstep(
  0.45,
  0.75,
  mx_noise_float(positionLocal.mul(5.1).add(vec3(17, 3, 11))),
)
  .mul(smoothstep(0.7, 0.95, normalLocal.y))
  .mul(SMUDGE);
const roughness = filtered(
  materialRoughness.add(drift).add(smudges).clamp(0.04, 1),
);

/** a part's colour: its board's plies on a plywood edge, its face as
    the material has it, and a convex edge a hair brighter where it
    catches the light (lightmap-nodes.ts) */
const lifted = (c: Node<"vec4">) =>
  vec4(c.rgb.mul(edgeLift), c.a) as unknown as Node<"vec4">;
const PLY_COLOUR = lifted(plyColour);
const FACE_COLOUR = lifted(materialColor as unknown as Node<"vec4">);

type LightingModel = {
  directRectArea: (
    input: { lightColor: Node<"vec3"> },
    builder: unknown,
  ) => void;
};
/** the window's area lights on a part scaled by how much of the sky it
    sees (its bake's G): deep in a bay the window's light is mostly
    blocked by the bay's own sides and shelf, which the light itself
    does not know */
const skyLit = (m: MeshStandardNodeMaterial) => {
  const own = m.setupLightingModel.bind(m) as unknown as (
    b: unknown,
  ) => LightingModel;
  m.setupLightingModel = ((builder: unknown) => {
    const model = own(builder);
    const area = model.directRectArea.bind(model);
    model.directRectArea = (input, b) =>
      area({ ...input, lightColor: input.lightColor.mul(bakedSky) }, b);
    return model;
  }) as unknown as typeof m.setupLightingModel;
};

/**
 * The finishes' materials, one for each look (the finish, the colour,
 * the maps), shared by every part that has it: all node materials,
 * reading the pieces' baked light (lightmap-nodes.ts: occlusion on the
 * indirect light, the sky on the window's light, the edges' line), a
 * roughness that drifts, and the room's own reflection where the room
 * has its picture, so a top or a front shows the window across it and
 * never the sky map; plywood with its plies. Made again when the
 * room's picture is.
 */
const looks = new Map<string, MeshStandardNodeMaterial>();
let looksOf: Node | null = null;
/** how many looks are kept; past it the oldest is let go (not disposed:
    a part may still be drawn with it, and the next picture of the room
    disposes them all) */
const LOOKS_KEPT = 400;
const lookMaterial = (env: Node | null, p: MatProps) => {
  if (looksOf !== env) {
    for (const m of looks.values()) m.dispose();
    looks.clear();
    looksOf = env;
  }
  const key = [
    p.f.ply ? "ply" : "",
    p.colour,
    p.f.rough,
    p.f.sheen ?? "",
    p.f.coat ?? "",
    p.f.metal ?? "",
    p.banded,
    p.maps.map?.uuid ?? "",
    p.maps.normalMap?.uuid ?? "",
    p.maps.roughnessMap?.uuid ?? "",
    p.normalScale.x,
  ].join("|");
  const had = looks.get(key);
  if (had) return had;
  const shared = {
    color: new Color(p.colour),
    roughness: p.f.rough,
    metalness: p.f.metal ?? 0,
    map: p.maps.map ?? null,
    normalMap: p.maps.normalMap ?? null,
    normalScale: p.normalScale,
    roughnessMap: p.maps.roughnessMap ?? null,
    vertexColors: p.banded,
    ...BEHIND,
  };
  // a cloth's sheen or a lacquer's coat wants the physical material;
  // the rest the standard one, cheaper to draw
  const m =
    p.f.sheen !== undefined || p.f.coat !== undefined
      ? new MeshPhysicalNodeMaterial({
          ...shared,
          sheen: p.f.sheen ?? 0,
          sheenColor: new Color(shade(p.colour, LAYERS.sheenShade)),
          sheenRoughness: LAYERS.sheenRoughness,
          clearcoat: p.f.coat ?? 0,
          clearcoatRoughness: LAYERS.coatRoughness,
        })
      : new MeshStandardNodeMaterial(shared);
  if (env) m.envNode = env;
  m.colorNode = p.f.ply ? PLY_COLOUR : FACE_COLOUR;
  m.aoNode = bakedOcclusion;
  m.roughnessNode = roughness;
  skyLit(m);
  if (looks.size >= LOOKS_KEPT) looks.delete(looks.keys().next().value!);
  looks.set(key, m);
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
  // the room's reflection, where the room has its picture
  const room = useRoomReflection((s) => s.node);
  return (
    <primitive
      object={lookMaterial(room, {
        colour: c,
        f,
        maps: {
          map: maps?.map ?? null,
          normalMap: maps?.normalMap ?? stipple?.normalMap ?? null,
          roughnessMap: maps?.roughnessMap ?? stipple?.roughnessMap ?? null,
        },
        normalScale: maps ? RELIEF_SCALE : STIPPLE_SCALE,
        banded,
      })}
      attach="material"
      dispose={null}
    />
  );
}

/** a square-edged part: a panel, a plinth, a frame member. Its own
    copy of the board's geometry, as its piece's bake gives each board
    its own place in the light's atlas */
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
  const key = dims.join(",");
  const geometry = useMemo(
    () => slabGeometry(key.split(",").map(Number) as Vector3Tuple).clone(),
    [key],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const mesh = useRef<Mesh>(null);
  useBakeMembers(
    () =>
      mesh.current
        ? [
            {
              kind: "boards",
              mesh: mesh.current,
              parts: [{ at: [0, 0, 0], dims, f }],
              ranges: [[0, geometry.getAttribute("position").count]],
            },
          ]
        : [],
    [geometry],
  );
  return (
    <mesh
      ref={mesh}
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
      geometry={geometry}
    >
      <Mat f={f} colour={colour} banded />
      <lineSegments
        geometry={jointGeometry(dims)}
        material={jointLine(
          shade(colour ?? f.colour, JOINT_SHADE),
          JOINT_OPACITY,
        )}
        raycast={unpickable}
      />
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
  // each batch tells the piece's bake its parts (Bake.tsx)
  const meshes = useRef<(Mesh | null)[]>([]);
  useBakeMembers(
    () =>
      batches.flatMap((b, i) => {
        const mesh = meshes.current[i];
        return mesh
          ? [
              {
                kind: "boards" as const,
                mesh,
                parts: b.parts,
                ranges: b.ranges,
              },
            ]
          : [];
      }),
    [batches],
  );
  return (
    <>
      {batches.map((b, i) => (
        <mesh
          key={b.key}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={b.faces}
          castShadow
          receiveShadow
        >
          <Mat f={b.f} colour={b.colour} banded />
          {b.joints && (
            <lineSegments
              geometry={b.joints}
              material={jointLine(
                shade(b.colour ?? b.f.colour, JOINT_SHADE),
                JOINT_OPACITY,
              )}
              raycast={unpickable}
            />
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
  const mesh = useRef<Mesh>(null);
  const [w, h, d] = dims;
  // to its piece's bake, a box a little inside its rounds
  useBakeMembers(
    () =>
      mesh.current
        ? [
            {
              kind: "solid",
              mesh: mesh.current,
              box: {
                c: [0, 0, 0],
                h: [
                  w / 2 - r * ROUND_IN,
                  h / 2 - r * ROUND_IN,
                  d / 2 - r * ROUND_IN,
                ],
              },
              shared: true,
            },
          ]
        : [],
    [w, h, d, r],
  );
  return (
    <mesh
      ref={mesh}
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

/** an upholstered cushion (part-geometry.ts's cushionGeometry): rounded,
    crowned, welted, and, seeded, sat on */
export function Cushion({
  at,
  shape,
  f,
  rotation,
}: {
  at: Vector3Tuple;
  shape: CushionShape;
  f: Finish;
  rotation?: Vector3Tuple | undefined;
}) {
  const geometry = cushionGeometry(shape);
  const mesh = useRef<Mesh>(null);
  const [w, h, d] = shape.dims;
  const r = shape.radius * ROUND_IN;
  useBakeMembers(
    () =>
      mesh.current
        ? [
            {
              kind: "solid",
              mesh: mesh.current,
              box: { c: [0, 0, 0], h: [w / 2 - r, h / 2 - r, d / 2 - r] },
              shared: true,
            },
          ]
        : [],
    [geometry],
  );
  return (
    <mesh
      ref={mesh}
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
      geometry={geometry}
    >
      <Mat f={f} colour={toned(f.colour, toneOf(at))} banded />
    </mesh>
  );
}

/** cloth laid over a support (drape.ts): a throw over an arm or across
    a bed, a duvet; `at` is the support's top, at its middle */
export function Draped({
  at,
  shape,
  f,
}: {
  at: Vector3Tuple;
  shape: Drape;
  f: Finish;
}) {
  const geometry = drapeGeometry(shape);
  const mesh = useRef<Mesh>(null);
  const { over, wide, thick } = shape;
  // to its piece's bake, the sheet over the support's top
  useBakeMembers(
    () =>
      mesh.current
        ? [
            {
              kind: "solid",
              mesh: mesh.current,
              box: { c: [0, thick / 2, 0], h: [over / 2, thick / 2, wide / 2] },
              shared: true,
            },
          ]
        : [],
    [geometry],
  );
  return (
    <mesh ref={mesh} position={at} castShadow receiveShadow geometry={geometry}>
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
  const mesh = useRef<Mesh>(null);
  const s = Math.max(r, top ?? r) * ROD_SQUARE;
  useBakeMembers(
    () =>
      mesh.current
        ? [
            {
              kind: "solid",
              mesh: mesh.current,
              box: { c: [0, 0, 0], h: [s, h / 2, s] },
              shared: true,
            },
          ]
        : [],
    [s, h],
  );
  return (
    <mesh
      ref={mesh}
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
