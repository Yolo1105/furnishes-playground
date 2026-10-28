"use client";

import { unpickable } from "./no-pick";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  CircleGeometry,
  type Group,
  MeshBasicMaterial,
  RingGeometry,
  Shape,
  ShapeGeometry,
} from "three";

/**
 * Where the walker is, as a sign and not a person: the plan's own mark
 * (`.plan-walker` in Plan2D) laid on the floor, an orange disc in a pale
 * rim with a point ahead of it the way the walk faces. Flat and unlit,
 * in the studio's colour, so it reads as "you are here" and never as a
 * thing in the room; it casts no shadow. It stands where `at` says, read
 * every frame, so the walk moves it without a render of React.
 */

/** the mark's sizes, m: the plan's (a 170 mm dot, its point from 150 to
    330 mm ahead, 120 mm each side) a little larger, to read from the
    camera behind it */
const MARK = { dot: 0.2, rim: 0.035, tip: 0.4, base: 0.17, half: 0.14 };
/** how far it lies over the floor, m: clear of a rug's pile
    (`RUG_H`, rug.ts) */
const LIFT = 0.02;

const flat = (color: string, opacity = 1) =>
  new MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
/** the studio's orange (`--color-accent`) and the plan's pale rim */
const DOT = flat("#e9783f");
const RIM = flat("#fffaf3", 0.95);

// the shapes, made once; a point drawn up its +y, which lies ahead (−z)
// once laid flat
const POINT = new ShapeGeometry(
  new Shape()
    .moveTo(0, MARK.tip)
    .lineTo(MARK.half, MARK.base)
    .lineTo(-MARK.half, MARK.base)
    .closePath(),
);
const DISC = new CircleGeometry(MARK.dot, 40);
const EDGE = new RingGeometry(MARK.dot, MARK.dot + MARK.rim, 40);

/** where the walker stands and which way it faces (yaw, as the camera's:
    0 faces −z) */
export type MarkerAt = { x: number; z: number; yaw: number };

export function WalkMarker({ at }: { at: () => MarkerAt }) {
  const root = useRef<Group>(null);
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const p = at();
    g.position.set(p.x, LIFT, p.z);
    g.rotation.y = p.yaw;
  });
  // laid flat; drawn after the floor and the rugs, rim under the dot
  return (
    <group ref={root} userData={{ name: "Walker" }}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh
          geometry={POINT}
          material={DOT}
          raycast={unpickable}
          renderOrder={2}
        />
        <mesh
          geometry={EDGE}
          material={RIM}
          raycast={unpickable}
          renderOrder={2}
        />
        <mesh
          geometry={DISC}
          material={DOT}
          raycast={unpickable}
          renderOrder={3}
        />
      </group>
    </group>
  );
}
