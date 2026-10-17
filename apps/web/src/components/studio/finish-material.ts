import { Color, type Texture, type Vector2 } from "three";
import { materialColor, materialRoughness } from "three/tsl";
import {
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  type Node,
} from "three/webgpu";
import type { Finish } from "./finish";
import { bakedOcclusion, bakedSky } from "./lightmap-nodes";
import { plyColour } from "./ply";
import { filtered } from "./spec-aa";
import { takesScreenAo } from "./screen-ao";
import { shade } from "./textures";

/** a coated or sheened finish's layers: the cloth's sheen soft and a
    shade under its colour, the coat a little rough */
const LAYERS = { sheenRoughness: 0.8, sheenShade: 0.1, coatRoughness: 0.3 };
export type MatProps = {
  colour: string;
  f: Finish;
  maps: Partial<Record<"map" | "normalMap" | "roughnessMap", Texture | null>>;
  normalScale: Vector2;
  banded: boolean;
};

/** a finish's roughness as its material has it, held still far off
    (spec-aa.ts). Round 10 removed the painted drift and smudges laid
    over it: a scan's roughness map carries the real variation, and two
    sources of it on one surface read as noise, not as a coat */
const roughness = filtered(materialRoughness);

/** a part's colour: its board's plies on a plywood edge, its face as
    the material has it (round 10 removed the edge lift: the baked
    occlusion and the light already shape a convex edge) */
const PLY_COLOUR = plyColour;
const FACE_COLOUR = materialColor as unknown as Node<"vec4">;

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
 * indirect light, the sky on the window's light), the material's own
 * roughness, and the room's own reflection where the room
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
export const lookMaterial = (env: Node | null, p: MatProps) => {
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
    p.f.ground ? "ground" : "",
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
  // a rug's own bake knows nothing of the sofa standing on it: its
  // contact is the screen's (screen-ao.ts), as the floor's is
  if (p.f.ground) takesScreenAo(m);
  m.roughnessNode = roughness;
  skyLit(m);
  if (looks.size >= LOOKS_KEPT) looks.delete(looks.keys().next().value!);
  looks.set(key, m);
  return m;
};
