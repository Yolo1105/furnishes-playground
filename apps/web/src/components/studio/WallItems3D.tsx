"use client";

import { CHROME } from "./finish";
import { unpickable } from "./no-pick";
import { toMetres } from "@furnishes/scene";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  type Group,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Opening } from "./room-data";
import { seedOf } from "./seed";
import { sideOf, yawOf } from "./Room3D";
import { inward } from "./window-light";
import type { Point } from "./room-templates";
import {
  itemCentre,
  itemY,
  WALL_ITEMS,
  type WallItem,
  type WallItemKind,
} from "./wall-items";
import { MAY_SHOW } from "./shader-warm";

const MAY_SHOW_TAG = { [MAY_SHOW]: true } as const;

/**
 * A room's wall items in 3D (see wall-items.ts): each item is one mesh,
 * its parts merged with their colours in the vertices, and a mirror's
 * glass a second mesh with a polished finish. An item is drawn only from
 * its own side of the wall: when its wall is the near wall and has gone
 * from the picture, the item goes with it, as the wall's own skirting
 * does. Never under the pointer.
 */
type Part = {
  /** box: width, height, depth; or a disc: radius and depth */
  box?: [number, number, number];
  disc?: [number, number];
  /** its middle, m, from the item's centre on the wall's face (+z out) */
  at: [number, number, number];
  colour: string;
};

const WHITE = "#f4f1ea";
/** a picture's frame, m: the moulding's width on the wall, its depth
    off it, and how far the glass and the mount sit in from its face */
const FRAME = { wide: 0.025, deep: 0.02, lip: 0.006 };
/** the mouldings, one a room: black, oak, a white lacquer */
const FRAME_TONES = ["#2d2925", "#b8956a", "#efece5"];
/** an air-con unit's trunking, m: the white PVC duct (60 × 40 mm) its
    pipes run in, off along the wall from its far end */
const AIRCON = { trunk: { run: 0.7, tall: 0.06, deep: 0.04 } };
const OAK = "#c9a77c";
const BRASS = "#b8996a";
const INK = "#2d2925";
/** a picture's colours, one set per room so the flat is not one print */
const PRINTS = [
  ["#c9785a", "#e8d6b8", "#5f7d6e"],
  ["#6f8aa6", "#efe6d6", "#d2a46a"],
  ["#8a9a6c", "#f0e8da", "#b5654f"],
  ["#b39ab8", "#efe9df", "#5d6b7d"],
];

/** the parts of an item of a kind, m; `seed` picks a print or a towel */
const partsOf = (kind: WallItemKind, seed: number): Part[] => {
  const s = WALL_ITEMS[kind];
  const w = toMetres(s.width);
  const h = toMetres(s.height);
  const d = toMetres(s.depth);
  switch (kind) {
    case "outlet":
      return [
        { box: [w, h, d * 0.8], at: [0, 0, d * 0.4], colour: WHITE },
        // the two sockets, a shade under the plate
        {
          box: [0.034, 0.044, 0.003],
          at: [-0.036, 0, d * 0.8],
          colour: "#d9d5cc",
        },
        {
          box: [0.034, 0.044, 0.003],
          at: [0.036, 0, d * 0.8],
          colour: "#d9d5cc",
        },
      ];
    case "art": {
      const [a, b, c] = PRINTS[seed % PRINTS.length]!;
      const f = FRAME;
      const wood = FRAME_TONES[seed % FRAME_TONES.length]!;
      // the mount's face, set back in the moulding behind the glass
      const mount = f.deep - f.lip - 0.004;
      return [
        // the moulding's four sides, the long ones over the short
        {
          box: [w, f.wide, f.deep],
          at: [0, h / 2 - f.wide / 2, f.deep / 2],
          colour: wood,
        },
        {
          box: [w, f.wide, f.deep],
          at: [0, -h / 2 + f.wide / 2, f.deep / 2],
          colour: wood,
        },
        {
          box: [f.wide, h - 2 * f.wide, f.deep],
          at: [-w / 2 + f.wide / 2, 0, f.deep / 2],
          colour: wood,
        },
        {
          box: [f.wide, h - 2 * f.wide, f.deep],
          at: [w / 2 - f.wide / 2, 0, f.deep / 2],
          colour: wood,
        },
        // the mount, a white card filling the frame
        {
          box: [w - 2 * f.wide, h - 2 * f.wide, mount],
          at: [0, 0, mount / 2],
          colour: "#f3efe6",
        },
        // an abstract print in the mount's window: a field, a band and a
        // sun, each a hair proud of the one under it
        {
          box: [w * 0.6, h * 0.54, 0.002],
          at: [0, 0, mount + 0.001],
          colour: b!,
        },
        {
          box: [w * 0.6, h * 0.2, 0.002],
          at: [0, -h * 0.17, mount + 0.0025],
          colour: a!,
        },
        {
          disc: [h * 0.1, 0.002],
          at: [w * 0.14, h * 0.08, mount + 0.0035],
          colour: c!,
        },
      ];
    }
    case "mirror":
      return [{ box: [w, h, d], at: [0, 0, d / 2], colour: BRASS }];
    case "shelf":
      return [
        { box: [w, 0.032, d], at: [0, -h / 2 + 0.016, d / 2], colour: OAK },
        // books, leaning together, and a pot
        {
          box: [0.035, 0.2, 0.15],
          at: [-w * 0.32, -h / 2 + 0.132, d / 2],
          colour: "#7b8f86",
        },
        {
          box: [0.03, 0.18, 0.15],
          at: [-w * 0.32 + 0.034, -h / 2 + 0.122, d / 2],
          colour: "#c2a477",
        },
        {
          box: [0.04, 0.21, 0.15],
          at: [-w * 0.32 + 0.07, -h / 2 + 0.137, d / 2],
          colour: "#9e5b4a",
        },
        {
          disc: [0.055, 0.12],
          at: [w * 0.25, -h / 2 + 0.092, d / 2],
          colour: "#e7dfd2",
        },
      ];
    case "aircon": {
      const t = AIRCON.trunk;
      return [
        // the body, its front panel a shade proud and inset at the edges
        // so the light turns on its front as on a rounded one
        {
          box: [w, h, d - 0.012],
          at: [0, 0, (d - 0.012) / 2],
          colour: "#efeee9",
        },
        {
          box: [w - 0.016, h - 0.03, 0.012],
          at: [0, 0.012, d - 0.006],
          colour: "#f7f6f2",
        },
        // the louvre flap along its foot, tipped a little open, and the
        // dark slot behind it
        {
          box: [w * 0.9, 0.03, 0.02],
          at: [0, -h / 2 + 0.012, d - 0.03],
          colour: "#3c3a37",
        },
        {
          box: [w * 0.9, 0.012, 0.05],
          at: [0, -h / 2 + 0.004, d - 0.03],
          colour: "#e4e2dc",
        },
        // the status lights
        {
          box: [0.03, 0.008, 0.003],
          at: [w * 0.36, -h * 0.08, d + 0.0015],
          colour: "#7fb9d6",
        },
        {
          box: [0.008, 0.008, 0.003],
          at: [w * 0.36 + 0.03, -h * 0.08, d + 0.0015],
          colour: "#9fd28a",
        },
        // the trunking from its far end along the wall, at its top
        {
          box: [t.run, t.tall, t.deep],
          at: [w / 2 + t.run / 2, h / 2 - t.tall / 2, t.deep / 2],
          colour: "#f1efe9",
        },
        // the trunking's lid line, a hair proud
        {
          box: [t.run, 0.004, 0.003],
          at: [w / 2 + t.run / 2, h / 2 - t.tall / 2, t.deep + 0.0015],
          colour: "#dedbd3",
        },
      ];
    }
    case "tv-point":
      // the plate, its coaxial socket's ring and pin, a data port
      return [
        { box: [w, h, d * 0.8], at: [0, 0, d * 0.4], colour: WHITE },
        { disc: [0.011, 0.003], at: [-0.018, 0, d * 0.8], colour: "#d9d5cc" },
        {
          disc: [0.002, 0.004],
          at: [-0.018, 0, d * 0.8 + 0.001],
          colour: CHROME,
        },
        {
          box: [0.016, 0.014, 0.003],
          at: [0.02, 0, d * 0.8],
          colour: "#d9d5cc",
        },
      ];
    case "key-hook": {
      // an oak rail, four brass hooks, a bunch of keys on one of them
      const hooks = [-0.105, -0.035, 0.035, 0.105];
      const keys = hooks[seed % hooks.length]!;
      return [
        { box: [w, h, 0.018], at: [0, 0, 0.009], colour: OAK },
        ...hooks.flatMap((x): Part[] => [
          { box: [0.007, 0.007, 0.028], at: [x, -0.008, 0.032], colour: BRASS },
          { box: [0.007, 0.014, 0.007], at: [x, -0.002, 0.043], colour: BRASS },
        ]),
        { disc: [0.012, 0.003], at: [keys, -0.03, 0.04], colour: CHROME },
        {
          box: [0.016, 0.048, 0.003],
          at: [keys - 0.006, -0.062, 0.041],
          colour: BRASS,
        },
        {
          box: [0.014, 0.042, 0.003],
          at: [keys + 0.008, -0.058, 0.044],
          colour: CHROME,
        },
      ];
    }
    case "clock":
      return [
        { disc: [w / 2, d], at: [0, 0, d / 2], colour: INK },
        {
          disc: [w / 2 - 0.016, 0.004],
          at: [0, 0, d + 0.002],
          colour: "#f7f4ee",
        },
        {
          box: [0.008, w * 0.3, 0.003],
          at: [0, w * 0.13, d + 0.006],
          colour: INK,
        },
        {
          box: [w * 0.22, 0.008, 0.003],
          at: [w * 0.09, 0, d + 0.007],
          colour: INK,
        },
      ];
    case "towel-rail": {
      const towel = ["#e9e3d7", "#a9bfb4", "#d9b9a3"][seed % 3]!;
      return [
        {
          box: [w, 0.022, 0.022],
          at: [0, h / 2 - 0.02, d - 0.011],
          colour: CHROME,
        },
        {
          box: [0.02, 0.03, d],
          at: [-w / 2 + 0.02, h / 2 - 0.02, d / 2],
          colour: CHROME,
        },
        {
          box: [0.02, 0.03, d],
          at: [w / 2 - 0.02, h / 2 - 0.02, d / 2],
          colour: CHROME,
        },
        // a towel over the bar, both halves
        {
          box: [w * 0.7, h - 0.04, 0.012],
          at: [0, -0.01, d + 0.004],
          colour: towel,
        },
        {
          box: [w * 0.7, h * 0.55, 0.012],
          at: [0, h * 0.2, d - 0.026],
          colour: towel,
        },
      ];
    }
    case "mirror-cabinet":
      return [{ box: [w, h, d], at: [0, 0, d / 2], colour: WHITE }];
    case "drying-rack": {
      // poles along the wall on two brackets, washing on two of them
      const poles = [0.16, 0.32, 0.48].map((z): Part => ({
        box: [w, 0.022, 0.022],
        at: [0, h / 2 - 0.03, z],
        colour: CHROME,
      }));
      return [
        {
          box: [0.03, 0.06, d],
          at: [-w / 2 + 0.06, h / 2 - 0.03, d / 2],
          colour: CHROME,
        },
        {
          box: [0.03, 0.06, d],
          at: [w / 2 - 0.06, h / 2 - 0.03, d / 2],
          colour: CHROME,
        },
        ...poles,
        {
          box: [0.42, h - 0.06, 0.008],
          at: [-w * 0.2, -0.03, 0.16],
          colour: "#cfd9d6",
        },
        {
          box: [0.3, h * 0.7, 0.008],
          at: [w * 0.22, h * 0.12, 0.32],
          colour: "#e7d7c1",
        },
      ];
    }
    case "water-heater":
      return [
        { box: [w, h, d], at: [0, 0, d / 2], colour: "#f7f6f2" },
        {
          disc: [0.03, 0.012],
          at: [0, -h * 0.3, d + 0.006],
          colour: "#8d8a84",
        },
        {
          box: [0.02, 0.18, 0.02],
          at: [-w * 0.25, -h / 2 - 0.09, d * 0.4],
          colour: CHROME,
        },
        {
          box: [0.02, 0.18, 0.02],
          at: [w * 0.25, -h / 2 - 0.09, d * 0.4],
          colour: CHROME,
        },
      ];
  }
};

/** the glass of a mirror and of a mirror cabinet's door, m */
const glassOf = (kind: WallItemKind): Part | null => {
  const s = WALL_ITEMS[kind];
  const w = toMetres(s.width);
  const h = toMetres(s.height);
  const d = toMetres(s.depth);
  if (kind === "mirror")
    return {
      box: [w - 0.05, h - 0.05, 0.004],
      at: [0, 0, d + 0.002],
      colour: "#dfe5e6",
    };
  // a picture's glass, over the mount inside the moulding
  if (kind === "art")
    return {
      box: [w - 2 * FRAME.wide, h - 2 * FRAME.wide, 0.002],
      at: [0, 0, FRAME.deep - FRAME.lip / 2],
      colour: "#ffffff",
    };
  if (kind === "mirror-cabinet")
    return {
      box: [w - 0.02, h - 0.02, 0.004],
      at: [0, 0, d + 0.002],
      colour: "#dfe5e6",
    };
  return null;
};

const build = (parts: Part[]): BufferGeometry => {
  const colour = new Color();
  const each = parts.map((p) => {
    const g = p.box
      ? new BoxGeometry(...p.box)
      : new CylinderGeometry(p.disc![0], p.disc![0], p.disc![1], 32).rotateX(
          Math.PI / 2,
        );
    g.translate(...p.at);
    colour.set(p.colour);
    const n = g.getAttribute("position").count;
    const tone = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colour.toArray(tone, i * 3);
    g.setAttribute("color", new Float32BufferAttribute(tone, 3));
    // the merge wants the same attributes in each: a disc has its own
    // uvs and normals, as a box does
    return g.index ? g.toNonIndexed() : g;
  });
  const merged = mergeGeometries(each)!;
  for (const g of each) g.dispose();
  return merged;
};

/** the items' geometry, made once per kind and print and kept: a
    handful of small meshes the whole flat shares */
const made = new Map<
  string,
  { body: BufferGeometry; glass: BufferGeometry | null }
>();
const geometryOf = (kind: WallItemKind, seed: number) => {
  const key = `${kind}:${seed}`;
  let g = made.get(key);
  if (!g) {
    const glass = glassOf(kind);
    g = {
      body: build(partsOf(kind, seed)),
      glass: glass ? build([glass]) : null,
    };
    made.set(key, g);
  }
  return g;
};

/** every wall item's materials, shared: an item placed anew draws with
    a shader already built */
const BODY = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
/** a mirror's pane: pale glass under a clear coat, which reads as a
    mirror from across the room whatever is round it (half metal, it
    took the ceiling light's whole glow and stood as a white sheet) */
const GLASS = new MeshPhysicalMaterial({
  vertexColors: true,
  metalness: 0,
  roughness: 0.12,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
});
/** a picture's glass: clear, a faint sheen of the room where the light
    catches it */
const PANE = new MeshStandardMaterial({
  color: "#ffffff",
  transparent: true,
  opacity: 0.08,
  roughness: 0.05,
  metalness: 0,
  depthWrite: false,
});
const ITEM_NAME = { name: "Wall item" } as const;

export function WallItems3D({
  r,
  items,
  shared,
}: {
  r: {
    id: string;
    W: number;
    D: number;
    outline: readonly Point[];
    openings: readonly Opening[];
  };
  items: readonly WallItem[];
  /** the stretches of its walls shared with another room, mm along the
      wall in the room's frame: an item there answers to whichever of
      the two rooms is worked on, as the wall does */
  shared?:
    | readonly {
        wall: WallItem["wall"];
        from: number;
        to: number;
        other: string;
      }[]
    | undefined;
}) {
  const w = toMetres(r.W);
  const d = toMetres(r.D);
  // a print per room, the same each time
  const seed = useMemo(() => seedOf(r.id), [r.id]);
  return (
    <group userData={ITEM_NAME}>
      {items.map((it) => {
        const c = itemCentre(r, it);
        const horizontal = it.wall === "north" || it.wall === "south";
        const px = horizontal ? c.centre : c.at;
        const py = horizontal ? c.at : c.centre;
        const s = shared?.find(
          (x) => x.wall === it.wall && x.from <= c.centre && c.centre <= x.to,
        );
        return (
          <WallItem3D
            key={it.id}
            pair={s ? { room: r.id, other: s.other } : null}
            kind={it.kind}
            seed={seed}
            at={[
              toMetres(px) - w / 2,
              toMetres(itemY(it)),
              toMetres(py) - d / 2,
            ]}
            wall={it.wall}
          />
        );
      })}
    </group>
  );
}

function WallItem3D({
  kind,
  seed,
  at,
  wall,
  pair,
}: {
  /** on a wall shared with another room: this room and that one */
  pair: { room: string; other: string } | null;
  kind: WallItemKind;
  seed: number;
  at: [number, number, number];
  wall: WallItem["wall"];
}) {
  const g = geometryOf(kind, seed);
  const ref = useRef<Group>(null);
  const [nx, nz] = inward(wall);
  const world = useMemo(() => new Vector3(), []);
  // the item goes when its wall does (Room3D's WallRun): seen from
  // behind, or on a shared wall, as whichever room is worked on has it
  useFrame(({ camera }) => {
    const o = ref.current;
    if (!o) return;
    const side = pair ? sideOf(pair.room, pair.other) : 1;
    if (side === 0) {
      o.visible = true;
      return;
    }
    o.getWorldPosition(world);
    const dot =
      (camera.position.x - world.x) * nx + (camera.position.z - world.z) * nz;
    o.visible = side * dot > 0;
  });
  const lit = kind !== "outlet" && kind !== "clock";
  return (
    <group
      ref={ref}
      position={at}
      rotation={[0, yawOf(wall), 0]}
      // built with the rest though hidden from behind its wall
      userData={MAY_SHOW_TAG}
    >
      <mesh
        geometry={g.body}
        material={BODY}
        raycast={unpickable}
        castShadow={lit}
        receiveShadow
        userData={ITEM_NAME}
      />
      {g.glass && (
        <mesh
          geometry={g.glass}
          material={kind === "art" ? PANE : GLASS}
          raycast={unpickable}
          userData={ITEM_NAME}
        />
      )}
    </group>
  );
}
