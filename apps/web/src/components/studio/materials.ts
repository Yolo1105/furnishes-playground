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
 * holding its place; nothing waits on either. A photographed set
 * carries its own colour: a tint over it is kept light (`TINT`), so a
 * floor's tone still tells but the photograph is not painted over.
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
