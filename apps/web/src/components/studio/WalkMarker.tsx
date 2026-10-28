"use client";

import { unpickable } from "./no-pick";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  type Group,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

/**
 * Where the walker is, as a map shows it and not as a person: the "you
 * are here" of a phone's map laid on the floor, a small dot in a white
 * rim with a soft beam fanning out the way the walk looks, fading to
 * nothing. The plan draws the same (`.plan-walker` in Plan2D). One flat
 * picture on one square, unlit and casting nothing, so it reads as a
 * sign over the room and never as a thing in it. It stands where `at`
 * says, read every frame, so the walk moves it without a render of
 * React.
 */

/** the mark, m: the dot and its rim, the beam's reach and its half
    angle (rad), and the square the picture is drawn on */
export const BEAM = {
  dot: 0.085,
  rim: 0.025,
  reach: 1.1,
  half: 0.6,
  side: 2.4,
};
/** how far it lies over the floor, m: clear of a rug's pile
    (`RUG_H`, rug.ts) */
const LIFT = 0.02;
/** the studio's orange (`--color-accent`), the dot's and the beam's */
const ACCENT = "233,120,63";
const tint = (a = 1) => `rgba(${ACCENT},${a})`;
/** the picture's size, px */
const PX = 512;

/** the mark drawn once: ahead is up the picture */
const draw = () => {
  const c = document.createElement("canvas");
  c.width = c.height = PX;
  const g = c.getContext("2d")!;
  const k = PX / BEAM.side;
  const o = PX / 2;
  // the beam: a fan the way it looks, the colour fading out to its reach
  const fade = g.createRadialGradient(o, o, 0, o, o, BEAM.reach * k);
  fade.addColorStop(0, tint(0.55));
  fade.addColorStop(0.35, tint(0.28));
  fade.addColorStop(1, tint(0));
  g.fillStyle = fade;
  g.beginPath();
  g.moveTo(o, o);
  g.arc(
    o,
    o,
    BEAM.reach * k,
    -Math.PI / 2 - BEAM.half,
    -Math.PI / 2 + BEAM.half,
  );
  g.closePath();
  g.fill();
  // a soft shade under the dot, so it sits on a pale floor too
  const shade = g.createRadialGradient(
    o,
    o,
    BEAM.dot * k,
    o,
    o,
    (BEAM.dot + BEAM.rim) * k * 1.8,
  );
  shade.addColorStop(0, "rgba(0,0,0,0.22)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = shade;
  g.beginPath();
  g.arc(o, o, (BEAM.dot + BEAM.rim) * k * 1.8, 0, Math.PI * 2);
  g.fill();
  // the rim, then the dot
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(o, o, (BEAM.dot + BEAM.rim) * k, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = tint();
  g.beginPath();
  g.arc(o, o, BEAM.dot * k, 0, Math.PI * 2);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

const SQUARE = new PlaneGeometry(BEAM.side, BEAM.side);

/** where the walker stands and which way it faces (yaw, as the camera's:
    0 faces −z) */
export type MarkerAt = { x: number; z: number; yaw: number };

export function WalkMarker({ at }: { at: () => MarkerAt }) {
  const root = useRef<Group>(null);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: draw(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  useFrame(() => {
    const g = root.current;
    if (!g) return;
    const p = at();
    g.position.set(p.x, LIFT, p.z);
    g.rotation.y = p.yaw;
  });
  // laid flat, the picture's top ahead (−z); drawn after the floor and
  // the rugs
  return (
    <group ref={root} userData={{ name: "Walker" }}>
      <mesh
        geometry={SQUARE}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={unpickable}
        renderOrder={2}
      />
    </group>
  );
}
