"use client";

import { Edges, RoundedBox, useGLTF } from "@react-three/drei";
import { Component, Suspense, type ReactNode } from "react";
import {
  Box3,
  DoubleSide,
  Vector2,
  Vector3,
  type Texture,
  type Vector3Tuple,
} from "three";
import type { AssetNode } from "./assets-data";
import { recipeOf } from "./catalogue";
import { ACCENT_HEX, DANGER_HEX, FOLIAGE_HEX } from "./piece-detail";
import { shade, woodTexture } from "./textures";

/**
 * A piece's form in 3D, built from what it is, at the size the Detail
 * tab gives it. Furnishes pieces are 18 mm panel furniture: a carcass of
 * sides, top, bottom and a thin back on a recessed plinth, a bay per
 * part with its own colour, shelves by height; a sideboard's bays get
 * doors with handles, a bookwall's shelves get books, an organiser its
 * hooks, a bench its cushion, a cart its frame and castors. Room items
 * are the things a room has: a sofa and an armchair with cushions, arms
 * and legs in cloth; a table with a top, an apron and turned legs; a
 * lamp with its base, stem and lit shade; a plant in its pot; a vase
 * turned on a lathe; a rug with a border; a bed with pillows and a
 * duvet; a screen on its feet. A finish of wood grain is painted on
 * from the palette. A generated item with a mesh of its own shows that.
 */
const PANEL = 0.018;
const PLINTH = 0.06;
const LEG = 0.1; // m, a sofa's legs
const CUSHION = 0.65; // m, about one seat

const DARK_WOOD = "#5a4634";
const LIGHT_WOOD = "#cfae82";
const METAL = "#8d8780";
const BRASS = "#b59a6a";
const IRON = "#3a3633";
const SHADE_HEX = "#f1e8da";
const LAMP_GLOW = "#ffd9b0";
const CERAMIC = "#ebe4d8";
const TERRACOTTA = "#b97a5b";
const SOIL = "#4a3b31";
/** the spines of a shelf of books */
const BOOKS = [
  "#9a6b4f",
  "#6f7f6a",
  "#b9a27a",
  "#5b6b7f",
  "#a65b4b",
  "#d8c7a5",
  "#7a6a8e",
  "#c58f61",
];

type Props = {
  node: AssetNode;
  /** width, height, depth in metres */
  size: Vector3Tuple;
  colour: string;
  /** one colour per bay, when the piece has parts */
  parts: string[];
  texture: string;
  selected: boolean;
  /** the pointer is over it: a thin outline says it can be picked */
  hovered: boolean;
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

/** a surface: its colour, how it catches the light, a grain if any */
type Finish = {
  colour: string;
  rough: number;
  map?: Texture | undefined;
  /** cloth: a soft sheen across the weave */
  sheen?: number;
  /** glaze: a clear coat over the colour */
  coat?: number;
  metal?: number;
};
const cloth = (colour: string): Finish => ({ colour, rough: 0.95, sheen: 0.6 });
const wood = (colour: string, grain = true): Finish => ({
  colour,
  rough: 0.7,
  map: grain ? woodTexture(colour) : undefined,
});
const metal = (colour: string, rough = 0.35): Finish => ({
  colour,
  rough,
  metal: 0.85,
});

function Mat({ f, colour }: { f: Finish; colour?: string | undefined }) {
  const c = colour ?? f.colour;
  if (f.sheen !== undefined || f.coat !== undefined)
    return (
      <meshPhysicalMaterial
        color={c}
        roughness={f.rough}
        sheen={f.sheen ?? 0}
        sheenColor={shade(c, 0.1)}
        sheenRoughness={0.8}
        clearcoat={f.coat ?? 0}
        clearcoatRoughness={0.25}
      />
    );
  return (
    <meshStandardMaterial
      color={f.map ? shade(c, 0.02) : c}
      map={f.map && colour === undefined ? f.map : null}
      roughness={f.rough}
      metalness={f.metal ?? 0}
    />
  );
}

/** a square-edged part: a panel, a plinth, a frame member */
function Slab({
  at,
  dims,
  f,
  colour,
  rotation,
}: {
  at: Vector3Tuple;
  dims: Vector3Tuple;
  f: Finish;
  colour?: string | undefined;
  rotation?: Vector3Tuple | undefined;
}) {
  return (
    <mesh
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
    >
      <boxGeometry args={dims} />
      <Mat f={f} colour={colour} />
    </mesh>
  );
}

/** a soft part: a cushion, a mattress, a table top */
function Soft({
  at,
  dims,
  f,
  radius = 0.03,
  rotation,
}: {
  at: Vector3Tuple;
  dims: Vector3Tuple;
  f: Finish;
  radius?: number;
  rotation?: Vector3Tuple | undefined;
}) {
  const r = Math.min(radius, Math.min(...dims) / 2 - 0.001);
  return (
    <RoundedBox
      args={dims}
      radius={Math.max(0.002, r)}
      smoothness={3}
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
    >
      <Mat f={f} />
    </RoundedBox>
  );
}

/** a round part: a leg, a stem, a handle, a castor; upright unless turned */
function Rod({
  at,
  r,
  h,
  f,
  top,
  rotation,
}: {
  at: Vector3Tuple;
  r: number;
  h: number;
  f: Finish;
  top?: number;
  rotation?: Vector3Tuple | undefined;
}) {
  return (
    <mesh
      position={at}
      {...(rotation ? { rotation } : {})}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[top ?? r, r, h, 20]} />
      <Mat f={f} />
    </mesh>
  );
}

/** a small whole number from a name, the same every time */
const seedOf = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
};

/** a generated mesh fitted into the item's size, standing on the floor */
function Model({ src, size }: { src: string; size: Vector3Tuple }) {
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
    <group scale={k} position={[-centre.x * k, -box.min.y * k, -centre.z * k]}>
      <primitive object={scene} />
    </group>
  );
}

/** a mesh that fails to load falls back to the form */
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
  const [w, h, d] = p.size;
  const outline = p.clash || p.selected || p.edges || p.hovered;
  const form = <Form {...p} />;
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        p.onPick();
      }}
    >
      {p.node.model ? (
        <ModelGuard fallback={form}>
          <Suspense fallback={form}>
            <Model src={p.node.model} size={p.size} />
          </Suspense>
        </ModelGuard>
      ) : (
        form
      )}
      {outline && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w + 0.004, h + 0.004, d + 0.004]} />
          <meshBasicMaterial visible={false} />
          <Edges
            color={p.clash ? DANGER_HEX : ACCENT_HEX}
            lineWidth={p.clash ? 2 : p.selected ? 1.5 : 1}
          />
        </mesh>
      )}
    </group>
  );
}

function Form(p: Props) {
  const [w, h, d] = p.size;
  const name = p.node.name.toLowerCase();
  const cat = p.node.category;
  const own: Finish = {
    colour: p.colour,
    rough: roughnessOf(p.texture),
    map: p.texture === "Wood grain" ? woodTexture(p.colour) : undefined,
  };
  const seed = seedOf(p.node.id);

  // a single component from the strip: one panel
  if (cat === "components") {
    if (/shelf/.test(name))
      return <Slab f={own} at={[0, h / 2, 0]} dims={[w, PANEL, d]} />;
    if (/divider/.test(name))
      return <Slab f={own} at={[0, h / 2, 0]} dims={[PANEL, h, d]} />;
    if (/back/.test(name))
      return (
        <Slab
          f={own}
          at={[0, h / 2, -d / 2 + PANEL / 2]}
          dims={[w, h, PANEL]}
        />
      );
    if (/door/.test(name))
      return (
        <group>
          <Slab
            f={own}
            at={[0, h / 2, d / 2 - PANEL / 2]}
            dims={[w, h, PANEL]}
          />
          <Rod
            f={metal(METAL)}
            at={[w / 2 - 0.05, h * 0.55, d / 2 + 0.02]}
            r={0.006}
            h={0.1}
          />
        </group>
      );
    return <Slab f={own} at={[0, h / 2, 0]} dims={[w, h, d]} />; // a drawer
  }

  // a Furnishes piece is built as its recipe has it; another piece by
  // what it is called
  const r = recipeOf(p.node);
  const shape = r?.shape;
  if (shape === "trolley" || shape === "island" || /cart|trolley/.test(name))
    return <Cart w={w} h={h} d={d} f={own} />;
  if (shape === "bench" || /bench/.test(name))
    return <Bench w={w} h={h} d={d} f={own} />;

  // a carcass of panels: storage, a desk's pedestal, a wardrobe
  if (
    p.node.kind === "piece" &&
    (r ? shape !== "folding" : cat !== "decor" && cat !== "screens")
  )
    return (
      <Carcass
        w={w}
        h={h}
        d={d}
        f={own}
        bays={p.parts.length ? p.parts : [p.colour]}
        doors={
          r
            ? r.door && r.shape === "cabinet"
            : /sideboard|cabinet|wardrobe|drawer/.test(name)
        }
        books={
          r ? shape === "shelf" : /bookwall|bookcase|shelf|shelves/.test(name)
        }
        hooks={
          r
            ? shape === "organiser" || shape === "desk"
            : /entry|organiser|organizer|coat|hall/.test(name)
        }
        seed={seed}
      />
    );

  if (/\bbed\b/.test(name)) return <Bed w={w} h={h} d={d} colour={p.colour} />;
  if (/screen/.test(name))
    return (
      <group>
        <Slab
          f={own}
          at={[0, h / 2 + 0.03, 0]}
          dims={[w, h - 0.03, PANEL * 2]}
        />
        <Slab
          f={wood(DARK_WOOD, false)}
          at={[-w / 3, 0.015, 0]}
          dims={[0.06, 0.03, d]}
        />
        <Slab
          f={wood(DARK_WOOD, false)}
          at={[w / 3, 0.015, 0]}
          dims={[0.06, 0.03, d]}
        />
      </group>
    );

  switch (cat) {
    case "seating":
      return (
        <Seat
          w={w}
          h={h}
          d={d}
          colour={p.colour}
          seats={
            /armchair/.test(name)
              ? 1
              : Math.max(
                  1,
                  Math.round((w - 2 * Math.min(0.18, w * 0.12)) / CUSHION),
                )
          }
        />
      );
    case "tables":
      return <Table w={w} h={h} d={d} />;
    case "lighting":
      return <Lamp w={w} h={h} d={d} desk={/desk|table/.test(name)} />;
    default: {
      if (/rug/.test(name)) return <Rug w={w} d={d} colour={p.colour} />;
      if (/vase|jug|bottle/.test(name)) return <Vase w={w} h={h} d={d} />;
      if (/plant|tree|fig|palm|fern/.test(name))
        return <Plant w={w} h={h} d={d} seed={seed} />;
      return <Soft f={cloth(p.colour)} at={[0, h / 2, 0]} dims={[w, h, d]} />;
    }
  }
}

/* ---------- the Furnishes pieces: 18 mm panels ---------- */

function Carcass({
  w,
  h,
  d,
  f,
  bays,
  doors,
  books,
  hooks,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  f: Finish;
  bays: string[];
  doors: boolean;
  books: boolean;
  hooks: boolean;
  seed: number;
}) {
  const bayW = (w - PANEL * (bays.length + 1)) / bays.length;
  const inner = h - PLINTH - 2 * PANEL;
  const shelves = inner > 1.2 ? 3 : inner > 0.6 ? 1 : 0;
  const plinthF: Finish = { colour: shade(f.colour, -0.28), rough: 0.8 };
  return (
    <group>
      <Slab
        f={plinthF}
        at={[0, PLINTH / 2, 0]}
        dims={[w - 0.06, PLINTH, d - 0.05]}
      />
      <Slab f={f} at={[0, PLINTH + PANEL / 2, 0]} dims={[w, PANEL, d]} />
      <Slab f={f} at={[0, h - PANEL / 2, 0]} dims={[w, PANEL, d]} />
      <Slab
        f={f}
        at={[0, PLINTH + h / 2 - PLINTH / 2, -d / 2 + PANEL / 2]}
        dims={[w - 2 * PANEL, h - PLINTH, PANEL]}
      />
      {bays.map((colour, i) => {
        const x0 = -w / 2 + PANEL + i * (bayW + PANEL);
        const mid = x0 + bayW / 2;
        const rows = Array.from({ length: shelves }, (_, k) => {
          return PLINTH + PANEL + ((k + 1) * inner) / (shelves + 1);
        });
        return (
          <group key={i}>
            <Slab
              f={f}
              colour={colour}
              at={[x0 - PANEL / 2, PLINTH + (h - PLINTH) / 2, 0]}
              dims={[PANEL, h - PLINTH, d]}
            />
            {rows.map((y, k) => (
              <Slab
                key={k}
                f={f}
                colour={colour}
                at={[mid, y, 0]}
                dims={[bayW, PANEL, d - PANEL]}
              />
            ))}
            {i === bays.length - 1 && (
              <Slab
                f={f}
                colour={colour}
                at={[x0 + bayW + PANEL / 2, PLINTH + (h - PLINTH) / 2, 0]}
                dims={[PANEL, h - PLINTH, d]}
              />
            )}
            {doors && (
              <>
                <Slab
                  f={f}
                  colour={colour}
                  at={[
                    mid,
                    PLINTH + PANEL + inner / 2,
                    d / 2 - PANEL / 2 + 0.003,
                  ]}
                  dims={[bayW - 0.006, inner - 0.006, PANEL]}
                />
                <Rod
                  f={metal(METAL)}
                  at={[
                    x0 + bayW - 0.05,
                    PLINTH + PANEL + inner * 0.5,
                    d / 2 + 0.018,
                  ]}
                  r={0.005}
                  h={0.11}
                />
              </>
            )}
            {books &&
              !doors &&
              [PLINTH + PANEL, ...rows].map((y, k) => (
                <Books
                  key={k}
                  x0={x0}
                  y={y + PANEL / 2}
                  bayW={bayW}
                  depth={d}
                  room={(k < rows.length ? rows[k]! : h - PANEL) - y - PANEL}
                  seed={seed + i * 13 + k * 7}
                />
              ))}
            {hooks &&
              Array.from(
                { length: Math.max(2, Math.round(bayW / 0.18)) },
                (_, k) => (
                  <Rod
                    key={`hook${k}`}
                    f={metal(METAL)}
                    at={[
                      x0 +
                        (bayW * (k + 0.5)) /
                          Math.max(2, Math.round(bayW / 0.18)),
                      PLINTH + PANEL + inner * 0.72,
                      -d / 2 + PANEL + 0.03,
                    ]}
                    r={0.007}
                    h={0.06}
                    rotation={[Math.PI / 2, 0, 0]}
                  />
                ),
              )}
          </group>
        );
      })}
    </group>
  );
}

/** a shelf's books: spines of different widths, heights and colours,
    the same run every time for the same shelf */
const bookRun = (bayW: number, room: number, seed: number) => {
  let n = seed;
  const next = () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
  const run: { x: number; bw: number; bh: number; colour: string }[] = [];
  const until = bayW * (0.55 + next() * 0.3);
  let x = 0.02;
  while (x < until) {
    const bw = 0.018 + next() * 0.03;
    const bh = Math.min(room - 0.02, 0.17 + next() * 0.11);
    run.push({ x, bw, bh, colour: BOOKS[Math.floor(next() * BOOKS.length)]! });
    x += bw + 0.002;
  }
  return run;
};

function Books({
  x0,
  y,
  bayW,
  depth,
  room,
  seed,
}: {
  x0: number;
  y: number;
  bayW: number;
  depth: number;
  room: number;
  seed: number;
}) {
  if (room < 0.16 || bayW < 0.2) return null;
  return (
    <>
      {bookRun(bayW, room, seed).map((b, i) => (
        <Slab
          key={i}
          f={{ colour: b.colour, rough: 0.85 }}
          at={[x0 + b.x + b.bw / 2, y + b.bh / 2, -depth * 0.08]}
          dims={[b.bw, b.bh, depth * 0.7]}
        />
      ))}
    </>
  );
}

function Bench({ w, h, d, f }: { w: number; h: number; d: number; f: Finish }) {
  const seatH = Math.max(0.1, h - 0.07);
  const inner = seatH - PLINTH - 2 * PANEL;
  return (
    <group>
      <Slab
        f={{ colour: shade(f.colour, -0.28), rough: 0.8 }}
        at={[0, PLINTH / 2, 0]}
        dims={[w - 0.06, PLINTH, d - 0.05]}
      />
      <Slab f={f} at={[0, PLINTH + PANEL / 2, 0]} dims={[w, PANEL, d]} />
      <Slab f={f} at={[0, seatH - PANEL / 2, 0]} dims={[w, PANEL, d]} />
      <Slab
        f={f}
        at={[0, PLINTH + PANEL + inner / 2, -d / 2 + PANEL / 2]}
        dims={[w, inner, PANEL]}
      />
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          f={f}
          at={[(s * (w - PANEL)) / 2, PLINTH + PANEL + inner / 2, 0]}
          dims={[PANEL, inner, d]}
        />
      ))}
      <Soft
        f={cloth("#d9d2c8")}
        at={[0, seatH + 0.035, 0]}
        dims={[w - 0.02, 0.07, d - 0.02]}
        radius={0.03}
      />
    </group>
  );
}

function Cart({ w, h, d, f }: { w: number; h: number; d: number; f: Finish }) {
  const post = metal(IRON, 0.5);
  const inset = 0.03;
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Rod
            key={`${sx}${sz}`}
            f={post}
            at={[
              sx * (w / 2 - inset),
              0.05 + (h - 0.05) / 2,
              sz * (d / 2 - inset),
            ]}
            r={0.011}
            h={h - 0.05}
          />
        )),
      )}
      {[0.1, h * 0.55, h - 0.02].map((y, i) => (
        <Slab key={i} f={f} at={[0, y, 0]} dims={[w - 0.02, PANEL, d - 0.02]} />
      ))}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Rod
            key={`c${sx}${sz}`}
            f={post}
            at={[sx * (w / 2 - inset), 0.028, sz * (d / 2 - inset)]}
            r={0.028}
            h={0.022}
            rotation={[0, 0, Math.PI / 2]}
          />
        )),
      )}
    </group>
  );
}

/* ---------- the room's own things ---------- */

function Seat({
  w,
  h,
  d,
  colour,
  seats,
}: {
  w: number;
  h: number;
  d: number;
  colour: string;
  seats: number;
}) {
  const arm = Math.min(0.18, w * 0.12);
  const back = 0.2;
  const seatTop = Math.min(0.44, h * 0.55);
  const baseH = seatTop - LEG - 0.12;
  const inner = w - 2 * arm;
  const cw = inner / seats;
  const body = cloth(colour);
  const cushion = cloth(shade(colour, 0.04));
  return (
    <group>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Rod
            key={`${sx}${sz}`}
            f={wood(DARK_WOOD, false)}
            at={[sx * (w / 2 - 0.08), LEG / 2, sz * (d / 2 - 0.08)]}
            r={0.018}
            top={0.024}
            h={LEG}
          />
        )),
      )}
      <Soft
        f={body}
        at={[0, LEG + baseH / 2, 0]}
        dims={[w, baseH, d]}
        radius={0.02}
      />
      {[-1, 1].map((s) => (
        <Soft
          key={s}
          f={body}
          at={[(s * (w - arm)) / 2, LEG + baseH + 0.14, 0]}
          dims={[arm, 0.28, d]}
          radius={0.04}
        />
      ))}
      <Soft
        f={body}
        at={[0, LEG + baseH + (h - LEG - baseH) / 2, -d / 2 + back / 2]}
        dims={[inner, h - LEG - baseH, back]}
        radius={0.04}
      />
      {Array.from({ length: seats }, (_, i) => {
        const x = -inner / 2 + cw * (i + 0.5);
        return (
          <group key={i}>
            <Soft
              f={cushion}
              at={[x, LEG + baseH + 0.07, back / 2]}
              dims={[cw - 0.02, 0.14, d - back - 0.02]}
              radius={0.045}
            />
            <Soft
              f={cushion}
              at={[
                x,
                LEG + baseH + 0.14 + (h - LEG - baseH - 0.14) / 2,
                -d / 2 + back + 0.08,
              ]}
              dims={[cw - 0.03, h - LEG - baseH - 0.16, 0.16]}
              radius={0.05}
              rotation={[-0.1, 0, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}

function Table({ w, h, d }: { w: number; h: number; d: number }) {
  const top = 0.035;
  const f = wood(LIGHT_WOOD);
  const inset = 0.07;
  return (
    <group>
      <Soft f={f} at={[0, h - top / 2, 0]} dims={[w, top, d]} radius={0.008} />
      <Slab
        f={wood(LIGHT_WOOD, false)}
        at={[0, h - top - 0.035, 0]}
        dims={[w - 0.14, 0.07, d - 0.14]}
      />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Rod
            key={`${sx}${sz}`}
            f={wood(shade(LIGHT_WOOD, -0.08), false)}
            at={[sx * (w / 2 - inset), (h - top) / 2, sz * (d / 2 - inset)]}
            r={0.016}
            top={0.026}
            h={h - top}
          />
        )),
      )}
    </group>
  );
}

function Lamp({
  w,
  h,
  d,
  desk,
}: {
  w: number;
  h: number;
  d: number;
  desk: boolean;
}) {
  const r = Math.min(w, d) / 2;
  const shadeH = desk ? h * 0.3 : h * 0.22;
  const stemH = h - shadeH * 0.55;
  return (
    <group>
      <Rod
        f={metal(IRON, 0.5)}
        at={[0, 0.01, 0]}
        r={r * (desk ? 0.7 : 0.55)}
        h={0.02}
      />
      <Rod
        f={metal(BRASS)}
        at={[0, 0.02 + stemH / 2, 0]}
        r={desk ? 0.008 : 0.012}
        h={stemH}
      />
      <mesh position={[0, h - shadeH / 2, 0]} castShadow>
        <cylinderGeometry args={[r * 0.62, r, shadeH, 32, 1, true]} />
        <meshStandardMaterial
          color={SHADE_HEX}
          emissive={LAMP_GLOW}
          emissiveIntensity={0.45}
          roughness={0.9}
          side={DoubleSide}
        />
      </mesh>
      <pointLight
        position={[0, h - shadeH * 0.6, 0]}
        color={LAMP_GLOW}
        intensity={desk ? 0.35 : 0.7}
        distance={desk ? 1.6 : 3.2}
        decay={2}
      />
    </group>
  );
}

function Plant({
  w,
  h,
  d,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  seed: number;
}) {
  const r = Math.min(w, d) / 2;
  const potH = h * 0.36;
  const leaves = 9;
  return (
    <group>
      <Rod
        f={{ colour: TERRACOTTA, rough: 0.9 }}
        at={[0, potH / 2, 0]}
        r={r * 0.46}
        top={r * 0.6}
        h={potH}
      />
      <Rod
        f={{ colour: SOIL, rough: 1 }}
        at={[0, potH - 0.004, 0]}
        r={r * 0.56}
        h={0.008}
      />
      <Rod
        f={wood("#6b5a3e", false)}
        at={[0, potH + (h - potH) * 0.35, 0]}
        r={0.012}
        h={(h - potH) * 0.7}
      />
      {Array.from({ length: leaves }, (_, i) => {
        const a = (i / leaves) * Math.PI * 2 + (seed % 7) * 0.3;
        const lift = potH + (h - potH) * (0.45 + ((i * 37 + seed) % 10) / 22);
        const len = r * (0.9 + ((i * 11 + seed) % 5) / 10);
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * len * 0.5, lift, Math.sin(a) * len * 0.5]}
            rotation={[0.35 + ((i * 5) % 3) * 0.12, -a, 0]}
            scale={[len * 0.42, r * 0.16, len]}
            castShadow
          >
            <sphereGeometry args={[0.5, 10, 8]} />
            <meshStandardMaterial
              color={shade(FOLIAGE_HEX, (((i * 3 + seed) % 5) - 2) * 0.03)}
              roughness={0.85}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Vase({ w, h, d }: { w: number; h: number; d: number }) {
  const r = Math.min(w, d) / 2;
  const points = [
    [0, 0],
    [r * 0.5, 0],
    [r * 0.78, h * 0.14],
    [r * 0.92, h * 0.4],
    [r * 0.66, h * 0.7],
    [r * 0.46, h * 0.86],
    [r * 0.52, h],
  ].map(([x, y]) => new Vector2(x, y));
  return (
    <mesh castShadow receiveShadow>
      <latheGeometry args={[points, 32]} />
      <Mat f={{ colour: CERAMIC, rough: 0.3, coat: 0.6 }} />
    </mesh>
  );
}

function Rug({ w, d, colour }: { w: number; d: number; colour: string }) {
  const edge = 0.09;
  const f = cloth(colour);
  const border = cloth(shade(colour, -0.12));
  return (
    <group>
      <Soft f={f} at={[0, 0.006, 0]} dims={[w, 0.012, d]} radius={0.004} />
      <Slab
        f={border}
        at={[0, 0.0135, -d / 2 + edge / 2]}
        dims={[w, 0.003, edge]}
      />
      <Slab
        f={border}
        at={[0, 0.0135, d / 2 - edge / 2]}
        dims={[w, 0.003, edge]}
      />
      <Slab
        f={border}
        at={[-w / 2 + edge / 2, 0.0135, 0]}
        dims={[edge, 0.003, d]}
      />
      <Slab
        f={border}
        at={[w / 2 - edge / 2, 0.0135, 0]}
        dims={[edge, 0.003, d]}
      />
    </group>
  );
}

function Bed({
  w,
  h,
  d,
  colour,
}: {
  w: number;
  h: number;
  d: number;
  colour: string;
}) {
  const base = Math.min(0.26, h * 0.55);
  const mattress = Math.min(0.22, h - base);
  const linen = cloth(shade(colour, 0.06));
  const pw = (w - 0.2) / 2;
  return (
    <group>
      <Slab f={wood(DARK_WOOD)} at={[0, base / 2, 0]} dims={[w, base, d]} />
      <Soft
        f={linen}
        at={[0, base + mattress / 2, 0]}
        dims={[w - 0.04, mattress, d - 0.04]}
        radius={0.04}
      />
      {[-1, 1].map((s) => (
        <Soft
          key={s}
          f={cloth("#f1ebe2")}
          at={[(s * (pw + 0.06)) / 2, base + mattress + 0.06, -d / 2 + 0.33]}
          dims={[pw, 0.12, 0.5]}
          radius={0.05}
        />
      ))}
      <Soft
        f={cloth(shade(colour, -0.04))}
        at={[0, base + mattress + 0.045, d * 0.17]}
        dims={[w - 0.02, 0.09, d * 0.62]}
        radius={0.04}
      />
    </group>
  );
}
