"use client";

import { useGLTF } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ThreeEvent } from "@react-three/fiber";
import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
} from "react";
import type { Panel } from "@furnishes/domain";
import {
  Box3,
  BoxGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  type Mesh,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  Vector2,
  Vector3,
  type Vector3Tuple,
} from "three";
import type { AssetNode } from "./assets-data";
import { recipeOf } from "./catalogue";
import { useEvent } from "./use-event";
import { propFor } from "./generation-store";
import {
  ACCENT_HEX,
  bodyOf,
  carcassOf,
  DANGER_HEX,
  FOLIAGE_HEX,
  isRug,
  LIGHT_WOOD_HEX,
  ROOM_ITEM_HEX,
} from "./piece-detail";
import { shade } from "./textures";
import {
  cloth,
  type Finish,
  finishOf,
  Mat,
  metal,
  METAL,
  PANEL,
  Rod,
  type Part,
  Slab,
  Soft,
  wood,
  Built,
} from "./finish";
import { Panels3D } from "./Panels3D";

/** the mirror's reflector and a part's body come when the room first
    has one, not with the studio (React's own lazy: next/dynamic's
    placeholder is a DOM element, which has no place in the canvas) */
const MirrorFace = lazy(() =>
  import("./Mirror").then((m) => ({ default: m.MirrorFace })),
);
const Part3D = lazy(() =>
  import("./Part3D").then((m) => ({ default: m.Part3D })),
);

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
 * from the palette. A generated item with a mesh of its own shows
 * that; and a room item with a stock mesh to its name (a sofa, an
 * armchair, a chair, a coffee table, a plant, a vase, a desk lamp:
 * the Poly Haven models under public/props) is drawn from it, the
 * cloth taking the item's own colour over the model's own weave, the
 * built form standing in until it loads or should it fail.
 */
const PLINTH = 0.06;
/** the gap between an overlay door and its neighbours, m */
const DOOR_GAP = 0.003;
const LEG = 0.1; // m, a sofa's legs
const CUSHION = 0.65; // m, about one seat

const DARK_WOOD = "#5a4634";
const LIGHT_WOOD = LIGHT_WOOD_HEX;
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
  /** doors on a carcass's bays, as configured; the recipe's when unset */
  doors?: boolean | undefined;
  selected: boolean;
  /** the pointer is over it: a thin outline says it can be picked */
  hovered: boolean;
  clash: boolean;
  /** the View settings ask for edges on every piece */
  edges: boolean;
  /** the piece opened as panels, drawn from them instead of its form */
  panels?: readonly Panel[] | undefined;
  /** the piece is in hand: its panels can be picked and moved */
  editable: boolean;
  onPick: () => void;
};

/** a small whole number from a name, the same every time */
const seedOf = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
};

/** where the Draco decoder is served from: the studio's own copy, so a
    compressed mesh never reaches out to a third party for it */
const DRACO = "/draco/";

/** which of a stock mesh's materials are its cloth, to take the
    item's colour; the rest (legs, a frame) keep their own */
const STOCK_CLOTH: Record<string, RegExp> = {
  sofa_02: /./,
  modern_arm_chair_01: /pillow/,
};
/** the stock mesh a room item is drawn from, by its name, and which of
    its materials take the item's colour; null for an item with none
    (a rug, a bed, a floor lamp keep their built form) */
const stockOf = (node: AssetNode) => {
  const name = node.name.toLowerCase();
  const cat = node.category;
  const fits =
    cat === "seating" ||
    cat === "tables" ||
    (cat === "lighting" && /desk|table/.test(name)) ||
    (cat === "decor" &&
      /plant|fig|palm|fern|vase|jug|bottle|basket/.test(name));
  const src = fits ? propFor(name) : undefined;
  if (!src) return null;
  const file = src.slice(src.lastIndexOf("/") + 1).replace(/\.glb$/, "");
  return { src, cloth: STOCK_CLOTH[file] ?? null };
};

/** the item's cloth over the model's own weave: its colour and sheen
    with the model's normal and roughness maps kept */
const clothOver = (own: MeshStandardMaterial, colour: string) => {
  const m = new MeshPhysicalMaterial({
    color: colour,
    roughness: 0.9,
    metalness: 0,
    sheen: 0.5,
    sheenColor: shade(colour, 0.1),
    sheenRoughness: 0.8,
    normalMap: own.normalMap,
    normalScale: own.normalScale,
    roughnessMap: own.roughnessMap,
  });
  m.userData.own = true;
  return m;
};

/** a generated or stock mesh fitted into the item's size, standing on
    the floor: a copy of its own, so two of a kind can stand in one
    room, its cloth in the item's colour when it has any */
function Model({
  src,
  size,
  cloth,
}: {
  src: string;
  size: Vector3Tuple;
  cloth: { colour: string; names: RegExp } | null;
}) {
  const { scene } = useGLTF(src, DRACO);
  const colour = cloth?.colour;
  const names = cloth?.names;
  const object = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const own = mesh.material as MeshStandardMaterial;
      if (colour && names?.test(own.name))
        mesh.material = clothOver(own, colour);
    });
    return o;
  }, [scene, colour, names]);
  useEffect(
    () => () => {
      object.traverse((child) => {
        const m = (child as Mesh).material as MeshPhysicalMaterial | undefined;
        if (m?.userData.own) m.dispose();
      });
    },
    [object],
  );
  const box = new Box3().setFromObject(object);
  const dims = box.getSize(new Vector3());
  const k = Math.min(
    size[0] / (dims.x || 1),
    size[1] / (dims.y || 1),
    size[2] / (dims.z || 1),
  );
  const centre = box.getCenter(new Vector3());
  return (
    <group scale={k} position={[-centre.x * k, -box.min.y * k, -centre.z * k]}>
      <primitive object={object} />
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
  const outline = p.clash || p.selected || p.edges || p.hovered;
  const form = <Form {...p} />;
  // a generated item's own mesh, else the stock mesh its name has; a
  // piece opened as panels is its panels
  const stock = p.panels
    ? null
    : p.node.model
      ? { src: p.node.model, cloth: null }
      : stockOf(p.node);
  const onClick = useEvent((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    p.onPick();
  });
  return (
    <group onClick={onClick}>
      {stock ? (
        <ModelGuard fallback={form}>
          <Suspense fallback={form}>
            <Model
              src={stock.src}
              size={p.size}
              cloth={
                stock.cloth ? { colour: p.colour, names: stock.cloth } : null
              }
            />
          </Suspense>
        </ModelGuard>
      ) : (
        form
      )}
      {outline && (
        <Outline size={p.size} colour={p.clash ? DANGER_HEX : ACCENT_HEX} />
      )}
    </group>
  );
}

const unpickable = () => null;

/** the box's twelve edges, a hair outside the piece, as the one-pixel
    lines the renderer draws */
function Outline({
  size: [w, h, d],
  colour,
}: {
  size: Vector3Tuple;
  colour: string;
}) {
  const geometry = useMemo(
    () => new EdgesGeometry(new BoxGeometry(w + 0.004, h + 0.004, d + 0.004)),
    [w, h, d],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  // the lines are drawn, never picked: a line is hit within a metre of
  // the pointer, which would take the pick from a panel or a neighbour
  return (
    <lineSegments
      geometry={geometry}
      position={[0, h / 2, 0]}
      raycast={unpickable}
    >
      <lineBasicMaterial color={colour} />
    </lineSegments>
  );
}

function Form(p: Props) {
  const [w, h, d] = p.size;
  const name = p.node.name.toLowerCase();
  const cat = p.node.category;
  const own = finishOf(p.colour, p.texture);
  const seed = seedOf(p.node.id);

  // a part modelled in the studio: the body the part worker built
  if (p.node.part)
    return (
      <Suspense fallback={null}>
        <Part3D node={p.node} f={own} size={p.size} />
      </Suspense>
    );

  // opened as panels: the panels are the piece
  if (p.panels)
    return (
      <Panels3D
        pieceId={p.node.id}
        panels={p.panels}
        f={own}
        editable={p.editable}
      />
    );

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
  // the kitchen's and the bathroom's fittings, by what they are
  if (/counter|worktop/.test(name)) return <Counter w={w} h={h} d={d} />;
  if (/fridge|refrigerator/.test(name)) return <Fridge w={w} h={h} d={d} />;
  if (/basin|vanity/.test(name))
    return <Basin id={p.node.id} w={w} h={h} d={d} f={own} />;
  if (/\bwc\b|toilet/.test(name)) return <Toilet w={w} h={h} d={d} />;
  if (/shower screen/.test(name)) return <Glass w={w} h={h} d={d} />;
  const body = bodyOf(p.node);
  if (body === "cart") return <Cart w={w} h={h} d={d} f={own} />;
  if (body === "bench") return <Bench w={w} h={h} d={d} f={own} />;

  // a carcass of panels: storage, a desk's pedestal, a wardrobe
  if (body === "carcass")
    return (
      <Carcass
        id={p.node.id}
        w={w}
        h={h}
        d={d}
        f={own}
        bays={
          p.parts.length
            ? p.parts
            : Array.from({ length: carcassOf(p.node)!.bays }, () => p.colour)
        }
        doors={p.doors ?? carcassOf(p.node)!.doors}
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
  // a wardrobe is a carcass of two tall doors
  if (/wardrobe/.test(name))
    return (
      <Carcass
        id={p.node.id}
        w={w}
        h={h}
        d={d}
        f={own}
        bays={[p.colour, p.colour]}
        doors
        books={false}
        hooks={false}
        seed={seed}
      />
    );
  if (/screen/.test(name))
    return (
      <Built
        parts={[
          { f: own, at: [0, h / 2 + 0.03, 0], dims: [w, h - 0.03, PANEL * 2] },
          ...[-1, 1].map((s): Part => ({
            f: wood(DARK_WOOD, false),
            at: [(s * w) / 3, 0.015, 0],
            dims: [0.06, 0.03, d],
          })),
        ]}
      />
    );

  switch (cat) {
    case "seating":
      if (/stool/.test(name)) return <Stool w={w} h={h} d={d} />;
      if (/\bchair\b/.test(name))
        return <Chair w={w} h={h} d={d} colour={p.colour} />;
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
      if (isRug({ name })) return <Rug w={w} d={d} colour={p.colour} />;
      if (/vase|jug|bottle/.test(name)) return <Vase w={w} h={h} d={d} />;
      if (/plant|tree|fig|palm|fern/.test(name))
        return <Plant w={w} h={h} d={d} seed={seed} />;
      return <Soft f={cloth(p.colour)} at={[0, h / 2, 0]} dims={[w, h, d]} />;
    }
  }
}

/* ---------- the Furnishes pieces: 18 mm panels ---------- */

function Carcass({
  id,
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
  /** the piece's id: its mirrors are named after it */
  id: string;
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
  const handle = metal(METAL);
  const rows = Array.from({ length: shelves }, (_, k) => {
    return PLINTH + PANEL + ((k + 1) * inner) / (shelves + 1);
  });
  const hookCount = Math.max(2, Math.round(bayW / 0.18));
  const parts: Part[] = [
    { f: plinthF, at: [0, PLINTH / 2, 0], dims: [w - 0.06, PLINTH, d - 0.05] },
    { f, at: [0, PLINTH + PANEL / 2, 0], dims: [w, PANEL, d] },
    { f, at: [0, h - PANEL / 2, 0], dims: [w, PANEL, d] },
    {
      f,
      at: [0, PLINTH + h / 2 - PLINTH / 2, -d / 2 + PANEL / 2],
      dims: [w - 2 * PANEL, h - PLINTH, PANEL],
    },
  ];
  bays.forEach((colour, i) => {
    const x0 = -w / 2 + PANEL + i * (bayW + PANEL);
    const mid = x0 + bayW / 2;
    const side = (x: number): Part => ({
      f,
      colour,
      at: [x, PLINTH + (h - PLINTH) / 2, 0],
      dims: [PANEL, h - PLINTH, d],
    });
    parts.push(side(x0 - PANEL / 2));
    for (const y of rows)
      parts.push({
        f,
        colour,
        at: [mid, y, 0],
        dims: [bayW, PANEL, d - PANEL],
      });
    if (i === bays.length - 1) parts.push(side(x0 + bayW + PANEL / 2));
    if (doors)
      // an overlay door stands a board proud of the carcass, a gap to
      // its neighbours, and throws its own line of shadow
      parts.push(
        {
          f,
          colour,
          at: [mid, PLINTH + PANEL + inner / 2, d / 2 + PANEL / 2],
          dims: [bayW + PANEL - DOOR_GAP, inner + PANEL - DOOR_GAP, PANEL],
        },
        {
          f: handle,
          at: [
            x0 + bayW - 0.05,
            PLINTH + PANEL + inner * 0.5,
            d / 2 + PANEL + 0.012,
          ],
          rod: [0.005, 0.11],
        },
      );
    if (hooks)
      for (let k = 0; k < hookCount; k++)
        parts.push({
          f: handle,
          at: [
            x0 + (bayW * (k + 0.5)) / hookCount,
            PLINTH + PANEL + inner * 0.72,
            -d / 2 + PANEL + 0.03,
          ],
          rod: [0.007, 0.06],
          rotation: [Math.PI / 2, 0, 0],
        });
  });
  return (
    <group>
      <Built parts={parts} />
      {bays.map((_, i) => {
        const x0 = -w / 2 + PANEL + i * (bayW + PANEL);
        const mid = x0 + bayW / 2;
        return (
          <group key={i}>
            {doors && f.mirror && (
              <Suspense fallback={null}>
                <MirrorFace
                  id={`${id}-door-${i}`}
                  at={[mid, PLINTH + PANEL + inner / 2, d / 2 + PANEL]}
                  size={[bayW + PANEL - DOOR_GAP, inner + PANEL - DOOR_GAP]}
                />
              </Suspense>
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

/** a shelf's books as one mesh: a box a book, each in its own colour
    (a vertex colour), merged so a shelf costs one draw and not two a
    book (a bookwall's books were a third of a furnished flat's draws) */
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
  const geometry = useMemo(() => {
    if (room < 0.16 || bayW < 0.2) return null;
    const colour = new Color();
    const parts = bookRun(bayW, room, seed).map((b) => {
      const g = new BoxGeometry(b.bw, b.bh, depth * 0.7);
      g.translate(x0 + b.x + b.bw / 2, y + b.bh / 2, -depth * 0.08);
      colour.set(b.colour);
      const n = g.getAttribute("position").count;
      const tone = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colour.toArray(tone, i * 3);
      g.setAttribute("color", new Float32BufferAttribute(tone, 3));
      return g;
    });
    const merged = parts.length ? mergeGeometries(parts) : null;
    for (const g of parts) g.dispose();
    return merged;
  }, [x0, y, bayW, depth, room, seed]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.85} />
    </mesh>
  );
}

function Bench({ w, h, d, f }: { w: number; h: number; d: number; f: Finish }) {
  const seatH = Math.max(0.1, h - 0.07);
  const inner = seatH - PLINTH - 2 * PANEL;
  return (
    <group>
      <Built
        parts={[
          {
            f: { colour: shade(f.colour, -0.28), rough: 0.8 },
            at: [0, PLINTH / 2, 0],
            dims: [w - 0.06, PLINTH, d - 0.05],
          },
          { f, at: [0, PLINTH + PANEL / 2, 0], dims: [w, PANEL, d] },
          { f, at: [0, seatH - PANEL / 2, 0], dims: [w, PANEL, d] },
          {
            f,
            at: [0, PLINTH + PANEL + inner / 2, -d / 2 + PANEL / 2],
            dims: [w, inner, PANEL],
          },
          ...[-1, 1].map((s): Part => ({
            f,
            at: [(s * (w - PANEL)) / 2, PLINTH + PANEL + inner / 2, 0],
            dims: [PANEL, inner, d],
          })),
        ]}
      />
      <Soft
        f={cloth(ROOM_ITEM_HEX)}
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
  const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx, sz]));
  return (
    <Built
      parts={[
        ...corners.map(([sx, sz]): Part => ({
          f: post,
          at: [
            sx! * (w / 2 - inset),
            0.05 + (h - 0.05) / 2,
            sz! * (d / 2 - inset),
          ],
          rod: [0.011, h - 0.05],
        })),
        ...[0.1, h * 0.55, h - 0.02].map((y): Part => ({
          f,
          at: [0, y, 0],
          dims: [w - 0.02, PANEL, d - 0.02],
        })),
        // the castors
        ...corners.map(([sx, sz]): Part => ({
          f: post,
          at: [sx! * (w / 2 - inset), 0.028, sz! * (d / 2 - inset)],
          rod: [0.028, 0.022],
          rotation: [0, 0, Math.PI / 2],
        })),
      ]}
    />
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
      <Built
        parts={[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): Part => ({
            f: wood(DARK_WOOD, false),
            at: [sx * (w / 2 - 0.08), LEG / 2, sz * (d / 2 - 0.08)],
            rod: [0.018, LEG, 0.024],
          })),
        )}
      />
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
      <Built
        parts={[
          {
            f: wood(LIGHT_WOOD, false),
            at: [0, h - top - 0.035, 0],
            dims: [w - 0.14, 0.07, d - 0.14],
          },
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz): Part => ({
              f: wood(shade(LIGHT_WOOD, -0.08), false),
              at: [sx * (w / 2 - inset), (h - top) / 2, sz * (d / 2 - inset)],
              rod: [0.016, h - top, 0.026],
            })),
          ),
        ]}
      />
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
      <Built
        parts={[
          {
            f: border,
            at: [0, 0.0135, -d / 2 + edge / 2],
            dims: [w, 0.003, edge],
          },
          {
            f: border,
            at: [0, 0.0135, d / 2 - edge / 2],
            dims: [w, 0.003, edge],
          },
          {
            f: border,
            at: [-w / 2 + edge / 2, 0.0135, 0],
            dims: [edge, 0.003, d],
          },
          {
            f: border,
            at: [w / 2 - edge / 2, 0.0135, 0],
            dims: [edge, 0.003, d],
          },
        ]}
      />
    </group>
  );
}

/* ---------- the kitchen's and the bathroom's fittings ---------- */

const WORKTOP = 0.04; // m, a stone worktop
const COUNTER_H = 0.9; // m, a kitchen counter's height
const CABINET_FROM = 1.5; // m, the wall cabinets' underside
const STONE = "#d9d4cb";
const STEEL = "#b8b6b2";
const WHITE_GOODS = "#e9e7e2";
const PORCELAIN = "#f4f2ee";
const GLASS_HEX = "#dfe9ea";
/** a bathroom mirror's pane: pale glass under a clear coat, which reads
    as a mirror from across the room without a room to reflect (a metal
    pane with nothing to reflect draws black) */
const MIRROR_PANE = "#dde4e5";

/** a fitted kitchen counter along a wall: base cabinets under a stone
    worktop with a sink and a hob set into it, and the wall cabinets
    above, their underside at CABINET_FROM; `h` is the top of the wall
    cabinets, `d` the base's depth (the wall cabinets are shallower) */
function Counter({ w, h, d }: { w: number; h: number; d: number }) {
  const doors = Math.max(1, Math.round(w / 0.6));
  const doorW = (w - PANEL * (doors + 1)) / doors;
  const f = wood(LIGHT_WOOD);
  const handle = metal(METAL);
  const steel = metal(STEEL, 0.3);
  const upperD = Math.min(d * 0.6, 0.35);
  const upperH = Math.max(0.3, h - CABINET_FROM);
  const baseH = COUNTER_H - WORKTOP - PLINTH;
  const sinkX = -w / 4;
  const hobX = w / 4;
  const xs = Array.from(
    { length: doors },
    (_, i) => -w / 2 + PANEL + i * (doorW + PANEL) + doorW / 2,
  );
  const across: Vector3Tuple = [0, 0, Math.PI / 2];
  return (
    <group>
      <Built
        parts={[
          // the base: a plinth, the carcass, the doors and their handles
          {
            f: { colour: shade(LIGHT_WOOD, -0.3), rough: 0.8 },
            at: [0, PLINTH / 2, -0.03],
            dims: [w - 0.02, PLINTH, d - 0.08],
          },
          {
            f,
            at: [0, PLINTH + baseH / 2, -PANEL],
            dims: [w, baseH, d - PANEL * 2],
          },
          ...xs.flatMap((x): Part[] => [
            {
              f,
              at: [x, PLINTH + baseH / 2, d / 2 - PANEL / 2],
              dims: [doorW - DOOR_GAP, baseH - DOOR_GAP, PANEL],
            },
            {
              f: handle,
              at: [x, COUNTER_H - WORKTOP - 0.06, d / 2 + 0.015],
              rod: [0.005, 0.12],
              rotation: across,
            },
          ]),
          // the sink, its tap and the hob, set into the worktop
          {
            f: steel,
            at: [sinkX, COUNTER_H - 0.002, -0.02],
            dims: [Math.min(0.5, w * 0.2), 0.012, Math.min(0.4, d * 0.65)],
          },
          {
            f: steel,
            at: [sinkX, COUNTER_H + 0.14, -d / 2 + 0.08],
            rod: [0.01, 0.28],
          },
          {
            f: { colour: "#1d1c1b", rough: 0.2, coat: 0.6 },
            at: [hobX, COUNTER_H + 0.004, -0.02],
            dims: [Math.min(0.58, w * 0.22), 0.008, Math.min(0.5, d * 0.8)],
          },
          // the wall cabinets and their handles
          {
            f,
            at: [0, CABINET_FROM + upperH / 2, -d / 2 + upperD / 2],
            dims: [w, upperH, upperD],
          },
          ...xs.map((x): Part => ({
            f: handle,
            at: [x, CABINET_FROM + 0.1, -d / 2 + upperD + 0.015],
            rod: [0.005, 0.12],
            rotation: across,
          })),
        ]}
      />
      <Soft
        f={{ colour: STONE, rough: 0.35, coat: 0.2 }}
        at={[0, COUNTER_H - WORKTOP / 2, 0]}
        dims={[w + 0.02, WORKTOP, d + 0.02]}
        radius={0.004}
      />
    </group>
  );
}

/** a fridge: a tall box in white goods' enamel, its door and handle */
function Fridge({ w, h, d }: { w: number; h: number; d: number }) {
  const f: Finish = { colour: WHITE_GOODS, rough: 0.3, coat: 0.3 };
  const split = h * 0.68;
  return (
    <group>
      <Soft f={f} at={[0, h / 2, 0]} dims={[w, h, d]} radius={0.015} />
      <Slab
        f={{ colour: shade(WHITE_GOODS, -0.2), rough: 0.5 }}
        at={[0, split, d / 2 + 0.001]}
        dims={[w - 0.02, 0.006, 0.004]}
      />
      {[split + 0.3, split - 0.3].map((y, i) => (
        <Rod
          key={i}
          f={metal(METAL)}
          at={[-w / 2 + 0.06, y, d / 2 + 0.02]}
          r={0.008}
          h={0.3}
        />
      ))}
    </group>
  );
}

/** a basin cabinet: a two-door carcass under a porcelain basin, a tap,
    and a mirror pane on the wall above it */
function Basin({
  id,
  w,
  h,
  d,
  f,
}: {
  /** the piece's id: its carcass's door mirrors are named after it */
  id: string;
  w: number;
  h: number;
  d: number;
  f: Finish;
}) {
  const top = h - 0.12;
  return (
    <group>
      <Carcass
        id={id}
        w={w}
        h={top}
        d={d}
        f={f}
        bays={[f.colour, f.colour]}
        doors
        books={false}
        hooks={false}
        seed={0}
      />
      <Soft
        f={{ colour: PORCELAIN, rough: 0.15, coat: 0.5 }}
        at={[0, top + 0.06, 0]}
        dims={[w, 0.12, d]}
        radius={0.03}
      />
      <Rod
        f={metal(STEEL, 0.25)}
        at={[0, top + 0.2, -d / 2 + 0.06]}
        r={0.012}
        h={0.16}
      />
      {/* the mirror over it: a still polished pane, not the live
          reflector, which is one to a scene and kept for the mirror
          finish a visitor puts on a door */}
      <mesh position={[0, top + 0.75, -d / 2 + 0.008]} receiveShadow>
        <boxGeometry args={[w, 0.8, 0.006]} />
        <meshPhysicalMaterial
          color={MIRROR_PANE}
          metalness={0}
          roughness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.04}
        />
      </mesh>
    </group>
  );
}

/** a WC: the pan on its foot, the seat, the cistern against the wall */
function Toilet({ w, h, d }: { w: number; h: number; d: number }) {
  const f: Finish = { colour: PORCELAIN, rough: 0.15, coat: 0.5 };
  const seatH = h * 0.55;
  const cisternD = Math.min(0.18, d * 0.26);
  return (
    <group>
      <Soft
        f={f}
        at={[0, seatH / 2, cisternD / 2]}
        dims={[w * 0.8, seatH, d - cisternD - 0.02]}
        radius={0.08}
      />
      <Soft
        f={f}
        at={[0, seatH + 0.02, cisternD / 2]}
        dims={[w, 0.04, d - cisternD]}
        radius={0.1}
      />
      <Soft
        f={f}
        at={[0, h / 2 + 0.1, -d / 2 + cisternD / 2]}
        dims={[w, h - 0.2, cisternD]}
        radius={0.02}
      />
    </group>
  );
}

/** a shower screen: a sheet of glass in a slim frame */
function Glass({ w, h, d }: { w: number; h: number; d: number }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[Math.max(w, 0.008), h, Math.max(d, 0.008)]} />
        <meshPhysicalMaterial
          color={GLASS_HEX}
          transparent
          opacity={0.28}
          roughness={0.05}
          metalness={0}
          depthWrite={false}
        />
      </mesh>
      <Slab
        f={metal(METAL, 0.4)}
        at={[0, h - 0.015, 0]}
        dims={[Math.max(w, 0.03), 0.03, Math.max(d, 0.03)]}
      />
    </group>
  );
}

/** a stool: a round seat on three splayed legs */
function Stool({ w, h, d }: { w: number; h: number; d: number }) {
  const r = Math.min(w, d) / 2;
  return (
    <group>
      <Rod f={wood(LIGHT_WOOD)} at={[0, h - 0.02, 0]} r={r} h={0.04} />
      <Built
        parts={[0, 1, 2].map((i): Part => {
          const a = (i / 3) * Math.PI * 2;
          return {
            f: metal(IRON, 0.5),
            at: [Math.cos(a) * r * 0.6, (h - 0.04) / 2, Math.sin(a) * r * 0.6],
            rod: [0.012, h - 0.04],
          };
        })}
      />
    </group>
  );
}

/** a dining chair: a seat on four legs with a back */
function Chair({
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
  const seatH = Math.min(0.45, h * 0.53);
  const f = wood(LIGHT_WOOD);
  return (
    <group>
      <Soft
        f={cloth(colour)}
        at={[0, seatH - 0.02, 0]}
        dims={[w, 0.04, d]}
        radius={0.01}
      />
      <Built
        parts={[
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz): Part => ({
              f,
              at: [
                sx * (w / 2 - 0.03),
                (seatH - 0.04) / 2,
                sz * (d / 2 - 0.03),
              ],
              rod: [0.014, seatH - 0.04],
            })),
          ),
          {
            f,
            at: [0, seatH + (h - seatH) / 2, -d / 2 + 0.02],
            dims: [w - 0.04, h - seatH, 0.025],
          },
        ]}
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
