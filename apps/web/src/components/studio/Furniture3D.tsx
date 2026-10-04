"use client";

import { Edges, useGLTF } from "@react-three/drei";
import { Component, Suspense, type ReactNode } from "react";
import { Box3, Vector3, type Vector3Tuple } from "three";
import type { AssetNode } from "./assets-data";
import { ACCENT_HEX, FOLIAGE_HEX } from "./piece-detail";

/**
 * A piece's shape in 3D, built from what it is. Furnishes pieces are
 * 18 mm panel furniture, so storage is a carcass of panels: sides, top,
 * bottom, a thin back, shelves, and a divider between each bay (a piece
 * with parts has one bay per part, each in its part's colour). A single
 * component from the + strip is one panel. Room items are simple forms
 * that read at a glance: a sofa as seat, back and arms; a table as top
 * and legs; a lamp as base, pole and shade; a plant as pot and crown; a
 * rug as a slab; a screen as a tall thin panel. Sizes come from the
 * Detail tab, in metres here.
 */
const PANEL = 0.018;

type Props = {
  node: AssetNode;
  /** width, height, depth in metres */
  size: Vector3Tuple;
  colour: string;
  /** one colour per bay, when the piece has parts */
  parts: string[];
  texture: string;
  selected: boolean;
  clash: boolean;
  /** the View settings ask for edges on every piece */
  edges: boolean;
  onPick: () => void;
};

/** how a finish catches the light */
const roughnessOf = (texture: string) =>
  texture === "Satin"
    ? 0.45
    : texture === "Linen"
      ? 1
      : texture === "Wood grain"
        ? 0.75
        : 0.9;

/** what every form of a piece shares: its finish, its outline, its pick */
type Look = {
  colour: string;
  rough: number;
  outline: boolean;
  clash: boolean;
  onPick: () => void;
};

function Box({
  look,
  at,
  dims,
  colour,
}: {
  look: Look;
  at: Vector3Tuple;
  dims: Vector3Tuple;
  colour?: string;
}) {
  return (
    <mesh
      position={at}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        look.onPick();
      }}
    >
      <boxGeometry args={dims} />
      <meshStandardMaterial
        color={colour ?? look.colour}
        roughness={look.rough}
      />
      {look.outline && (
        <Edges color={ACCENT_HEX} lineWidth={look.clash ? 2 : 1.5} />
      )}
    </mesh>
  );
}

function Round({
  look,
  at,
  r,
  height,
  colour,
  top,
}: {
  look: Look;
  at: Vector3Tuple;
  r: number;
  height: number;
  colour?: string;
  top?: number;
}) {
  return (
    <mesh
      position={at}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        look.onPick();
      }}
    >
      <cylinderGeometry args={[top ?? r, r, height, 24]} />
      <meshStandardMaterial
        color={colour ?? look.colour}
        roughness={look.rough}
      />
      {look.outline && <Edges color={ACCENT_HEX} lineWidth={1.5} />}
    </mesh>
  );
}

/** a generated mesh fitted into the item's size, standing on the floor */
function Model({
  src,
  size,
  onPick,
}: {
  src: string;
  size: Vector3Tuple;
  onPick: () => void;
}) {
  const { scene } = useGLTF(src);
  const box = new Box3().setFromObject(scene);
  const dims = box.getSize(new Vector3());
  const k = Math.min(
    size[0] / (dims.x || 1),
    size[1] / (dims.y || 1),
    size[2] / (dims.z || 1),
  );
  const centre = box.getCenter(new Vector3());
  return (
    <group
      scale={k}
      position={[-centre.x * k, -box.min.y * k, -centre.z * k]}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
    >
      <primitive object={scene} />
    </group>
  );
}

/** a mesh that fails to load falls back to the shape */
class ModelGuard extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Furniture3D(p: Props) {
  if (p.node.model) {
    const shape = <Shape {...p} />;
    return (
      <ModelGuard fallback={shape}>
        <Suspense fallback={shape}>
          <Model src={p.node.model} size={p.size} onPick={p.onPick} />
        </Suspense>
      </ModelGuard>
    );
  }
  return <Shape {...p} />;
}

function Shape(p: Props) {
  const [w, h, d] = p.size;
  const look: Look = {
    colour: p.colour,
    rough: roughnessOf(p.texture),
    outline: p.clash || p.selected || p.edges,
    clash: p.clash,
    onPick: p.onPick,
  };
  const name = p.node.name.toLowerCase();
  const cat = p.node.category;

  // a single component from the strip: one panel
  if (cat === "components") {
    if (/shelf/.test(name))
      return <Box look={look} at={[0, h / 2, 0]} dims={[w, PANEL, d]} />;
    if (/divider/.test(name))
      return <Box look={look} at={[0, h / 2, 0]} dims={[PANEL, h, d]} />;
    if (/back/.test(name))
      return (
        <Box
          look={look}
          at={[0, h / 2, -d / 2 + PANEL / 2]}
          dims={[w, h, PANEL]}
        />
      );
    if (/door/.test(name))
      return (
        <Box
          look={look}
          at={[0, h / 2, d / 2 - PANEL / 2]}
          dims={[w, h, PANEL]}
        />
      );
    return <Box look={look} at={[0, h / 2, 0]} dims={[w, h, d]} />; // a drawer
  }

  // a carcass of panels: storage, a bench, a cart, a screen on legs
  if (p.node.kind === "piece" && cat !== "decor") {
    const bays = p.parts.length ? p.parts : [p.colour];
    const bayW = (w - PANEL * (bays.length + 1)) / bays.length;
    const shelves = h > 1.2 ? 3 : h > 0.6 ? 1 : 0;
    return (
      <group>
        <Box look={look} at={[0, PANEL / 2, 0]} dims={[w, PANEL, d]} />
        <Box look={look} at={[0, h - PANEL / 2, 0]} dims={[w, PANEL, d]} />
        <Box
          look={look}
          at={[0, h / 2, -d / 2 + PANEL / 2]}
          dims={[w - 2 * PANEL, h, PANEL]}
        />
        {bays.map((colour, i) => {
          const x0 = -w / 2 + PANEL + i * (bayW + PANEL);
          return (
            <group key={i}>
              <Box
                look={look}
                at={[x0 - PANEL / 2, h / 2, 0]}
                dims={[PANEL, h, d]}
                colour={colour}
              />
              {Array.from({ length: shelves }, (_, k) => (
                <Box
                  look={look}
                  key={k}
                  at={[x0 + bayW / 2, ((k + 1) * h) / (shelves + 1), 0]}
                  dims={[bayW, PANEL, d - PANEL]}
                  colour={colour}
                />
              ))}
              {i === bays.length - 1 && (
                <Box
                  look={look}
                  at={[x0 + bayW + PANEL / 2, h / 2, 0]}
                  dims={[PANEL, h, d]}
                  colour={colour}
                />
              )}
            </group>
          );
        })}
      </group>
    );
  }

  // a screen: a tall thin panel on two feet
  if (/screen/.test(name))
    return (
      <group>
        <Box
          look={look}
          at={[0, h / 2 + 0.03, 0]}
          dims={[w, h - 0.03, PANEL * 2]}
        />
        <Box look={look} at={[-w / 3, 0.015, 0]} dims={[0.06, 0.03, d]} />
        <Box look={look} at={[w / 3, 0.015, 0]} dims={[0.06, 0.03, d]} />
      </group>
    );

  switch (cat) {
    case "seating": {
      const seatH = Math.min(0.42, h * 0.5);
      const armW = Math.min(0.18, w * 0.12);
      return (
        <group>
          <Box look={look} at={[0, seatH / 2, 0]} dims={[w, seatH, d]} />
          <Box
            look={look}
            at={[0, seatH + (h - seatH) / 2, -d / 2 + 0.11]}
            dims={[w, h - seatH, 0.22]}
          />
          <Box
            look={look}
            at={[-w / 2 + armW / 2, seatH + 0.1, 0]}
            dims={[armW, 0.2, d]}
          />
          <Box
            look={look}
            at={[w / 2 - armW / 2, seatH + 0.1, 0]}
            dims={[armW, 0.2, d]}
          />
        </group>
      );
    }
    case "tables": {
      const top = 0.04;
      const leg = 0.05;
      return (
        <group>
          <Box look={look} at={[0, h - top / 2, 0]} dims={[w, top, d]} />
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <Box
                look={look}
                key={`${sx}${sz}`}
                at={[sx * (w / 2 - leg), (h - top) / 2, sz * (d / 2 - leg)]}
                dims={[leg, h - top, leg]}
              />
            )),
          )}
        </group>
      );
    }
    case "lighting": {
      const r = Math.min(w, d) / 2;
      return (
        <group>
          <Round look={look} at={[0, 0.015, 0]} r={r * 0.8} height={0.03} />
          <Round look={look} at={[0, h / 2, 0]} r={0.015} height={h - 0.03} />
          <Round
            look={look}
            at={[0, h - r * 0.55, 0]}
            r={r}
            top={r * 0.6}
            height={r * 1.1}
          />
        </group>
      );
    }
    default: {
      // décor: a rug lies flat; a vase stands; a plant has a pot and a crown
      if (/rug/.test(name))
        return <Box look={look} at={[0, 0.01, 0]} dims={[w, 0.02, d]} />;
      const r = Math.min(w, d) / 2;
      if (/vase/.test(name))
        return (
          <Round
            look={look}
            at={[0, h / 2, 0]}
            r={r * 0.6}
            top={r * 0.4}
            height={h}
          />
        );
      return (
        <group>
          <Round
            look={look}
            at={[0, h * 0.2, 0]}
            r={r * 0.6}
            top={r * 0.7}
            height={h * 0.4}
          />
          <mesh
            position={[0, h * 0.7, 0]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              p.onPick();
            }}
          >
            <sphereGeometry args={[r, 16, 12]} />
            <meshStandardMaterial color={FOLIAGE_HEX} roughness={1} />
            {look.outline && <Edges color={ACCENT_HEX} lineWidth={1.5} />}
          </mesh>
        </group>
      );
    }
  }
}
