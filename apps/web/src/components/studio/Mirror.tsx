"use client";

import { useEffect, useMemo } from "react";
import { Object3D, type Vector3Tuple } from "three";
import { pmremTexture, reflector } from "three/tsl";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import { create } from "zustand";
import { floorCube } from "./Reflection";

/**
 * A mirror on a door or a panel face: a planar reflection drawn by
 * three's reflector node (the room rendered again from the mirrored
 * camera, at half size), laid as a sheet a hair in front of the face.
 * The room renders once more for each mirror, so one mirror at a time
 * is the real thing: the first mounted holds it, and every other
 * mirror in view stands as polished metal reflecting the floor's
 * picture of the room (Reflection.tsx), which reads as a mirror from
 * across the room. The sheet is a helper to the exports: the glTF and
 * the photo keep the door under it.
 */
/** how far the sheet stands off the face, m */
const LIFT = 0.0006;
/** the reflector draws the room at this share of the stage's size */
const RESOLUTION = 0.5;

/** which mirror holds the reflector: the first mounted */
export const useMirrors = create<{
  first: string | null;
  ids: string[];
  claim: (id: string) => void;
  release: (id: string) => void;
}>((set) => ({
  first: null,
  ids: [],
  claim: (id) =>
    set((s) => {
      const ids = s.ids.includes(id) ? s.ids : [...s.ids, id];
      return { ids, first: ids[0] ?? null };
    }),
  release: (id) =>
    set((s) => {
      const ids = s.ids.filter((x) => x !== id);
      return { ids, first: ids[0] ?? null };
    }),
}));

export function MirrorFace({
  id,
  at,
  size,
  rotation,
}: {
  id: string;
  /** the face's middle in the piece's frame, m */
  at: Vector3Tuple;
  /** the sheet's width and height, m */
  size: [number, number];
  /** the turn that faces the sheet the way the face faces (+z unturned) */
  rotation?: Vector3Tuple;
}) {
  const first = useMirrors((s) => s.first);
  const { claim, release } = useMirrors.getState();
  useEffect(() => {
    claim(id);
    return () => release(id);
  }, [id, claim, release]);
  const mine = first === id;
  // the reflector's plane is its target's own XY: the target stands at
  // the face, turned as the sheet is
  const target = useMemo(() => new Object3D(), []);
  const material = useMemo(() => {
    if (mine) {
      const m = new MeshBasicNodeMaterial();
      m.colorNode = reflector({
        target,
        resolutionScale: RESOLUTION,
        bounces: false,
      });
      return m;
    }
    const m = new MeshStandardNodeMaterial({
      color: "#f2f1ee",
      metalness: 1,
      roughness: 0.06,
    });
    const cube = floorCube.current;
    if (cube) m.envNode = pmremTexture(cube.texture);
    return m;
  }, [mine, target]);
  useEffect(() => () => material.dispose(), [material]);
  const lifted: Vector3Tuple = [at[0], at[1], at[2]];
  // the lift goes along the sheet's own normal
  const r = rotation ?? [0, 0, 0];
  if (r[0] !== 0) lifted[1] += LIFT * (r[0] < 0 ? 1 : -1);
  else if (r[1] !== 0) lifted[0] += LIFT * (r[1] > 0 ? 1 : -1);
  else lifted[2] += LIFT;
  return (
    <group position={lifted} rotation={r}>
      <primitive object={target} />
      <mesh
        material={material}
        userData={{ export: "helper", mirror: true, first: mine }}
      >
        <planeGeometry args={size} />
      </mesh>
    </group>
  );
}
