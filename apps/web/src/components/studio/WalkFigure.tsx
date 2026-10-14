"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  CapsuleGeometry,
  CircleGeometry,
  type Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";

/**
 * The walker, as a person: a figure 1.7 m tall in plain clothes, built
 * from a few rounded parts (no model to fetch), its legs and arms
 * swinging with the distance it covers and easing still when it stops.
 * It casts no shadow map of its own (a moving caster would draw every
 * shadow map in the flat again each frame); a soft dark disc under its
 * feet sets it on the floor instead. It stands where `at` says, read
 * every frame, so the walk moves it without a render of React.
 */

/** the figure's proportions, m */
const BODY = {
  hip: 0.92,
  leg: 0.84,
  legR: 0.068,
  shoulder: 1.43,
  shoulderX: 0.2,
  arm: 0.6,
  armR: 0.045,
  chest: 0.4,
  chestR: 0.17,
  head: 0.11,
  headY: 1.6,
};
/** a stride's length, m: the legs swing once each way over it */
const STRIDE = 0.75;
/** how far the legs and the arms swing at a walk, rad */
const SWING = { leg: 0.42, arm: 0.34 };

// one set of materials for every figure: plain, matt, the colours of
// everyday clothes, so they share the room's shaders
const SKIN = new MeshStandardMaterial({ color: "#c69a7b", roughness: 0.7 });
const SHIRT = new MeshStandardMaterial({ color: "#e9e3d8", roughness: 0.9 });
const TROUSERS = new MeshStandardMaterial({
  color: "#3d4b5e",
  roughness: 0.85,
});
const HAIR = new MeshStandardMaterial({ color: "#2a211c", roughness: 0.8 });
const SHOES = new MeshStandardMaterial({ color: "#2b2826", roughness: 0.6 });
const FOOTPRINT = new MeshBasicMaterial({
  color: "#000000",
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});

// the parts' shapes, made once
const LEG = new CapsuleGeometry(BODY.legR, BODY.leg - 2 * BODY.legR, 4, 10);
const ARM = new CapsuleGeometry(BODY.armR, BODY.arm - 2 * BODY.armR, 4, 8);
const CHEST = new CapsuleGeometry(BODY.chestR, BODY.chest, 4, 14);
const HEAD = new SphereGeometry(BODY.head, 18, 14);
const HAIR_CAP = new SphereGeometry(
  BODY.head * 1.04,
  18,
  10,
  0,
  Math.PI * 2,
  0,
  Math.PI * 0.55,
);
const NECK = new CapsuleGeometry(0.045, 0.06, 3, 8);
const SHOE = new CapsuleGeometry(0.05, 0.16, 3, 8);
const SHADOW = new CircleGeometry(0.32, 24);
const noPick = () => null;

/** where the walker stands and which way it faces (yaw, as the camera's:
    0 faces −z), and whether it is on the move */
export type FigureAt = { x: number; z: number; yaw: number };

export function WalkFigure({ at }: { at: () => FigureAt }) {
  const root = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);
  const arms = useRef<(Group | null)[]>([]);
  const last = useRef<{ x: number; z: number; phase: number; swing: number }>(
    null,
  );
  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    const p = at();
    const l = (last.current ??= { x: p.x, z: p.z, phase: 0, swing: 0 });
    const moved = Math.hypot(p.x - l.x, p.z - l.z);
    l.x = p.x;
    l.z = p.z;
    // the swing follows the ground covered; it eases in and out
    l.phase += (moved / STRIDE) * Math.PI;
    const walking = moved > 1e-4;
    const k = Math.min(1, delta * 8);
    l.swing += ((walking ? 1 : 0) - l.swing) * k;
    const s = Math.sin(l.phase) * l.swing;
    g.position.set(p.x, Math.abs(Math.cos(l.phase)) * 0.018 * l.swing, p.z);
    g.rotation.y = p.yaw;
    legs.current.forEach((leg, i) => {
      if (leg) leg.rotation.x = (i ? -s : s) * SWING.leg;
    });
    arms.current.forEach((arm, i) => {
      if (arm) arm.rotation.x = (i ? s : -s) * SWING.arm;
    });
  });
  return (
    <group ref={root} userData={{ name: "Walker" }}>
      {/* the contact shadow: a dark disc a hair over the floor */}
      <mesh
        geometry={SHADOW}
        material={FOOTPRINT}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.004, 0]}
        raycast={noPick}
        renderOrder={1}
      />
      {[-1, 1].map((side, i) => (
        <group
          key={`leg${side}`}
          ref={(el) => {
            legs.current[i] = el;
          }}
          position={[side * 0.09, BODY.hip, 0]}
        >
          <mesh
            geometry={LEG}
            material={TROUSERS}
            position={[0, -BODY.leg / 2, 0]}
            raycast={noPick}
          />
          <mesh
            geometry={SHOE}
            material={SHOES}
            position={[0, -BODY.hip + 0.05, -0.05]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noPick}
          />
        </group>
      ))}
      {[-1, 1].map((side, i) => (
        <group
          key={`arm${side}`}
          ref={(el) => {
            arms.current[i] = el;
          }}
          position={[side * BODY.shoulderX, BODY.shoulder, 0]}
          rotation={[0, 0, side * 0.06]}
        >
          <mesh
            geometry={ARM}
            material={SHIRT}
            position={[0, -BODY.arm / 2, 0]}
            raycast={noPick}
          />
          <mesh
            geometry={HEAD}
            material={SKIN}
            position={[0, -BODY.arm - 0.02, 0]}
            scale={0.42}
            raycast={noPick}
          />
        </group>
      ))}
      <mesh
        geometry={CHEST}
        material={SHIRT}
        position={[0, (BODY.hip + BODY.shoulder) / 2 + 0.02, 0]}
        scale={[1.12, 1, 0.68]}
        raycast={noPick}
      />
      <mesh
        geometry={NECK}
        material={SKIN}
        position={[0, BODY.shoulder + 0.06, 0]}
        raycast={noPick}
      />
      <mesh
        geometry={HEAD}
        material={SKIN}
        position={[0, BODY.headY, 0]}
        scale={[0.92, 1.05, 1]}
        raycast={noPick}
      />
      <mesh
        geometry={HAIR_CAP}
        material={HAIR}
        position={[0, BODY.headY + 0.012, 0.008]}
        scale={[0.92, 1.05, 1]}
        raycast={noPick}
      />
    </group>
  );
}
