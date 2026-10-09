"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, type Vector3Tuple } from "three";
import { type FinderRule, updateFeature } from "@furnishes/domain";
import type { AssetNode } from "./assets-data";
import { type Finish, Mat } from "./finish";
import type { FaceInfo, PartMesh } from "./part-build";
import { usePartStore } from "./part-client";
import { useScene } from "./scene-store";
import { shade, WOOD_M } from "./textures";

/**
 * A part item on the stage: the body the part worker built, in the
 * piece's frame (x across, y up, z to the viewer, metres, standing on
 * the floor about its middle), with box-laid texture coordinates in
 * metres so the photographed wood reads right, the grain along the
 * part's longest side; its edges drawn as fine lines. While a feature
 * that works on edges is being edited, a click on a face hands the
 * feature a rule that finds that face's edges again after any
 * rebuild.
 */
/** how far the edge lines are drawn off the surface, m */
const EDGE_LIFT = 0.0003;
const EDGE_OPACITY = 0.45;
const EDGE_SHADE = -0.35;

const unpickable = () => null;

/** the rule a face pick turns into: the plane it lies in when it is
    flat and square to an axis, else the box round it */
export const ruleOfFace = (f: FaceInfo): FinderRule =>
  f.plane
    ? { rule: "inPlane", plane: f.plane.plane, at: round(f.plane.at) }
    : {
        rule: "inBox",
        from: f.box[0].map((v) => round(v - 0.5)) as Vector3Tuple,
        to: f.box[1].map((v) => round(v + 0.5)) as Vector3Tuple,
      };
/** the rules a face pick could be read as, the chosen one first */
export const rulesOfFace = (f: FaceInfo): FinderRule[] => {
  const box: FinderRule = {
    rule: "inBox",
    from: f.box[0].map((v) => round(v - 0.5)) as Vector3Tuple,
    to: f.box[1].map((v) => round(v + 0.5)) as Vector3Tuple,
  };
  if (!f.plane) return [box];
  return [
    { rule: "inPlane", plane: f.plane.plane, at: round(f.plane.at) },
    { rule: "parallelTo", plane: f.plane.plane },
    box,
  ];
};
const round = (v: number) => Math.round(v * 100) / 100;

/** the mesh into the piece's frame: the part's x across, its z up, its
    y into the depth (a turn, so the triangles keep their winding) */
export const geometryOf = (m: PartMesh) => {
  const [lo, hi] = m.bounds;
  const cx = (lo[0] + hi[0]) / 2;
  const cy = (lo[1] + hi[1]) / 2;
  const w = hi[0] - lo[0];
  const d = hi[1] - lo[1];
  const h = hi[2] - lo[2];
  const n = m.positions.length / 3;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  // the grain runs along the longest side: that side's coordinate
  // comes first wherever it is one of a face's two
  const longest = w >= d && w >= h ? 0 : h >= d ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const x = (m.positions[i * 3]! - cx) / 1000;
    const y = (m.positions[i * 3 + 2]! - lo[2]) / 1000;
    const z = -(m.positions[i * 3 + 1]! - cy) / 1000;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    const nx = m.normals[i * 3]!;
    const ny = m.normals[i * 3 + 2]!;
    const nz = -m.normals[i * 3 + 1]!;
    nor[i * 3] = nx;
    nor[i * 3 + 1] = ny;
    nor[i * 3 + 2] = nz;
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    // the face's two coordinates by the axis it faces
    let a: [number, number];
    let b: [number, number];
    if (ax >= ay && ax >= az) {
      a = [y, 1];
      b = [z, 2];
    } else if (ay >= az) {
      a = [x, 0];
      b = [z, 2];
    } else {
      a = [x, 0];
      b = [y, 1];
    }
    if (b[1] === longest) [a, b] = [b, a];
    uv[i * 2] = a[0] / WOOD_M;
    uv[i * 2 + 1] = b[0] / WOOD_M;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  g.setIndex(new BufferAttribute(new Uint32Array(m.indices), 1));
  return g;
};

/** the edges as line segments in the same frame, lifted a hair */
export const edgesOf = (m: PartMesh) => {
  const [lo, hi] = m.bounds;
  const cx = (lo[0] + hi[0]) / 2;
  const cy = (lo[1] + hi[1]) / 2;
  const n = m.edges.length / 3;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (m.edges[i * 3]! - cx) / 1000;
    pos[i * 3 + 1] = (m.edges[i * 3 + 2]! - lo[2]) / 1000 + EDGE_LIFT;
    pos[i * 3 + 2] = -(m.edges[i * 3 + 1]! - cy) / 1000;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  return g;
};

/** the face a triangle belongs to */
export const faceOfTriangle = (m: PartMesh, triangle: number) => {
  const at = triangle * 3;
  const g = m.faceGroups.find((x) => at >= x.start && at < x.start + x.count);
  return g ? (m.faces[g.faceId] ?? null) : null;
};

export function Part3D({
  node,
  f,
  size,
}: {
  node: AssetNode;
  f: Finish;
  /** the item's size, m, drawn as a frame until the body is built */
  size: Vector3Tuple;
}) {
  const built = usePartStore((s) => s.built[node.id]);
  const picking = usePartStore((s) => s.picking);
  const mesh = built?.mesh ?? null;
  const geometry = useMemo(() => (mesh ? geometryOf(mesh) : null), [mesh]);
  const edges = useMemo(() => (mesh ? edgesOf(mesh) : null), [mesh]);
  useEffect(
    () => () => {
      geometry?.dispose();
      edges?.dispose();
    },
    [geometry, edges],
  );
  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!picking || !mesh || e.faceIndex === undefined || e.faceIndex === null)
      return;
    const face = faceOfTriangle(mesh, e.faceIndex);
    const { editing } = usePartStore.getState();
    if (!face || !editing?.feature || editing.id !== node.id) return;
    e.stopPropagation();
    const part = node.part!;
    const feature = part.features.find((x) => x.id === editing.feature);
    if (!feature || (feature.kind !== "fillet" && feature.kind !== "chamfer"))
      return;
    useScene.getState().setPart(
      node.id,
      updateFeature(part, feature.id, {
        edges: { rules: [ruleOfFace(face)] },
      }),
    );
    usePartStore.getState().setPickedFace(face);
  };
  if (!geometry)
    return (
      <mesh position={[0, size[1] / 2, 0]} userData={{ name: node.name }}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={f.colour}
          transparent
          opacity={0.25}
          roughness={1}
        />
      </mesh>
    );
  return (
    <group>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        userData={{ name: node.name }}
        onClick={pick}
      >
        <Mat f={f} />
      </mesh>
      {edges && (
        <lineSegments geometry={edges} raycast={unpickable}>
          <lineBasicMaterial
            color={shade(f.colour, EDGE_SHADE)}
            transparent
            opacity={EDGE_OPACITY}
          />
        </lineSegments>
      )}
    </group>
  );
}
