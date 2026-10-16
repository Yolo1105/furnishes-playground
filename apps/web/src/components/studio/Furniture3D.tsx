"use client";

import { hash01, within } from "./seeded";
import { unpickable } from "./no-pick";
import { edgeLine } from "./edge-line";
import { useGLTF } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  lazy,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Panel } from "@furnishes/domain";
import {
  Box3,
  BoxGeometry,
  type Group,
  CanvasTexture,
  Color,
  SRGBColorSpace,
  type Texture,
  DoubleSide,
  EdgesGeometry,
  type Mesh,
  MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type PointLight,
  Vector2,
  Vector3,
  type Vector3Tuple,
} from "three";
import type { AssetNode } from "./assets-data";
import { seedOf } from "./seed";
import { clothColour, linear, rugColour, variedWood } from "./albedo";
import { tileMaps, WALL_TILE } from "./tile-maps";
import { recipeOf } from "./catalogue";
import { useEvent } from "./use-event";
import {
  kindOf,
  BUILT_KINDS,
  propUrl,
  lodAt,
  styleOf,
  type Variant,
  variantFor,
} from "./prop-variants";
import {
  DRACO_PATH,
  drawnModel,
  loadingModel,
  useModels,
  useProps,
} from "./props-store";
import { asStudio, cleanModel } from "./mesh-clean";
import type { StudioMaterial } from "./studio-materials";
import {
  ACCENT_HEX,
  bodyOf,
  carcassOf,
  configOf,
  DANGER_HEX,
  FOLIAGE_HEX,
  isRug,
  LIGHT_WOOD_HEX,
  ROOM_ITEM_HEX,
  isPlant,
} from "./piece-detail";
import { spineAtlas } from "./book-spines";
import { bookLayout, booksGeometry, type Run } from "./books";
import { dressShelves, type ShelfObject } from "./shelf-style";
import { plantLeaves, shelfObjectsGeometry } from "./shelf-objects";
import type { Drape } from "./drape";
import { shade } from "./textures";
import { tvLift } from "./design-rules";
import { type FormPart, furnishesForm, type Role } from "./furnishes-forms";
import {
  cloth,
  Cushion,
  Draped,
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
  CHROME,
} from "./finish";
import { slabGeometry } from "./part-geometry";
import { Panels3D } from "./Panels3D";
import {
  BedTouches,
  ChairClothes,
  clothesOn,
  TvCable,
  chairPose,
  LampCord,
  SeatTouches,
  TableTouches,
  CERAMICS,
} from "./LivedIn";
import { boxRaycast, budgetModel } from "./model-budget";
import { BakeScope, useBakeMembers } from "./Bake";
import { withBakeDefaults } from "./bake-defaults";
import { bakedOcclusion, CONTACT } from "./lightmap-nodes";
import { RUG_H, rugContactGeometry, rugGeometry } from "./rug";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { attribute, float, normalView, positionViewDirection } from "three/tsl";
import { useStudio } from "./studio-store";
import { useMaterial } from "./materials";
import { LAMP_BULB } from "./white-balance";

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
 * tab gives it. Furnishes pieces are built from their assembly record
 * by furnishes-forms.ts: bays of 18 mm panels on a base or castors,
 * each with what it is for and the add-ons chosen for it. Another
 * carcass (a wardrobe, a cabinet) has sides, top, bottom and a thin
 * back on a recessed plinth, shelves by height, doors with handles.
 * Room items are the things a room has: a sofa and an armchair with
 * cushions, arms and legs in cloth; a table with a top, an apron and
 * turned legs; a lamp with its base, stem and lit shade; a plant in its
 * pot; a vase turned on a lathe; a rug with a border; a bed with
 * pillows and a duvet on a light frame; a screen on its feet. A finish
 * of wood grain is painted on from the palette. A generated item with a
 * mesh of its own shows that; and a room item with a stock mesh to its
 * name (an armchair, a plant, a vase, a desk lamp: the Poly Haven
 * models under public/props) is drawn from it, the cloth taking the
 * item's own colour over the model's own weave, the built form standing
 * in until it loads or should it fail.
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

type Props = {
  node: AssetNode;
  /** it stands on a rug: its footprint is laid on the rug's top */
  onRug?: boolean | undefined;
  /** width, height, depth in metres */
  size: Vector3Tuple;
  colour: string;
  /** one colour per bay, when the piece has parts */
  parts: string[];
  texture: string;
  /** doors on a carcass's bays, as configured; the recipe's when unset */
  doors?: boolean | undefined;
  /** a Furnishes piece's add-ons, as configured; the recipe's when unset */
  accessories?: readonly string[] | undefined;
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
  /** the wall behind the piece, as its bake takes it: the plane z in the
      piece's frame (its back is −z), when it stands against one */
  wall?: number | null | undefined;
  /** a click on the piece; false gives it to a piece beneath */
  onPick: (e: ThreeEvent<MouseEvent>) => boolean | void;
};

/** the real model a room item is drawn from (public/props/index.json,
    prop-variants.ts): of its kind and its design, within a tenth of its
    size on every axis; and which of the model's materials take the
    item's colour. None for a product, a part, or an item with no model
    that fits, which keeps its built form */
const modelOf = (
  node: AssetNode,
  [w, h, d]: Vector3Tuple,
  models: readonly Variant[] | null,
) => {
  if (!models || node.part || recipeOf(node)) return null;
  const kind = kindOf(node.name, node.category);
  if (!kind || BUILT_KINDS.includes(kind)) return null;
  const pick = variantFor(models, kind, [w, h, d], styleOf(node.name, kind));
  if (!pick) return null;
  return {
    src: propUrl(pick.v.file),
    file: pick.v.file,
    cloth: pick.v.cloth ?? null,
    turned: pick.fit.turned,
    lod: pick.v.lod === true,
  };
};

/** a model's colour map with its colour taken out: its values kept
    (the weave's shading, its seams, its wear) and brought to a mean of
    `GREY_MEAN` (linear), so a dark leather's map and a pale linen's both
    carry the item's colour at its own tone; the colour is lifted by the
    same share. Its spread is held to `GREY_SPREAD` (the values' standard
    deviation over their mean): a dark leather's map lifted to that mean
    had its creases and highlights lifted tenfold with it, and a pale
    cloth over it read as a melted lump. A weave's finer spread is kept.
    Made once a map, on a canvas */
const GREY_MEAN = 0.8;
const GREY_SPREAD = 0.12;
const greys = new Map<string, Texture>();
const toSrgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const greyOf = (map: Texture) => {
  const had = greys.get(map.uuid);
  if (had) return had;
  const image = map.image as CanvasImageSource & {
    width: number;
    height: number;
  };
  if (!image?.width) return null;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.drawImage(image, 0, 0);
  const px = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = px.data;
  const lum = new Float32Array(d.length / 4);
  let sum = 0;
  for (let i = 0, k = 0; i < d.length; i += 4, k++) {
    const v =
      0.2126 * linear(d[i]! / 255) +
      0.7152 * linear(d[i + 1]! / 255) +
      0.0722 * linear(d[i + 2]! / 255);
    lum[k] = v;
    sum += v;
  }
  const mean = Math.max(0.01, sum / lum.length);
  let dev = 0;
  for (const v of lum) dev += (v / mean - 1) ** 2;
  const spread = Math.sqrt(dev / lum.length);
  const keep = spread > GREY_SPREAD ? GREY_SPREAD / spread : 1;
  for (let i = 0, k = 0; i < d.length; i += 4, k++) {
    const rel = 1 + keep * (lum[k]! / mean - 1);
    const v = Math.round(
      toSrgb(Math.min(1, Math.max(0, GREY_MEAN * rel))) * 255,
    );
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  g.putImageData(px, 0, 0);
  const grey = new CanvasTexture(canvas);
  grey.colorSpace = SRGBColorSpace;
  grey.flipY = map.flipY;
  grey.wrapS = map.wrapS;
  grey.wrapT = map.wrapT;
  grey.repeat.copy(map.repeat);
  grey.offset.copy(map.offset);
  grey.channel = map.channel;
  greys.set(map.uuid, grey);
  return grey;
};

/** the item's cloth over the model's own: the item's colour over a grey
    copy of the model's colour map (its weave, seams and wear kept), and
    the model's occlusion and sheen maps as they are (round 8, 1g; it
    once dropped the colour map for one flat colour). Cloth is matt:
    the model's own roughness map is left off (a leather's, kept, put a
    gloss on every crease), and its normals are drawn at half strength */
const CLOTH_ROUGH = 0.88;
const CLOTH_RELIEF = 0.5;
const clothOver = (own: MeshStandardMaterial, colour: string) => {
  const grey = own.map ? greyOf(own.map) : null;
  const tint = new Color(clothColour(colour));
  // the grey's mean brought back to the colour asked for
  if (grey) tint.multiplyScalar(1 / GREY_MEAN);
  const sheened = own as MeshStandardMaterial & Partial<MeshPhysicalMaterial>;
  const m = new MeshPhysicalMaterial({
    color: tint,
    map: grey ?? null,
    roughness: CLOTH_ROUGH,
    metalness: 0,
    sheen: sheened.sheen ?? 0.5,
    sheenColor: shade(colour, 0.1),
    sheenRoughness: sheened.sheenRoughness ?? 0.8,
    ...(sheened.sheenColorMap ? { sheenColorMap: sheened.sheenColorMap } : {}),
    ...(sheened.sheenRoughnessMap
      ? { sheenRoughnessMap: sheened.sheenRoughnessMap }
      : {}),
    normalMap: own.normalMap,
    normalScale: own.normalScale.clone().multiplyScalar(CLOTH_RELIEF),
    aoMap: own.aoMap,
    aoMapIntensity: own.aoMapIntensity,
  });
  m.userData.own = true;
  return m;
};

/** a generated or stock mesh fitted into the item's size, standing on
    the floor: a copy of its own, so two of a kind can stand in one
    room, its cloth in the item's colour when it has any. A listed model
    (`fit`) is turned a quarter when that fits and scaled on each axis
    (never past a tenth, prop-variants.ts); a generated one is scaled
    evenly to stand within the item. It tells the piece's bake its box,
    for its footprint on the floor */
type ModelProps = {
  src: string;
  size: Vector3Tuple;
  /** the item's colour, and the pattern naming the model's cloth
      materials (index.json's `cloth`): a string, so a render that makes
      the same one again keeps the copy */
  cloth: { colour: string; names: string } | null;
  fit?: { file: string; turned: boolean } | undefined;
  /** a generated mesh (a concept, Part 3b): cleaned once it loads
      (mesh-clean.ts), turned so its long side runs as the item's does,
      and given the studio's material for what it is made of */
  generated?: { material?: StudioMaterial | undefined } | undefined;
};

function Model({
  src,
  size,
  cloth,
  fit,
  generated,
  dither,
  onShown,
  far = false,
}: ModelProps & {
  /** how much of it shows, 0 to 1, read each frame: its materials its
      own, each pixel kept or dropped by a hash of its place (three's
      `alphaHash`), so it fades in or out over another with no sorting
      and the frames the picture settles over smooth it (LodModel) */
  dither?: RefObject<number> | undefined;
  /** told once it is drawn */
  onShown?: (() => void) | undefined;
  /** the far copy (LodModel), counted for the stage */
  far?: boolean | undefined;
}) {
  const { scene } = useGLTF(src, DRACO_PATH);
  const colour = cloth?.colour;
  const names = cloth?.names;
  const dithered = dither !== undefined;
  const made = generated !== undefined;
  const material = generated?.material;
  // the item's long side across or along: a generated mesh is turned a
  // quarter when its own long side runs the other way
  const across = size[0] >= size[2];
  const { object, box } = useMemo(() => {
    const pattern = names ? new RegExp(names, "i") : null;
    // a generated mesh's strays dropped and its picture de-lit, before
    // it is brought within what any model may cost, stock or generated,
    // once for the loaded scene its copies share (model-budget.ts)
    if (made) cleanModel(scene);
    budgetModel(scene);
    const raw = new Box3().setFromObject(scene).getSize(new Vector3());
    const turned = made ? raw.x >= raw.z !== across : !!fit?.turned;
    const o = scene.clone(true);
    o.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // picked by its box, as the budget set on the loaded meshes (a
      // copy takes their geometry, not their own raycast)
      mesh.raycast = boxRaycast;
      const own = mesh.material as MeshStandardMaterial;
      if (colour && pattern?.test(own.name))
        mesh.material = clothOver(own, colour);
      else if (material) mesh.material = asStudio(own, material);
      else if (dithered) {
        // its own copy, so its fade is not its twin's
        const m = own.clone();
        m.userData.own = true;
        mesh.material = m;
      }
      if (dithered) (mesh.material as MeshStandardMaterial).alphaHash = true;
    });
    o.rotation.y = turned ? Math.PI / 2 : 0;
    o.updateMatrixWorld(true);
    return { object: o, box: new Box3().setFromObject(o) };
  }, [scene, colour, names, fit?.turned, made, material, across, dithered]);
  useEffect(
    () => () => {
      object.traverse((child) => {
        const m = (child as Mesh).material as MeshPhysicalMaterial | undefined;
        if (m?.userData.own) m.dispose();
      });
    },
    [object],
  );
  const file = fit?.file;
  useEffect(() => {
    if (!file) return;
    drawnModel(file, true, far);
    return () => drawnModel(file, false, far);
  }, [file, far]);
  useEffect(() => onShown?.(), [object, onShown]);
  const shown = useRef(1);
  useFrame(() => {
    const k = dither?.current;
    if (k === undefined || k === shown.current) return;
    shown.current = k;
    setOpacity(object, k);
  });
  const dims = box.getSize(new Vector3());
  const even = Math.min(
    size[0] / (dims.x || 1),
    size[1] / (dims.y || 1),
    size[2] / (dims.z || 1),
  );
  const k: Vector3Tuple = fit
    ? [
        size[0] / (dims.x || 1),
        size[1] / (dims.y || 1),
        size[2] / (dims.z || 1),
      ]
    : [even, even, even];
  const centre = box.getCenter(new Vector3());
  // its footprint: a base low and narrow, and its body above, inside
  // its box (a plant's pot and its leaves, a chair's legs and its seat)
  const anchor = useRef<Group>(null);
  const [w, h, d] = size;
  useBakeMembers(() => {
    const g = anchor.current;
    if (!g) return [];
    const at = (
      c: [number, number, number],
      half: [number, number, number],
    ) => ({
      kind: "solid" as const,
      mesh: g as unknown as Mesh,
      box: { c, h: half },
      shared: false,
      points: false,
    });
    return [
      at([0, h * 0.15, 0], [w * 0.3, h * 0.15, d * 0.3]),
      at([0, h * 0.6, 0], [w * 0.4, h * 0.3, d * 0.4]),
    ];
  }, [w, h, d]);
  return (
    <group ref={anchor}>
      <group
        scale={k}
        position={[-centre.x * k[0], -box.min.y * k[1], -centre.z * k[2]]}
      >
        <primitive object={object} />
      </group>
    </group>
  );
}

/** each of a model's own materials as much shown as `k` of its own
    opacity (Model's dither) */
const setOpacity = (object: Object3D, k: number) =>
  object.traverse((child) => {
    const m = (child as Mesh).material as MeshStandardMaterial | undefined;
    if (!m?.userData.own) return;
    m.userData.opacity ??= m.opacity;
    m.opacity = (m.userData.opacity as number) * k;
  });

/** how long a model's other copy takes to fade in, and the one it
    replaces then to fade out, ms each; and how long the camera stays
    past the line before the other is asked for, ms (a camera passing
    through, the opening's flight among them, loads nothing) */
const LOD_FADE_MS = 150;
const LOD_DWELL_MS = 400;
/** a listed model's far copy (index.json's `lod`), beside it */
const farOf = (src: string) => src.replace(/\.glb$/, ".lod1.glb");
const at = new Vector3();

/**
 * A listed model with a far copy: drawn from the copy past the near
 * distance and in full within it, with a margin either way so it does
 * not flip at the line (prop-variants.ts, `lodAt`). The copy comes
 * first, as it is the quicker to load, and the full model when the
 * camera comes near, so a view of the flat from afar never loads the
 * full ones. The other copy loads behind the one shown, fades in over
 * it, and the old one then fades out (dithered, Model), so a change of
 * copy is neither a pop nor a hole.
 */
function LodModel({
  stand,
  ...model
}: ModelProps & {
  /** what stands in while the first copy loads (the built form) */
  stand: ReactNode;
}) {
  const anchor = useRef<Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  // the copy drawn, and the one it replaces while it fades in
  const [level, setLevel] = useState<{ now: 0 | 1; was: 0 | 1 | null }>({
    now: 1,
    was: null,
  });
  const incoming = useRef(1);
  const outgoing = useRef(1);
  const fade = useRef<number | null>(null);
  // the other copy wanted, and since when
  const asked = useRef<{ at: number; timer: number } | null>(null);
  useEffect(
    () => () => {
      if (asked.current) window.clearTimeout(asked.current.timer);
    },
    [],
  );
  useFrame(({ camera }) => {
    const g = anchor.current;
    if (!g) return;
    if (fade.current !== null && level.was !== null) {
      const t = (performance.now() - fade.current) / LOD_FADE_MS;
      incoming.current = Math.min(1, t);
      outgoing.current = Math.min(1, Math.max(0, 2 - t));
      if (t >= 2) {
        fade.current = null;
        setLevel({ now: level.now, was: null });
      }
      invalidate();
      return;
    }
    if (level.was !== null) return;
    const far = g.getWorldPosition(at).distanceTo(camera.position);
    const want = lodAt(far, level.now);
    const now = performance.now();
    if (want === level.now) {
      if (asked.current) window.clearTimeout(asked.current.timer);
      asked.current = null;
      return;
    }
    // a frame when the dwell is over, to look again
    asked.current ??= {
      at: now,
      timer: window.setTimeout(invalidate, LOD_DWELL_MS + 16),
    };
    if (now - asked.current.at < LOD_DWELL_MS) return;
    asked.current = null;
    incoming.current = 0;
    outgoing.current = 1;
    setLevel({ now: want, was: level.now });
  });
  // a frame once a change is done, to look again: the camera may have
  // gone on while the new copy loaded and faded in
  useEffect(() => invalidate(), [level, invalidate]);
  // the fade begins once the new copy is drawn (it may have loaded first)
  const shown = useEvent(() => {
    if (level.was === null) return;
    fade.current = performance.now();
    invalidate();
  });
  const srcOf = (k: 0 | 1) => (k === 1 ? farOf(model.src) : model.src);
  return (
    <group ref={anchor}>
      {level.was !== null && (
        // the change under way counts as a model on its way, so a
        // picture waits for it
        <ModelLoading />
      )}
      {level.was !== null && (
        <Model
          key={level.was}
          {...model}
          src={srcOf(level.was)}
          dither={outgoing}
          far={level.was === 1}
        />
      )}
      <Suspense fallback={level.was === null ? stand : null}>
        <Model
          key={level.now}
          {...model}
          src={srcOf(level.now)}
          dither={incoming}
          onShown={shown}
          far={level.now === 1}
        />
      </Suspense>
    </group>
  );
}

/** a model on its way while its form stands in (Suspense's fallback),
    counted for the stage to say */
function ModelLoading() {
  useEffect(() => {
    loadingModel(true);
    return () => loadingModel(false);
  }, []);
  return null;
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

/** a loose piece is set down a little off the square, as no one lines a
    chair or a coffee table up with the walls: turned 1–4° either way,
    seeded by the piece; anything standing against a wall or built in
    stays square (round 8, 1h) */
const LOOSE_TURN = { least: 1, most: 4 } as const;
const looseTurn = (node: AssetNode) => {
  const name = node.name.toLowerCase();
  const loose =
    (node.category === "seating" &&
      !/sofa|couch|settee|bench|bed/.test(name)) ||
    (node.category === "tables" && /coffee|side|end|occasional/.test(name)) ||
    (node.category === "decor" &&
      (isPlant(node) || /vase|pouf|ottoman/.test(name)));
  if (!loose) return 0;
  const seed = seedOf(node.id);
  const deg = within(hash01(seed, 1), [LOOSE_TURN.least, LOOSE_TURN.most]);
  return ((hash01(seed, 2) < 0.5 ? -1 : 1) * deg * Math.PI) / 180;
};

export function Furniture3D(p: Props) {
  const outline = p.clash || p.selected || p.edges || p.hovered;
  const form = <Form {...p} />;
  // a generated item's own mesh, else the listed model that fits it; a
  // piece opened as panels is its panels
  const models = useModels();
  const listed = p.panels ? null : modelOf(p.node, p.size, models);
  const stock = p.panels
    ? null
    : p.node.model
      ? {
          src: p.node.model,
          cloth: null,
          fit: undefined,
          generated: { material: p.node.material },
        }
      : listed
        ? { src: listed.src, cloth: listed.cloth, fit: listed, lod: listed.lod }
        : null;
  const onClick = useEvent((e: ThreeEvent<MouseEvent>) => {
    // false: the click is another piece's, beneath this one
    if (p.onPick(e) === false) return;
    e.stopPropagation();
  });
  // one against a wall stays square to it
  const turn = p.wall == null ? looseTurn(p.node) : 0;
  // a model on its way: the form stands in, counted for the stage
  const standIn = (
    <>
      {form}
      <ModelLoading />
    </>
  );
  const model = (s: NonNullable<typeof stock>): ModelProps => ({
    src: s.src,
    size: p.size,
    cloth: s.cloth ? { colour: p.colour, names: s.cloth } : null,
    fit: s.fit,
    generated: "generated" in s ? s.generated : undefined,
  });
  return (
    <group onClick={onClick}>
      {/* the piece within its bake (Bake.tsx): its light baked once it is
          built, and its footprint on the floor */}
      <BakeScope
        name={p.node.name}
        wall={p.wall ?? null}
        lift={p.onRug ? RUG_H : 0}
      >
        <group rotation={[0, turn, 0]}>
          {stock ? (
            <ModelGuard fallback={form}>
              <Suspense fallback={standIn}>
                {"lod" in stock && stock.lod ? (
                  <LodModel {...model(stock)} stand={standIn} />
                ) : (
                  <Model {...model(stock)} />
                )}
              </Suspense>
            </ModelGuard>
          ) : (
            form
          )}
        </group>
      </BakeScope>
      {outline && (
        <Outline size={p.size} colour={p.clash ? DANGER_HEX : ACCENT_HEX} />
      )}
    </group>
  );
}

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
  // faded with distance, so a far line does not crawl (edge-line.ts)
  // (kept a colour, shared by every outline: not let go with one)
  const material = edgeLine(colour);
  // the lines are drawn, never picked: a line is hit within a metre of
  // the pointer, which would take the pick from a panel or a neighbour
  return (
    <lineSegments
      geometry={geometry}
      material={material}
      position={[0, h / 2, 0]}
      raycast={unpickable}
    />
  );
}

function Form(p: Props) {
  const [w, h, d] = p.size;
  const name = p.node.name.toLowerCase();
  const cat = p.node.category;
  const own = finishOf(p.colour, p.texture);
  const seed = seedOf(p.node.id);
  const lived = useStudio((s) => s.scene.livedIn);

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

  // a Furnishes piece is built as its recipe's assembly has it, with
  // its add-ons and a few things in use (furnishes-forms.ts); another
  // piece by what it is called
  const r = recipeOf(p.node);
  if (r) {
    const config = configOf(p.node, {
      ...(p.doors !== undefined ? { doors: p.doors } : {}),
      ...(p.accessories ? { accessories: [...p.accessories] } : {}),
    })!;
    return (
      <FurnishesPiece
        id={p.node.id}
        recipe={r}
        size={p.size}
        f={own}
        colours={p.parts.length ? p.parts : [p.colour]}
        doors={config.doors}
        accessories={config.accessories}
        seed={seed}
      />
    );
  }
  // the kitchen's and the bathroom's fittings, by what they are
  if (/counter|worktop/.test(name)) return <Counter w={w} h={h} d={d} />;
  if (/fridge|refrigerator/.test(name)) return <Fridge w={w} h={h} d={d} />;
  if (/washing machine|washer/.test(name)) return <Washer w={w} h={h} d={d} />;
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
        books={/bookwall|bookcase|shelf|shelves/.test(name)}
        hooks={/entry|organiser|organizer|coat|hall/.test(name)}
        seed={seed}
      />
    );

  if (/bunk/.test(name)) return <BunkBed w={w} h={h} d={d} colour={p.colour} />;
  if (/\bbed\b/.test(name))
    return (
      <Bed w={w} h={h} d={d} colour={p.colour} seed={lived ? seed : null} />
    );
  if (/tv console|media console/.test(name))
    return (
      <group>
        <MediaConsole w={w} h={h} d={d} f={own} />
        {lived && <TvCable w={w} h={h} d={d} seed={seed} />}
      </group>
    );
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

  // a bean bag: one soft, slumped form
  if (/bean bag/.test(name))
    return (
      <Soft
        f={cloth(p.colour)}
        at={[0, h / 2, 0]}
        dims={[w, h, d]}
        radius={Math.min(w, h, d) * 0.45}
      />
    );
  switch (cat) {
    case "seating":
      if (/stool/.test(name)) return <Stool w={w} h={h} d={d} />;
      if (/\bchair\b/.test(name)) {
        const chair = (
          <group>
            <Chair w={w} h={h} d={d} colour={p.colour} />
            {lived && clothesOn(seed) && (
              <ChairClothes w={w} h={h} d={d} back={CHAIR_BACK} seed={seed} />
            )}
          </group>
        );
        if (!lived || !/dining/.test(name)) return chair;
        // a dining chair left pulled out and turned a little
        const pose = chairPose(seed);
        return (
          <group position={[0, 0, -pose.back]} rotation={[0, pose.rotation, 0]}>
            {chair}
          </group>
        );
      }
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
          wear={seed}
          seed={lived ? seed : null}
        />
      );
    case "tables":
      return (
        <group>
          <Table w={w} h={h} d={d} stone={/coffee/.test(name)} seed={seed} />
          {lived && /coffee|dining/.test(name) && (
            <TableTouches
              w={w}
              h={h}
              d={d}
              coffee={/coffee/.test(name)}
              seed={seed}
            />
          )}
        </group>
      );
    case "lighting":
      return (
        <group>
          <Lamp w={w} h={h} d={d} desk={/desk|table/.test(name)} />
          {lived && !/desk|table/.test(name) && <LampCord seed={seed} />}
        </group>
      );
    default: {
      if (isRug({ name })) return <Rug w={w} d={d} colour={p.colour} />;
      if (/vase|jug|bottle/.test(name)) return <Vase w={w} h={h} d={d} />;
      if (isPlant({ name })) return <Plant w={w} h={h} d={d} seed={seed} />;
      return <Soft f={cloth(p.colour)} at={[0, h / 2, 0]} dims={[w, h, d]} />;
    }
  }
}

/** a plinth set back under a piece, as a cabinet's is: `PLINTH_IN` at
    the front so its toe space throws a shadow, 10 mm at the back and
    30 mm at the sides */
const PLINTH_IN = 0.065;
const plinthOf = (w: number, d: number, f: Finish): Part => ({
  f,
  at: [0, PLINTH / 2, (0.01 - PLINTH_IN) / 2],
  dims: [w - 0.06, PLINTH, d - PLINTH_IN - 0.01],
});
/** a back panel stands this far in from the carcass's back edge */
const BACK_IN = 0.01;
const backOf = (
  w: number,
  h: number,
  y: number,
  d: number,
  f: Finish,
): Part => ({
  f,
  at: [0, y, -d / 2 + BACK_IN + PANEL / 2],
  dims: [w, h, PANEL],
});
/** a door set in its opening: the gap round it, m, and how far its face
    stands proud of the carcass's front */
const REVEAL = 0.0025;
const FRONT_PROUD = 0.0015;
/** a D-pull at real size: a 12 mm bar 160 mm long on two posts 128 mm
    apart, 28 mm off the front, in brushed steel (upright on a door, flat
    on a drawer) */
const PULL = {
  r: 0.006,
  length: 0.16,
  centres: 0.128,
  off: 0.028,
  post: 0.0045,
};
const pull = (x: number, y: number, z: number, upright: boolean): Part[] => {
  const f = metal(METAL, 0.32);
  const bar: Part = {
    f,
    at: [x, y, z + PULL.off],
    rod: [PULL.r, PULL.length],
    ...(upright ? {} : { rotation: [0, 0, Math.PI / 2] as Vector3Tuple }),
  };
  const posts = [-1, 1].map((s): Part => ({
    f,
    at: upright
      ? [x, y + (s * PULL.centres) / 2, z + PULL.off / 2]
      : [x + (s * PULL.centres) / 2, y, z + PULL.off / 2],
    rod: [PULL.post, PULL.off],
    rotation: [Math.PI / 2, 0, 0],
  }));
  return [bar, ...posts];
};

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
    plinthOf(w, d, plinthF),
    { f, at: [0, PLINTH + PANEL / 2, 0], dims: [w, PANEL, d] },
    { f, at: [0, h - PANEL / 2, 0], dims: [w, PANEL, d] },
    backOf(w - 2 * PANEL, inner, PLINTH + PANEL + inner / 2, d, f),
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
    // the shelves from the back panel's face to a hair in from the front
    for (const y of rows)
      parts.push({
        f,
        colour,
        at: [mid, y, (BACK_IN + PANEL - 0.009) / 2],
        dims: [bayW, PANEL, d - BACK_IN - PANEL - 0.009],
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
        ...pull(
          x0 + bayW - 0.05,
          PLINTH + PANEL + inner * 0.5,
          d / 2 + PANEL,
          true,
        ),
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
  // each open bay's shelves, from the bottom up, for the stylist
  const shelfRuns: Run[] = bays.flatMap((_, i) =>
    [PLINTH + PANEL, ...rows].map((y, k) => ({
      x0: -w / 2 + PANEL + i * (bayW + PANEL),
      y: y + PANEL / 2,
      bayW,
      z: -d * 0.08,
      deep: d * 0.7,
      room: (k < rows.length ? rows[k]! : h - PANEL) - y - PANEL,
      seed: seed + i * 13 + k * 7,
    })),
  );
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
          </group>
        );
      })}
      {books && !doors && <Shelves runs={shelfRuns} seed={seed} />}
    </group>
  );
}

/** the house's orange, as its connectors and hooks are anodised */
const FURNISHES_ORANGE = "#d4652e";
const RUBBER = "#2b2826";

/** a form part's finish, by what it is made of */
const finishFor = (role: Role, own: Finish, colour?: string): Finish => {
  switch (role) {
    case "body":
      return own;
    case "base":
      return { colour: shade(own.colour, -0.28), rough: 0.8 };
    case "accent":
      return { colour: FURNISHES_ORANGE, rough: 0.5 };
    case "metal":
      return metal(METAL);
    case "dark":
      return { colour: RUBBER, rough: 0.75 };
    case "cloth":
      return cloth(colour ?? ROOM_ITEM_HEX);
    case "thing":
      return { colour: colour ?? ROOM_ITEM_HEX, rough: 0.8 };
  }
};

const partOf = (p: FormPart, own: Finish): Part => {
  const f = finishFor(p.role, own, p.colour);
  const turn = p.rotation ? { rotation: p.rotation } : {};
  return "dims" in p
    ? {
        f,
        at: p.at,
        dims: p.dims,
        ...(p.role === "body" && p.colour ? { colour: p.colour } : {}),
        ...turn,
      }
    : { f, at: p.at, rod: p.rod, ...turn };
};

/** a Furnishes piece: its form's parts drawn a few meshes at a time,
    its shelves' books, and a mirror on each door when the finish is */
function FurnishesPiece({
  id,
  recipe,
  size: [w, h, d],
  f,
  colours,
  doors,
  accessories,
  seed,
}: {
  id: string;
  recipe: NonNullable<ReturnType<typeof recipeOf>>;
  size: Vector3Tuple;
  f: Finish;
  colours: string[];
  doors: boolean;
  accessories: string[];
  seed: number;
}) {
  const key = JSON.stringify([w, h, d, colours, doors, accessories, seed]);
  const form = useMemo(
    () =>
      furnishesForm({
        recipe,
        size: [w, h, d],
        doors,
        accessories,
        colours,
        seed,
      }),
    // the form is read again only when what it is built from changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe, key],
  );
  // the parts with their finishes, built again only when the form or
  // the finish changes, not on every draw of the piece (a drag); the
  // small hardware (shelf pins, cam caps) on the desktop tier alone
  const finish = JSON.stringify(f);
  const detailed = useStudio((s) => s.tier === "desktop");
  const parts = useMemo(
    () =>
      form.parts
        .filter((p) => detailed || !p.detail)
        .map((p) => partOf(p, JSON.parse(finish) as Finish)),
    [form, finish, detailed],
  );
  return (
    <group>
      <Built parts={parts} />
      <Shelves runs={form.books} seed={seed} />
      {f.mirror &&
        form.doors.map((o, k) => (
          <Suspense key={k} fallback={null}>
            <MirrorFace id={`${id}-door-${k}`} at={o.at} size={o.size} />
          </Suspense>
        ))}
    </group>
  );
}

/**
 * A piece's open shelves as a stylist leaves them (shelf-style.ts, round
 * 8 Part 4): groups of one, three or five things, books standing or laid
 * flat with a vase, a small plant or a box, and about one shelf in three
 * left bare. A piece shown alone (Detail's "Show alone") stands as the
 * product it is, its shelves bare.
 */
function Shelves({ runs, seed }: { runs: readonly Run[]; seed: number }) {
  const alone = useStudio((s) => s.focusId !== null);
  // read again only when the runs change, not on every draw of the piece
  const key = JSON.stringify(runs);
  const dressed = useMemo(
    () => dressShelves(JSON.parse(key) as Run[], seed),
    [key, seed],
  );
  if (alone) return null;
  return dressed.map((d, i) => (
    <group key={i}>
      {d.books.map((b, k) => (
        <Books key={k} {...b} />
      ))}
      {d.objects.length > 0 && <ShelfObjects objects={d.objects} />}
    </group>
  ));
}

/** a shelf's objects as one mesh (shelf-objects.ts), standing in the
    piece's bake as each one's box, so the shelf darkens round them */
function ShelfObjects({ objects }: { objects: readonly ShelfObject[] }) {
  const geometry = useMemo(() => {
    const g = shelfObjectsGeometry(objects);
    return g && withBakeDefaults(g);
  }, [objects]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  const mesh = useRef<Mesh>(null);
  useBakeMembers(() => {
    if (!mesh.current || !geometry) return [];
    const m = mesh.current;
    return objects.map((o) => ({
      kind: "solid" as const,
      mesh: m,
      box: {
        c: [o.x, o.y + o.h / 2, o.z] as [number, number, number],
        h: [o.w * 0.4, o.h * 0.45, o.d * 0.4] as [number, number, number],
      },
      shared: false,
      points: false,
    }));
  }, [geometry]);
  if (!geometry) return null;
  return (
    <mesh ref={mesh} geometry={geometry} castShadow receiveShadow>
      <primitive object={paintedMaterial()} attach="material" dispose={null} />
    </mesh>
  );
}

/** the painted things' one material (shelf-objects.ts): each vertex's
    own colour and roughness, the piece's baked light on them, and a
    leaf's thin edges lit through, as light comes through a leaf seen
    edge on */
let painted: MeshStandardNodeMaterial | null = null;
const LEAF_GLOW = 0.18;
const paintedMaterial = () => {
  if (painted) return painted;
  painted = new MeshStandardNodeMaterial({ vertexColors: true });
  painted.roughnessNode = attribute("rough", "float");
  painted.aoNode = bakedOcclusion;
  const edgeOn = float(1).sub(normalView.dot(positionViewDirection).abs());
  painted.emissiveNode = attribute("color", "vec3")
    .mul(attribute("leaf", "float"))
    .mul(edgeOn.mul(edgeOn))
    .mul(LEAF_GLOW);
  return painted;
};

/** cloth and paper bindings, matt */
const BOOK_ROUGH = 0.8;

/** a shelf's run of books as one mesh (books.ts lays them out as a
    stylist leaves them, their spines, covers and page edges cut from one
    painted picture, book-spines.ts), so a run costs one draw and not two
    a book (a bookwall's books were a third of a furnished flat's draws) */
function Books(run: Run) {
  const key = JSON.stringify(run);
  const geometry = useMemo(() => {
    const g = booksGeometry(bookLayout(JSON.parse(key) as Run));
    return g && withBakeDefaults(g);
  }, [key]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  // to the piece's bake, the books as one block, a little inside their
  // run (their heights differ), their vertices taking its light
  const mesh = useRef<Mesh>(null);
  useBakeMembers(() => {
    if (!mesh.current || !geometry) return [];
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    const c = b.getCenter(new Vector3());
    const h = b.getSize(new Vector3()).multiplyScalar(0.5);
    return [
      {
        kind: "solid",
        mesh: mesh.current,
        box: {
          c: [c.x, c.y - h.y * 0.1, c.z],
          h: [h.x, h.y * 0.85, h.z * 0.9],
        },
        shared: false,
      },
    ];
  }, [geometry]);
  if (!geometry) return null;
  return (
    <mesh ref={mesh} geometry={geometry} castShadow receiveShadow>
      <primitive object={booksMaterial()} attach="material" dispose={null} />
    </mesh>
  );
}

/** the books' one material: the spines' picture, matt, the shelf's
    baked light on them (their vertices', lightmap-nodes.ts) */
let books: MeshStandardNodeMaterial | null = null;
const booksMaterial = () => {
  if (books) return books;
  books = new MeshStandardNodeMaterial({
    map: spineAtlas(),
    roughness: BOOK_ROUGH,
  });
  books.aoNode = bakedOcclusion;
  return books;
};

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

/** an upholstered seat, as an upholsterer builds a box sofa: a base on
    wooden legs, two arms and a back frame, all with soft rounded edges,
    and on them seat and back cushions apart from each other, crowned,
    welted along their seams, each sat on a little differently (seeded
    by the piece) */
const SEAT = {
  /** between two cushions, m: at 8 mm the seam closed to nothing past a
      couple of metres and the seat read as one block */
  gap: 0.014,
  /** the cushions' rounds and crowns, m: at 18 and 24 mm of crown a
      cushion read as a rounded brick (round 9); a filled cushion stands
      full in its middle and pinched at its corners */
  seatRound: 0.035,
  seatCrown: 0.03,
  backRound: 0.05,
  backCrown: 0.045,
  /** the frame's rounds: the base, the arms and the back, as upholstery
      is padded over its frame (at 25 and 40 mm the frame read as a box);
      the arm's top rolled fuller */
  base: 0.04,
  arm: 0.07,
  /** the seat cushions' thickness, and how far the arms stand over
      the seat, m (round 9) */
  cushion: 0.17,
  armOver: 0.16,
  /** how full the frame's faces stand, m (round 9): a frame drawn as
      flat-faced rounded boxes read as moulded blocks however soft its
      edges; padding over a frame is never flat */
  pad: 0.014,
  /** the deck under the seat cushions and the frame behind the backs,
      seen through the seams: a shade darker, as a seam is in shadow (a
      seam lit as the cushions' tops are read as a gap between blocks) */
  deckShade: -0.3,
  /** the frame a shade under the cushions, the cushions a shade over
      the colour: one cloth all through read as one moulded block */
  frameShade: -0.05,
  cushionShade: 0.05,
};
function Seat({
  w,
  h,
  d,
  colour,
  seats,
  wear,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  colour: string;
  seats: number;
  /** how its cushions have been sat on: the piece's own seed */
  wear: number;
  /** the lived-in touches' seed, or null for none */
  seed: number | null;
}) {
  const arm = Math.min(0.18, w * 0.12);
  const back = 0.2;
  const seatTop = Math.min(0.44, h * 0.55);
  // the seat cushions are the thick part, on a low base between the
  // arms (round 9): a 22 cm base under 14 cm cushions read as a plinth
  const baseH = seatTop - LEG - SEAT.cushion;
  // the arms' top, each arm one padded piece from the base's foot to it
  const armTop = seatTop + SEAT.armOver;
  const inner = w - 2 * arm;
  const cw = inner / seats;
  const body = cloth(shade(colour, SEAT.frameShade));
  const cushion = cloth(shade(colour, SEAT.cushionShade));
  const deck = cloth(shade(colour, SEAT.deckShade));
  const backH = h - seatTop - 0.04;
  // the listed cushions, when there are any (index.json's kind "cushion")
  const pillows = useProps((s) => s.models?.find((m) => m.kind === "cushion"));
  return (
    <group>
      <Built
        parts={[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz): Part => ({
            f: wood(DARK_WOOD, false),
            at: [sx * (w / 2 - 0.08), LEG / 2, sz * (d / 2 - 0.08)],
            rod: [0.016, LEG, 0.02],
          })),
        )}
      />
      <Cushion
        f={body}
        at={[0, LEG + baseH / 2, 0]}
        shape={{
          dims: [inner + 0.02, baseH, d - 0.01],
          radius: SEAT.base,
          crown: SEAT.pad,
          facing: "all",
          seed: null,
        }}
      />
      {[-1, 1].map((s) => (
        <Cushion
          key={s}
          f={body}
          at={[(s * (w - arm)) / 2, LEG + (armTop - LEG) / 2, 0]}
          shape={{
            dims: [arm, armTop - LEG, d],
            radius: SEAT.arm,
            crown: SEAT.pad,
            facing: "all",
            seed: null,
          }}
        />
      ))}
      <Cushion
        f={body}
        at={[0, LEG + baseH + (h - LEG - baseH) / 2, -d / 2 + back / 2]}
        shape={{
          dims: [inner, h - LEG - baseH, back],
          radius: SEAT.arm,
          crown: SEAT.pad,
          facing: "all",
          seed: null,
        }}
      />
      {/* the deck under the seat cushions and the frame's face behind
          the backs, in the seams' shadow */}
      <Built
        parts={[
          {
            f: deck,
            at: [0, LEG + baseH + 0.004, back / 2],
            dims: [inner - 0.01, 0.008, d - back - 0.04],
          },
          {
            f: deck,
            at: [0, seatTop + backH / 2, -d / 2 + back + 0.004],
            dims: [inner - 0.01, backH, 0.008],
          },
        ]}
      />
      {Array.from({ length: seats }, (_, i) => {
        const x = -inner / 2 + cw * (i + 0.5);
        return (
          <group key={i}>
            <Cushion
              f={cushion}
              at={[x, LEG + baseH + SEAT.cushion / 2, back / 2 + 0.01]}
              shape={{
                // its front a hair proud of the base, as a cushion sits
                dims: [cw - SEAT.gap, SEAT.cushion, d - back],
                radius: SEAT.seatRound,
                crown: SEAT.seatCrown,
                facing: "up",
                seed: wear * 7 + i,
              }}
            />
            <Cushion
              f={cushion}
              at={[x, seatTop + backH / 2 + 0.01, -d / 2 + back + 0.08]}
              shape={{
                dims: [cw - SEAT.gap * 1.5, backH, 0.16],
                radius: SEAT.backRound,
                crown: SEAT.backCrown,
                facing: "front",
                seed: null,
              }}
              rotation={[-0.1, 0, 0]}
            />
          </group>
        );
      })}
      {seed !== null && (
        <SeatTouches
          w={w}
          d={d}
          seatTop={seatTop}
          armTop={armTop}
          armRound={SEAT.arm}
          arm={arm}
          back={back + PILLOWS.cushion}
          seats={seats}
          seed={seed}
          cushions={
            pillows && seats > 1 ? (
              <Pillows
                file={pillows.file}
                size={pillows.size}
                room={inner * PILLOWS.share}
                at={[
                  (seed % 2 ? 1 : -1) *
                    (inner / 2 - (inner * PILLOWS.share) / 2),
                  seatTop + PILLOWS.up - 0.14,
                  -d / 2 + back + PILLOWS.cushion + PILLOWS.off,
                ]}
              />
            ) : null
          }
        />
      )}
    </group>
  );
}

/** the throw pillows on a sofa's seat, m: the share of the seat's width
    they take at most, how high over the base they sit, the back
    cushions' depth they lean on and a hair off them, and the deepest
    they may stand */
const PILLOWS = {
  share: 0.45,
  up: 0.14,
  cushion: 0.16,
  off: 0.04,
  deepest: 0.45,
};
/** the listed cushions (a set of throw pillows, a real model) on a
    sofa's seat at one end, against its back cushions: in their own
    proportions, as wide as `room` at most; the built cushions stand in
    while they load */
function Pillows({
  file,
  size: [mw, mh, md],
  room,
  at,
}: {
  file: string;
  size: [number, number, number];
  room: number;
  at: Vector3Tuple;
}) {
  const k = Math.min(1, room / mw, PILLOWS.deepest / md);
  return (
    <group position={[at[0], at[1], at[2] + (md * k) / 2]}>
      <Suspense fallback={null}>
        <Model
          src={propUrl(file)}
          size={[mw * k, mh * k, md * k]}
          cloth={null}
          fit={{ file, turned: false }}
        />
      </Suspense>
    </group>
  );
}

/** a coffee table's stone top, honed and sealed (a little coat), and
    its frame in blackened steel: the room's tables are not all the
    floor's oak (round 8, 1h). A warm travertine, matt, its edge eased
    enough to catch the light: a cool grey at 0.42 with a 5 mm round read
    as a plastic slab from above */
const STONE_TOP = "#d6ccbd";
const STONE_ROUGH = 0.55;
const STONE_EDGE = 0.012;
const BLACK_STEEL = "#2b2a28";
function Table({
  w,
  h,
  d,
  stone,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  /** a stone top on a steel frame (the coffee table) */
  stone: boolean;
  /** the piece's seed: its own wood's tone */
  seed: number;
}) {
  if (stone) {
    const top = 0.03;
    const steel = metal(BLACK_STEEL, 0.45);
    const inset = 0.05;
    const rail = 0.03;
    return (
      <group>
        <Soft
          f={{ colour: STONE_TOP, rough: STONE_ROUGH, coat: 0.08 }}
          at={[0, h - top / 2, 0]}
          dims={[w, top, d]}
          radius={STONE_EDGE}
        />
        <Built
          parts={[
            ...[-1, 1].flatMap((sx) =>
              [-1, 1].map((sz): Part => ({
                f: steel,
                at: [sx * (w / 2 - inset), (h - top) / 2, sz * (d / 2 - inset)],
                rod: [0.011, h - top],
              })),
            ),
            // the frame's rails under the top, a hair in from the legs
            ...[-1, 1].map((sz): Part => ({
              f: steel,
              at: [0, h - top - rail / 2, sz * (d / 2 - inset)],
              dims: [w - 2 * inset, rail, 0.016],
            })),
            ...[-1, 1].map((sx): Part => ({
              f: steel,
              at: [sx * (w / 2 - inset), h - top - rail / 2, 0],
              dims: [0.016, rail, d - 2 * inset - 0.016],
            })),
          ]}
        />
      </group>
    );
  }
  const top = 0.035;
  const oak = variedWood(LIGHT_WOOD, seed);
  const f = wood(oak);
  const inset = 0.07;
  return (
    <group>
      <Soft f={f} at={[0, h - top / 2, 0]} dims={[w, top, d]} radius={0.008} />
      <Built
        parts={[
          {
            f: wood(oak, false),
            at: [0, h - top - 0.035, 0],
            dims: [w - 0.14, 0.07, d - 0.14],
          },
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz): Part => ({
              f: wood(shade(oak, -0.08), false),
              at: [sx * (w / 2 - inset), (h - top) / 2, sz * (d / 2 - inset)],
              rod: [0.016, h - top, 0.026],
            })),
          ),
        ]}
      />
    </group>
  );
}

/** a lamp's light: a warm bulb (about 2700 K) inside the shade, off by
    day and lit in the evening, where it makes the pool of light an
    evening photo is made of; intensity in candela, reach in m. The
    floor lamp's casts a shadow on the desktop tier, its shade and stem
    shaping the pool (drawn again only on a change, ShadowsOnChange) */
const LAMP_LIGHT = {
  colour: LAMP_BULB,
  floor: { evening: 14, reach: 5 },
  desk: { evening: 4, reach: 2.5 },
  /** how much of the bulb's candela comes through the shade as its own
      glow (a linen shade passes a fraction and glows with it, brighter
      than the wall behind it), and the shade's weave: a tile, m, and
      the seam's and the rims' sizes, m */
  shade: { glow: 0.6, weave: 0.12, seam: 0.012, rim: 0.0032 },
  /** the floor lamp's shadow (the pieces' round it): a small map, soft
      at its edge, its bias, and how near the bulb it starts, m */
  shadow: { map: 256, radius: 6, bias: -0.002, near: 0.05 },
} as const;

/** how long a lamp's light is kept once the lamp is gone, ms: the
    shaders that drew with it built again by then */
const LIGHT_LET_GO_MS = 2000;
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
  const lit = useStudio((s) => s.scene.light === "evening");
  // a lamp casts its shadow on WebGL's desktop tier only. On WebGPU
  // three (0.186.1, pinned) renews a point light's six-sided shadow map
  // while shaders built earlier still bind the old one, and WebGPU
  // refuses the frame whole ("destroyed texture [PointShadowDepthTexture]
  // used in a submit"): a black frame, reported twice. The lamp still
  // lights the room there; the pieces' baked footprints ground them.
  // Once on, the shadow stays on while the lamp stands: turned off (the
  // tier lowered under a slow frame) its map went at once, the same
  // refusal; on a lower tier its map is only not drawn again
  // (ShadowsOnChange reads `still`)
  const want =
    useStudio((s) => s.tier === "desktop" && s.backend === "webgl") && !desk;
  const [shadowed, setShadowed] = useState(want);
  if (want && !shadowed) setShadowed(true);
  // and the light let go a moment after the lamp leaves the scene, not
  // on the frame it goes, for the same reason
  const light = useRef<PointLight>(null);
  useEffect(() => {
    const l = light.current;
    return () => {
      if (l) setTimeout(() => l.dispose(), LIGHT_LET_GO_MS);
    };
  }, []);
  const bulb = desk ? LAMP_LIGHT.desk : LAMP_LIGHT.floor;
  // the shade's linen: the cloth set's weave round the cone, the light
  // through it showing the weave
  const linen = useMaterial("cloth").surface.map;
  const round = 2 * Math.PI * r * 0.81;
  const weave = useMemo(() => {
    const t = linen.clone();
    t.repeat.set(
      round / LAMP_LIGHT.shade.weave,
      shadeH / LAMP_LIGHT.shade.weave,
    );
    t.needsUpdate = true;
    return t;
  }, [linen, round, shadeH]);
  useEffect(() => () => weave.dispose(), [weave]);
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
      {/* the shade is fabric: its bulb's light comes through it, so it
          casts no shadow of its own (an opaque one cut the light to a
          hard disc on the floor, a stage's spotlight) */}
      <mesh position={[0, h - shadeH / 2, 0]}>
        <cylinderGeometry args={[r * 0.62, r, shadeH, 48, 1, true]} />
        <meshStandardMaterial
          color={SHADE_HEX}
          map={weave}
          emissive={LAMP_GLOW}
          emissiveMap={weave}
          emissiveIntensity={lit ? bulb.evening * LAMP_LIGHT.shade.glow : 0}
          roughness={0.9}
          side={DoubleSide}
        />
      </mesh>
      {/* the seam down the back, where the linen is joined: a sliver of
          the cone a shade proud, darker as the doubled cloth is */}
      <mesh position={[0, h - shadeH / 2, 0]}>
        <cylinderGeometry
          args={[
            r * 0.62 + 0.0008,
            r + 0.0008,
            shadeH,
            1,
            1,
            true,
            Math.PI - LAMP_LIGHT.shade.seam / 2 / r,
            LAMP_LIGHT.shade.seam / r,
          ]}
        />
        <meshStandardMaterial
          color={shade(SHADE_HEX, -0.12)}
          emissive={LAMP_GLOW}
          emissiveIntensity={
            lit ? bulb.evening * LAMP_LIGHT.shade.glow * 0.5 : 0
          }
          roughness={0.9}
          side={DoubleSide}
        />
      </mesh>
      {/* the rolled rims at the top and the foot */}
      {(
        [
          [h - LAMP_LIGHT.shade.rim, r * 0.62],
          [h - shadeH + LAMP_LIGHT.shade.rim, r],
        ] as const
      ).map(([y, rr]) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[rr, LAMP_LIGHT.shade.rim, 8, 48]} />
          <meshStandardMaterial color={SHADE_HEX} roughness={0.85} />
        </mesh>
      ))}
      {/* always there, at nothing by day: a light come and gone would
          build every shader in the room again */}
      <pointLight
        ref={light}
        dispose={null}
        userData={{ still: !want }}
        position={[0, h - shadeH * 0.6, 0]}
        color={LAMP_LIGHT.colour}
        intensity={lit ? bulb.evening : 0}
        distance={bulb.reach}
        castShadow={shadowed}
        shadow-mapSize={[LAMP_LIGHT.shadow.map, LAMP_LIGHT.shadow.map]}
        shadow-radius={LAMP_LIGHT.shadow.radius}
        shadow-bias={LAMP_LIGHT.shadow.bias}
        shadow-camera-near={LAMP_LIGHT.shadow.near}
      />
    </group>
  );
}

export function Plant({
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
  const foliage = useMemo(
    () => plantLeaves(r, potH, h, FOLIAGE_HEX, seed),
    [r, potH, h, seed],
  );
  useEffect(() => () => foliage.dispose(), [foliage]);
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
      {/* the leaves, one solid painted as the shelves' things are
          (shelf-objects.ts), their undersides darker, their edges lit
          through */}
      <mesh geometry={foliage} material={paintedMaterial()} castShadow />
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
  const geometry = rugGeometry(w, d, seedOf(`${w},${d},${colour}`));
  const contact = useMemo(() => rugContactGeometry(w, d), [w, d]);
  useEffect(() => () => contact.dispose(), [contact]);
  const mesh = useRef<Mesh>(null);
  useBakeMembers(
    () =>
      mesh.current
        ? [
            {
              kind: "solid",
              mesh: mesh.current,
              box: { c: [0, RUG_H / 2, 0], h: [w / 2, RUG_H / 2, d / 2] },
              shared: true,
            },
          ]
        : [],
    [geometry],
  );
  return (
    <group>
      <mesh ref={mesh} geometry={geometry} receiveShadow>
        <Mat f={cloth(rugColour(colour))} banded />
      </mesh>
      <mesh
        geometry={contact}
        material={CONTACT}
        renderOrder={1}
        raycast={unpickable}
      />
    </group>
  );
}

/* ---------- the kitchen's and the bathroom's fittings ---------- */

const WORKTOP = 0.04; // m, a stone worktop
const COUNTER_H = 0.9; // m, a kitchen counter's height
const CABINET_FROM = 1.5; // m, the wall cabinets' underside
const STONE = "#d9d4cb";
/** a kitchen's fittings, m: the hob's zones (across and in as a share
    of the hob, and their radius), the tap's spout, the hood under the
    wall cabinets */
const KITCHEN = {
  zones: [
    [-0.25, -0.2, 0.09],
    [0.25, -0.2, 0.07],
    [-0.25, 0.22, 0.07],
    [0.25, 0.22, 0.09],
  ] as const,
  spout: 0.18,
  hood: { wide: 0.6, tall: 0.04 },
};

/** a dish rack by the sink, m: how far along from the sink's middle,
    its tray's width and depth, and its plates' radius */
const DISH_RACK = { off: 0.48, wide: 0.36, deep: 0.28, plate: 0.11 };

/** the things that stand on a kitchen's worktop: a kettle beside the
    hob, a chopping board leaning on the splashback, three jars in a
    row; each where there is room for it and nowhere else */
const worktopThings = (
  w: number,
  d: number,
  hobX: number,
  sinkX: number,
): Part[] => {
  const top = COUNTER_H;
  const back = -d / 2;
  const free = (x: number, half: number) =>
    Math.abs(x) + half < w / 2 - 0.05 &&
    Math.abs(x - hobX) > 0.32 + half &&
    Math.abs(x - sinkX) > 0.3 + half;
  const out: Part[] = [];
  const kettle = hobX + 0.48;
  if (free(kettle, 0.09))
    out.push(
      {
        f: { colour: "#eceae5", rough: 0.25, coat: 0.4 },
        at: [kettle, top + 0.012, back + 0.2],
        rod: [0.075, 0.024],
      },
      {
        f: { colour: "#f2f0eb", rough: 0.3, coat: 0.3 },
        at: [kettle, top + 0.024 + 0.1, back + 0.2],
        rod: [0.072, 0.2, 0.06],
      },
      {
        f: { colour: "#3c3a37", rough: 0.5 },
        at: [kettle - 0.08, top + 0.15, back + 0.2],
        dims: [0.02, 0.14, 0.024],
      },
    );
  const board = sinkX - 0.42;
  if (free(board, 0.2))
    out.push({
      f: { colour: "#b98f5e", rough: 0.6 },
      at: [board, top + 0.15, back + 0.03],
      dims: [0.38, 0.28, 0.018],
      rotation: [-0.12, 0, 0],
    });
  // the dish rack on the sink's drainer side, away from the board: a
  // tray, its wire rails, three plates on edge and a cup
  const rack = sinkX + DISH_RACK.off;
  if (free(rack, DISH_RACK.wide / 2)) {
    const z = back + 0.2;
    const wire = metal(CHROME, 0.3);
    const plate: Finish = { colour: CERAMICS[0], rough: 0.3, coat: 0.3 };
    out.push(
      {
        f: { colour: "#d9d8d4", rough: 0.45 },
        at: [rack, top + 0.006, z],
        dims: [DISH_RACK.wide, 0.012, DISH_RACK.deep],
      },
      ...[-1, 1].map((s): Part => ({
        f: wire,
        at: [rack, top + 0.07, z + (s * DISH_RACK.deep) / 2.4],
        rod: [0.0025, DISH_RACK.wide],
        rotation: [0, 0, Math.PI / 2],
      })),
      ...[-0.1, -0.04, 0.02].map((dx, i): Part => ({
        f: plate,
        at: [rack + dx, top + 0.012 + DISH_RACK.plate, z],
        rod: [DISH_RACK.plate, 0.012],
        rotation: [Math.PI / 2, 0, (i - 1) * 0.08],
      })),
      {
        f: plate,
        at: [rack + 0.12, top + 0.052, z],
        rod: [0.036, 0.08],
      },
    );
  }
  const jars = (hobX + sinkX) / 2;
  if (free(jars, 0.16))
    [-0.1, 0, 0.1].forEach((dx, i) =>
      out.push({
        f: {
          colour: ["#d9cfbf", "#cfd6d2", "#e6dccb"][i]!,
          rough: 0.35,
          coat: 0.3,
        },
        at: [jars + dx, top + 0.07 + i * 0.01, back + 0.08],
        rod: [0.042, 0.14 + i * 0.02],
      }),
    );
  return out;
};
const STEEL = "#b8b6b2";
const WHITE_GOODS = "#e9e7e2";
const PORCELAIN = "#f4f2ee";
const GLASS_HEX = "#dfe9ea";

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
          // the induction hob's four zones, printed rings on its glass
          ...KITCHEN.zones.map(([dx, dz, r]): Part => ({
            f: { colour: "#3b3a39", rough: 0.3 },
            at: [
              hobX + dx * Math.min(0.58, w * 0.22),
              COUNTER_H + 0.0085,
              -0.02 + dz * Math.min(0.5, d * 0.8),
            ],
            rod: [r, 0.001],
          })),
          // the sink's bowl, its floor a shade darker inside the rim
          {
            f: metal("#8f8d89", 0.35),
            at: [sinkX, COUNTER_H + 0.0045, -0.02],
            dims: [
              Math.min(0.5, w * 0.2) - 0.04,
              0.002,
              Math.min(0.4, d * 0.65) - 0.04,
            ],
          },
          // the tap's spout, over the bowl
          {
            f: steel,
            at: [sinkX, COUNTER_H + 0.27, -d / 2 + 0.08 + KITCHEN.spout / 2],
            rod: [0.008, KITCHEN.spout],
            rotation: [Math.PI / 2, 0, 0],
          },
          // the slim hood under the wall cabinets, over the hob
          {
            f: steel,
            at: [
              hobX,
              CABINET_FROM - KITCHEN.hood.tall / 2,
              -d / 2 + (upperD + 0.03) / 2,
            ],
            dims: [KITCHEN.hood.wide, KITCHEN.hood.tall, upperD + 0.03],
          },
          {
            f: { colour: "#2a2928", rough: 0.6 },
            at: [
              hobX,
              CABINET_FROM - KITCHEN.hood.tall - 0.001,
              -d / 2 + (upperD + 0.03) / 2 - 0.02,
            ],
            dims: [KITCHEN.hood.wide - 0.06, 0.002, upperD - 0.06],
          },
          // what stands on the worktop: a kettle by the hob, a board
          // leaning on the splashback, three jars in a row
          ...worktopThings(w, d, hobX, sinkX),
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
      {/* the worktop stands 20 mm past the doors, as a stone one is
          cut, its back against the wall */}
      <Soft
        f={{ colour: STONE, rough: 0.35, coat: 0.2 }}
        at={[0, COUNTER_H - WORKTOP / 2, 0.01]}
        dims={[w + 0.02, WORKTOP, d + 0.02]}
        radius={0.004}
      />
      <Splashback w={w} h={CABINET_FROM - COUNTER_H} z={-d / 2 + 0.003} />
    </group>
  );
}

/** the tiled splashback between the worktop and the wall cabinets:
    300 × 600 mm wall tiles in recessed grout (tile-maps.ts), their
    repeat set to the counter's own width so a tile is its true size */
function Splashback({ w, h, z }: { w: number; h: number; z: number }) {
  const maps = useMemo(() => {
    const m = tileMaps(WALL_TILE);
    const own = {
      map: m.map.clone(),
      normalMap: m.normalMap.clone(),
      roughnessMap: m.roughnessMap.clone(),
    };
    for (const t of Object.values(own))
      t.repeat.set(w / m.size[0], h / m.size[1]);
    return own;
  }, [w, h]);
  useEffect(
    () => () => {
      for (const t of Object.values(maps)) t.dispose();
    },
    [maps],
  );
  return (
    <mesh
      position={[0, COUNTER_H + h / 2, z]}
      receiveShadow
      raycast={unpickable}
    >
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial {...maps} roughness={1} />
    </mesh>
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
      {/* no mirror of its own: the bathroom's mirror cabinet is a wall
          item over it (wall-items.ts), and the two stood one over the
          other, a pane behind a pane */}
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
        <primitive
          object={slabGeometry([
            Math.max(w, 0.008),
            h,
            Math.max(d, 0.008),
          ] as Vector3Tuple)}
          attach="geometry"
          dispose={null}
        />
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

/** a chair's back board, m thick */
const CHAIR_BACK = 0.025;
/** a dining chair: a wooden seat with a pad set in on it, four legs,
    and an open back of two posts and a rail. The seat was once the pad
    alone, the full size of the chair, under a solid board back: from
    above, the flat's views, a grey square */
const CHAIR_SEAT = 0.03;
const CHAIR_RAIL = 0.13;
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
  const legH = seatH - CHAIR_SEAT;
  const backZ = -d / 2 + 0.03;
  const postH = h - seatH;
  return (
    <group>
      {/* the pad, inset from the seat's edge and a little forward of
          the back */}
      <Soft
        f={cloth(colour)}
        at={[0, seatH + 0.012, 0.015]}
        dims={[w - 0.06, 0.024, d - 0.09]}
        radius={0.01}
      />
      <Built
        parts={[
          { f, at: [0, seatH - CHAIR_SEAT / 2, 0], dims: [w, CHAIR_SEAT, d] },
          ...[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz): Part => ({
              f,
              at: [sx * (w / 2 - 0.03), legH / 2, sz * (d / 2 - 0.03)],
              rod: [0.014, legH],
            })),
          ),
          // the back's posts carry the back legs up, the rail between
          // them at the top
          ...[-1, 1].map((sx): Part => ({
            f,
            at: [sx * (w / 2 - 0.03), seatH + postH / 2, backZ],
            rod: [0.013, postH],
          })),
          {
            f,
            at: [0, h - CHAIR_RAIL / 2 - 0.01, backZ],
            dims: [w - 0.04, CHAIR_RAIL, CHAIR_BACK],
          },
        ]}
      />
    </group>
  );
}

/** a duvet, m: how far it falls down the mattress's sides, the
    mattress's edge's round, its thickness, its puff and how far in from
    its ends the puff falls away, and its folds */
const DUVET = {
  fall: 0.2,
  round: 0.04,
  thick: 0.035,
  puff: 0.03,
  ends: 0.12,
  folds: 5,
  depth: 0.012,
};
function Bed({
  w,
  h,
  d,
  colour,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  colour: string;
  /** the lived-in touches' seed, or null for none */
  seed: number | null;
}) {
  const base = Math.min(0.26, h * 0.55);
  const mattress = Math.min(0.22, h - base);
  const linen = cloth(shade(colour, 0.06));
  const pw = (w - 0.2) / 2;
  // the duvet over the mattress, down its sides, from below the
  // pillows to near the foot
  const duvet: Drape = {
    ...DUVET,
    over: w - 0.04,
    wide: d * 0.62,
    hang: [Math.min(DUVET.fall, mattress), Math.min(DUVET.fall, mattress)],
    seed: seed ?? 0,
  };
  return (
    <group>
      {/* the frame in the light wood the room's tables and the bunk
          are, on a darker recessed plinth, as the Furnishes pieces
          stand on their base */}
      <Slab
        f={{ colour: shade(LIGHT_WOOD, -0.3), rough: 0.8 }}
        at={[0, 0.03, 0]}
        dims={[w - 0.1, 0.06, d - 0.1]}
      />
      <Slab
        f={wood(LIGHT_WOOD)}
        at={[0, 0.06 + (base - 0.06) / 2, 0]}
        dims={[w, base - 0.06, d]}
      />
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
      <Draped
        f={cloth(shade(colour, -0.04))}
        at={[0, base + mattress, d * 0.17]}
        shape={duvet}
      />
      {seed !== null && (
        <BedTouches
          duvet={duvet}
          top={base + mattress}
          at={d / 2 - 0.4}
          seed={seed}
        />
      )}
    </group>
  );
}

/** a washing machine: a white box, its drum's round door in front and
    the controls along the top */
function Washer({ w, h, d }: { w: number; h: number; d: number }) {
  const f: Finish = { colour: WHITE_GOODS, rough: 0.3, coat: 0.3 };
  const r = Math.min(w, h) * 0.3;
  return (
    <group>
      <Soft f={f} at={[0, h / 2, 0]} dims={[w, h, d]} radius={0.015} />
      <Slab
        f={{ colour: shade(WHITE_GOODS, -0.12), rough: 0.4 }}
        at={[0, h - 0.06, d / 2 + 0.002]}
        dims={[w - 0.04, 0.08, 0.004]}
      />
      <Rod
        f={metal(STEEL, 0.25)}
        at={[0, h * 0.45, d / 2]}
        r={r}
        h={0.03}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <Rod
        f={{ colour: "#2c3134", rough: 0.1, coat: 0.8 }}
        at={[0, h * 0.45, d / 2 + 0.01]}
        r={r * 0.78}
        h={0.025}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

/** a bunk bed: two beds one over the other in a frame of posts, a
    guard rail round the upper one and a ladder at its foot on the
    open side */
function BunkBed({
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
  const f = wood(LIGHT_WOOD);
  const post = 0.06;
  const deck = 0.03;
  const low = 0.22;
  const high = Math.max(low + 0.7, h - 0.42);
  const mattress = 0.16;
  const rail = 0.3;
  const ladder = 0.42;
  const x = w / 2 - post / 2;
  const z = d / 2 - post / 2;
  const parts: Part[] = [
    // the four posts
    ...[-1, 1].flatMap((sx) =>
      [-1, 1].map((sz): Part => ({
        f,
        at: [sx * x, h / 2, sz * z],
        dims: [post, h, post],
      })),
    ),
    // the two decks, each on its side rails
    ...[low, high].flatMap((y): Part[] => [
      { f, at: [0, y, 0], dims: [w - 2 * post, deck, d - 2 * post] },
      ...[-1, 1].map((s): Part => ({
        f,
        at: [s * x, y - 0.06, 0],
        dims: [post * 0.5, 0.14, d - 2 * post],
      })),
    ]),
    // head and foot boards up to the upper rail
    ...[-1, 1].map((s): Part => ({
      f,
      at: [0, high + rail / 2, s * z],
      dims: [w - 2 * post, rail, 0.02],
    })),
    // the guard rail: full length against the wall, short of the
    // ladder on the open side
    { f, at: [-x, high + rail - 0.02, 0], dims: [0.03, 0.04, d - 2 * post] },
    {
      f,
      at: [x, high + rail - 0.02, -ladder / 2],
      dims: [0.03, 0.04, d - 2 * post - ladder],
    },
    // the ladder's two stiles and its rungs, at the foot
    ...[0, ladder].map((dz): Part => ({
      f,
      at: [x + 0.03, (high + rail) / 2, z - post / 2 - dz],
      dims: [0.03, high + rail, 0.04],
    })),
    ...[1, 2, 3, 4].map((i): Part => ({
      f,
      at: [x + 0.03, ((high + rail) * i) / 5, z - post / 2 - ladder / 2],
      dims: [0.025, 0.025, ladder],
    })),
  ];
  const linen = cloth(shade(colour, 0.06));
  return (
    <group>
      <Built parts={parts} />
      {[low, high].map((y) => (
        <group key={y}>
          <Soft
            f={linen}
            at={[0, y + deck / 2 + mattress / 2, 0]}
            dims={[w - 2 * post - 0.02, mattress, d - 2 * post - 0.02]}
            radius={0.04}
          />
          <Soft
            f={cloth("#f1ebe2")}
            at={[0, y + deck / 2 + mattress + 0.05, -d / 2 + 0.3]}
            dims={[w * 0.6, 0.1, 0.4]}
            radius={0.05}
          />
        </group>
      ))}
    </group>
  );
}

/** the television: its body's satin metal, its screen's black glass;
    the rim of body round the screen, the body's and the glass's depth,
    and the least its body stands over its foot's base (tvLift sets it
    for the eye), m */
const TV_BEZEL = "#3a3b3f";
const TV_GLASS = "#0d0e10";
const TV = { rim: 0.009, depth: 0.03, glass: 0.002, lift: 0.08 };

/** a low media console: a carcass of two doors on a plinth, and the
    television standing on it, set back on its foot */
function MediaConsole({
  w,
  h,
  d,
  f,
}: {
  w: number;
  h: number;
  d: number;
  f: Finish;
}) {
  const tvW = Math.min(1.45, w * 0.8);
  const tvH = tvW * 0.57;
  // the stand tall enough that the screen's middle is at a seated eye
  // (design-rules.ts), m
  const lift = tvLift(h * 1000, tvH * 1000, TV.lift * 1000) / 1000;
  // a carcass of three bays on a set-back plinth: two doors set in
  // with a reveal round them, the middle bay open for the boxes; its
  // back stands in from the back edge, as a cabinet maker fits it
  const inner = h - PLINTH - 2 * PANEL;
  const innerW = w - 2 * PANEL;
  const bayW = (innerW - 2 * PANEL) / 3;
  const midY = PLINTH + PANEL + inner / 2;
  const dark = wood(DARK_WOOD, false);
  const xs = [-1, 0, 1].map((k) => k * (bayW + PANEL));
  const parts: Part[] = [
    plinthOf(w, d, dark),
    { f, at: [0, h - PANEL / 2, 0], dims: [w, PANEL, d] },
    ...[-1, 1].map((s): Part => ({
      f,
      at: [(s * (w - PANEL)) / 2, PLINTH + (h - PLINTH - PANEL) / 2, 0],
      dims: [PANEL, h - PLINTH - PANEL, d],
    })),
    { f, at: [0, PLINTH + PANEL / 2, 0], dims: [innerW, PANEL, d] },
    backOf(innerW, inner, midY, d, f),
    ...[-1, 1].map((s): Part => ({
      f,
      at: [(s * (bayW + PANEL)) / 2, midY, -BACK_IN / 2],
      dims: [PANEL, inner, d - BACK_IN - PANEL],
    })),
    // the open bay's shelf, and a box on it
    {
      f,
      at: [0, midY, -BACK_IN / 2],
      dims: [bayW, PANEL, d - BACK_IN - PANEL],
    },
    {
      f: { colour: RUBBER, rough: 0.6 },
      at: [0, midY + PANEL / 2 + 0.025, -0.02],
      dims: [Math.min(0.3, bayW * 0.8), 0.05, Math.min(0.22, d * 0.6)],
    },
    // the two doors, set in a reveal and a hair proud, each with its pull
    ...[xs[0]!, xs[2]!].flatMap((x, i): Part[] => [
      {
        f,
        at: [x, midY, d / 2 - PANEL / 2 + FRONT_PROUD],
        dims: [bayW - 2 * REVEAL, inner - 2 * REVEAL, PANEL],
      },
      ...pull(
        x + (i ? -1 : 1) * (bayW / 2 - 0.05),
        midY + inner * 0.18,
        d / 2 + FRONT_PROUD,
        true,
      ),
    ]),
    // the television's foot
    { f: metal(IRON), at: [0, h + 0.01, -d * 0.1], dims: [0.36, 0.02, 0.2] },
    {
      f: metal(IRON),
      at: [0, h + 0.01 + lift / 2, -d * 0.12],
      dims: [0.06, lift, 0.03],
    },
  ];
  return (
    <group>
      <Built parts={parts} />
      {/* the set: a satin-metal body round the glass, so the set reads
          as an object and the screen as glass (which reflects the room,
          finish.tsx) */}
      <Slab
        f={metal(TV_BEZEL, 0.38)}
        at={[0, h + lift + tvH / 2, -d * 0.12]}
        dims={[tvW, tvH, TV.depth]}
      />
      {/* the glass laid on the body's front, a hair proud of it */}
      <Slab
        f={{ colour: TV_GLASS, rough: 0.05, coat: 1 }}
        at={[0, h + lift + tvH / 2, -d * 0.12 + (TV.depth + TV.glass) / 2]}
        dims={[tvW - 2 * TV.rim, tvH - 2 * TV.rim, TV.glass]}
      />
    </group>
  );
}
