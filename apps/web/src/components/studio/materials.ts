"use client";

import { useEffect } from "react";
import {
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
} from "three";
import { create } from "zustand";
import { SPEC, TILE_OF } from "./surface-paint";
import { flatSurface, paintedMaps, type Surface, surfaceOf } from "./textures";
import type { Floor } from "./room-data";

/**
 * The studio's materials, by name: a photographed set when one is
 * under `public/materials/<name>/` (a colour, a normal and a roughness
 * map with a manifest saying the stretch one tile covers, listed in
 * `public/materials/index.json`; see the README there), else the
 * surface grown from noise (surface-paint.ts). The sets are fetched
 * once when the room opens and the materials that have one switch to
 * it as it arrives; the grown surfaces are painted in a worker as a
 * part first asks for them, a flat stand-in in the material's colour
 * holding its place; nothing waits on either.
 *
 * Two tint paths, which decide how a set's colour map must be made. A
 * piece's finish (finish.tsx, `Mat`) multiplies the map by the piece's
 * own colour in full, as it does the grown wood: so a `wood` or
 * `cloth` set must be light grain values, near white, or every piece
 * is tinted twice (`warnIfDark` says so in development). A room
 * surface (Room3D.tsx, the walls and floors) lays the Room tab's tone
 * over the set lightly (`tintOver`, `TINT`), so `plaster` and the
 * floors carry their own colour and the tone still tells. A set's
 * arrival changes no probe stamp (Scene3D.tsx lists what the probes
 * follow: the shell, its tones and its light), so the bake is not run
 * again for it; the next bake sees the set.
 */
export type MaterialName =
  "wood" | "cloth" | "plaster" | "parquet" | "vinyl" | "tiles" | "concrete";
export const FLOOR_MATERIAL: Record<Floor, MaterialName> = {
  Parquet: "parquet",
  Vinyl: "vinyl",
  Tiles: "tiles",
  Concrete: "concrete",
};
/** a surface with the stretch, m, one tile of it covers, and whether
    it is a photograph (with its own colour) or grown (light values) */
export type Material = { surface: Surface; tile: number; photo: boolean };

type Manifest = {
  tile: number;
  color: string;
  normal: string;
  roughness: string;
};
type Index = { materials: Partial<Record<MaterialName, Manifest>> };

type MaterialsState = {
  /** the photographed sets that have arrived */
  loaded: Partial<Record<MaterialName, Material>>;
  /** which names the index lists, once read; null before */
  listed: MaterialName[] | null;
  /** the grown surfaces painted so far, by their key (the name, and a
      floor's tone) */
  grown: Record<string, Material>;
};
export const useMaterials = create<MaterialsState>(() => ({
  loaded: {},
  listed: null,
  grown: {},
}));

const ROOT = "/materials";
/** how much of a tone goes over a photographed set */
export const TINT = 0.3;

const loader = new TextureLoader();
const load = (url: string, colour: boolean) =>
  loader.loadAsync(url).then((t: Texture) => {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = 8;
    return t;
  });

/** a grain map (wood, cloth) is multiplied by the piece's colour, so
    it must be light values: below this average luminance, in
    development, the loader says a set would tint every piece twice */
const GRAIN_LIGHT = 0.75;
/** the side of the small canvas a map's average is read from */
const SAMPLE_PX = 16;
const warnIfDark = (name: MaterialName, t: Texture) => {
  if (process.env.NODE_ENV === "production") return;
  if (name !== "wood" && name !== "cloth") return;
  try {
    const c = document.createElement("canvas");
    c.width = SAMPLE_PX;
    c.height = SAMPLE_PX;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(t.image as CanvasImageSource, 0, 0, SAMPLE_PX, SAMPLE_PX);
    const px = ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4)
      sum +=
        (0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!) / 255;
    const lum = sum / (px.length / 4);
    if (lum < GRAIN_LIGHT)
      console.warn(
        `materials: the ${name} colour map averages ${lum.toFixed(2)} luminance; a grain map is multiplied by each piece's colour, so it should be light values (over ${GRAIN_LIGHT}) or every piece is tinted twice`,
      );
  } catch {
    /* a map that cannot be drawn (cross-origin) is left unmeasured */
  }
};

let started = false;
/** the index read and each listed set fetched, once; a missing index
    or a set that fails leaves the grown surface in place */
export const loadMaterials = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  void fetch(`${ROOT}/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
    .then((index) => {
      const entries = Object.entries(index?.materials ?? {}) as [
        MaterialName,
        Manifest,
      ][];
      useMaterials.setState({ listed: entries.map(([name]) => name) });
      for (const [name, m] of entries) {
        const base = `${ROOT}/${name}/`;
        void Promise.all([
          load(base + m.color, true),
          load(base + m.normal, false),
          load(base + m.roughness, false),
        ])
          .then(([map, normalMap, roughnessMap]) => {
            warnIfDark(name, map);
            const surface = { map, normalMap, roughnessMap };
            useMaterials.setState((s) => ({
              loaded: {
                ...s.loaded,
                [name]: { surface, tile: m.tile, photo: true },
              },
            }));
          })
          .catch(() => undefined);
      }
    })
    .catch(() => useMaterials.setState({ listed: [] }));
};

/** the tone a grown surface is painted in: a floor's own, none (light
    values) for the rest */
const tintOf = (name: MaterialName, floorHex?: string) =>
  name === "wood" || name === "cloth" || name === "plaster"
    ? null
    : (floorHex ?? "#ffffff");
const keyOf = (name: MaterialName, floorHex?: string) => {
  const tint = tintOf(name, floorHex);
  return tint ? `${name}:${tint}` : name;
};

const standIns = new Map<string, Material>();
/** the grown surface of a name as its material: the painted one once
    it has arrived, else the flat stand-in in its tone */
const grown = (name: MaterialName, floorHex?: string): Material => {
  const key = keyOf(name, floorHex);
  const painted = useMaterials.getState().grown[key];
  if (painted) return painted;
  let s = standIns.get(key);
  if (!s) {
    s = {
      surface: flatSurface(tintOf(name, floorHex)),
      tile: TILE_OF[name],
      photo: false,
    };
    standIns.set(key, s);
  }
  return s;
};

const asked = new Set<string>();
/** the grown surface painted in the worker, once a key; it goes into
    the store as it arrives */
export const requestGrown = (name: MaterialName, floorHex?: string) => {
  const key = keyOf(name, floorHex);
  if (asked.has(key) || typeof window === "undefined") return;
  asked.add(key);
  const tint = tintOf(name, floorHex);
  void paintedMaps(key, { kind: name, tint, ...SPEC[name] }).then((maps) =>
    useMaterials.setState((s) => ({
      grown: {
        ...s.grown,
        [key]: {
          surface: surfaceOf(maps, tint !== null),
          tile: TILE_OF[name],
          photo: false,
        },
      },
    })),
  );
};

/** a tone laid over a photographed set: mostly white, a little of the
    tone, so the photograph's own colour still shows */
export const tintOver = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(255 - (255 - v) * TINT);
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
};

/** a material by name: the photographed set when it has arrived, else
    the grown surface (a floor's painted in its tone), asked for here
    and followed in the store, so a part is drawn again as either
    arrives */
export const useMaterial = (name: MaterialName, floorHex?: string) => {
  const loaded = useMaterials((s) => s.loaded[name]);
  const painted = useMaterials((s) => s.grown[keyOf(name, floorHex)]);
  useEffect(() => requestGrown(name, floorHex), [name, floorHex]);
  return loaded ?? painted ?? grown(name, floorHex);
};

/** a material's maps set to repeat by its tile over a surface whose
    texture lies in metres */
export const repeated = (m: Material, metresPerTile = m.tile) => {
  const r = 1 / metresPerTile;
  const { map, normalMap, roughnessMap } = m.surface;
  for (const t of [map, normalMap, roughnessMap])
    if (t.repeat.x !== r) t.repeat.set(r, r);
  return m.surface;
};
