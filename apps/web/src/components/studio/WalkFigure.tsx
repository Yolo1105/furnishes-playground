"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import {
  CapsuleGeometry,
  CircleGeometry,
  type Group,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
} from "three";

/**
 * The walker, as a sign rather than a person: the figure an architect
 * stands in a model to give it scale, a pictogram in the round. One
 * smooth colour, no face, no hair, no hands or shoes: a head floating a
 * hair above a rounded body, limbs as soft rods, so it reads at once as
 * "you are here" and never as a doll in the room. Its legs and arms
 * swing with the distance it covers and ease still when it stops. It
 * casts no shadow map of its own (a moving caster would draw every
 * shadow map in the flat again each frame); a soft disc and a thin ring
 * on the floor mark where it stands. It stands where `at` says, read
 * every frame, so the walk moves it without a render of React.
 */

/** the figure's proportions, m: 1.7 m tall, a little stockier than a
    person, as a pictogram is drawn */
const BODY = {
  hip: 0.86,
  leg: 0.8,
  legR: 0.075,
  legX: 0.085,
  shoulder: 1.36,
  shoulderX: 0.23,
  arm: 0.56,
  armR: 0.055,
  torso: 0.34,
  torsoR: 0.17,
  head: 0.13,
  headY: 1.57,
};
/** a stride's length, m: the legs swing once each way over it */
const STRIDE = 0.75;
/** how far the legs and the arms swing at a walk, rad */
const SWING = { leg: 0.42, arm: 0.36 };

/** the figure's one colour: the studio's orange, soft and satin, so it
    is the one thing in the room that is plainly a marker */
const FIGURE = new MeshStandardMaterial({
  color: "#e9783f",
  roughness: 0.45,
});
const FOOTPRINT = new MeshBasicMaterial({
  color: "#000000",
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
});
const RING = new MeshBasicMaterial({
  color: "#e9783f",
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
});

// the parts' shapes, made once
const LEG = new CapsuleGeometry(BODY.legR, BODY.leg - 2 * BODY.legR, 6, 14);
const ARM = new CapsuleGeometry(BODY.armR, BODY.arm - 2 * BODY.armR, 6, 12);
const TORSO = new CapsuleGeometry(BODY.torsoR, BODY.torso, 8, 18);
const HEAD = new SphereGeometry(BODY.head, 24, 18);
const SHADOW = new CircleGeometry(0.3, 28);
const MARK = new RingGeometry(0.34, 0.38, 40);
const noPick = () => null;

/** where the walker stands and which way it faces (yaw, as the camera's:
    0 faces −z) */
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
    g.position.set(p.x, Math.abs(Math.cos(l.phase)) * 0.015 * l.swing, p.z);
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
      {/* where it stands: a soft dark disc and a thin ring in its colour,
          a hair over the floor */}
      <mesh
        geometry={SHADOW}
        material={FOOTPRINT}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.004, 0]}
        raycast={noPick}
        renderOrder={1}
      />
      <mesh
        geometry={MARK}
        material={RING}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        raycast={noPick}
        renderOrder={1}
      />
      {[-1, 1].map((side, i) => (
        <group
          key={`leg${side}`}
          ref={(el) => {
            legs.current[i] = el;
          }}
          position={[side * BODY.legX, BODY.hip, 0]}
        >
          <mesh
            geometry={LEG}
            material={FIGURE}
            position={[0, -BODY.leg / 2, 0]}
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
          rotation={[0, 0, side * 0.08]}
        >
          <mesh
            geometry={ARM}
            material={FIGURE}
            position={[0, -BODY.arm / 2, 0]}
            raycast={noPick}
          />
        </group>
      ))}
      <mesh
        geometry={TORSO}
        material={FIGURE}
        position={[0, (BODY.hip + BODY.shoulder) / 2 + 0.02, 0]}
        scale={[1.1, 1, 0.72]}
        raycast={noPick}
      />
      {/* the head on its own, a hair above the shoulders: no neck, no
          face, as a pictogram has none */}
      <mesh
        geometry={HEAD}
        material={FIGURE}
        position={[0, BODY.headY, 0]}
        raycast={noPick}
      />
    </group>
  );
}
