import {
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Material,
  type Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type Vector3Tuple,
} from "three";

/**
 * A copy of the room for handing over: to the glTF exporter, or to the
 * path tracer. The live scene mixes what a person would call the room
 * (walls, floor, ceiling, skirting, windows, doors, pieces, props) with
 * helpers (a halo, a turn ring, labels, edge lines, the probe grid) and
 * node materials the exporter and the tracer cannot read (the floor's
 * box-projected reflection, the window's shader-drawn outside). The copy
 * keeps only what a tagged ancestor says is the room, as a NEW tree of
 * meshes in world space with classic Standard or Physical materials,
 * each named; a window's outside becomes a plane that glows with a
 * picture of the same sky; a glTF copy adds the cameras asked for and
 * the sun as a light, a tracing copy keeps the scene's lights.
 *
 * Tags: `userData.export` on any ancestor. "room" and "piece" and "prop"
 * are kept; "helper" is dropped whatever stands under it; "outlook" is
 * a window's outside. Nothing untagged is kept: the allowlist is the
 * tags, never a name. `userData.name` on the tagged ancestor names the
 * copy's node.
 *
 * Materials are new instances the copy owns (dispose them with it);
 * geometries and the live scene's textures are shared by reference and
 * never disposed here; the sky pictures are the copy's own.
 */
export type ExportTag = "room" | "piece" | "prop" | "helper" | "outlook";
export type CopyPurpose = "gltf" | "trace";
/** a camera to carry in the copy: where it stands and what it looks at */
export type Bookmark = {
  name: string;
  position: Vector3Tuple;
  at: Vector3Tuple;
};
/** the sun to carry in a glTF copy */
export type Sun = { position: Vector3Tuple; colour: string; intensity: number };
/** what a window's outside shows, kept in its mesh's userData */
export type OutlookData = {
  evening: boolean;
  /** where the sun stands, m about the room's middle */
  sun: Vector3Tuple;
};

export type Copy = {
  root: Group;
  /** the materials and pictures the copy made, let go */
  dispose: () => void;
};

/** the sky a window's outside is drawn with, by day and in the evening,
    as Room3D's Outside draws it; the picture here is the same colours
    laid as a gradient with the sun's disc, not the shader's clouds */
const SKY = {
  day: {
    zenith: "#2b5cc7",
    horizon: "#b8ccE6",
    sun: "#fff5e0",
    ground: "#3d5221",
    light: 3.2,
  },
  evening: {
    zenith: "#24295c",
    horizon: "#f2854d",
    sun: "#ffb366",
    ground: "#171a0f",
    light: 1.3,
  },
} as const;
/** the sky picture's size: wide, half of it the ground */
const SKY_W = 1024;
const SKY_H = 512;
/** the camera the bookmarks are drawn with: the stage's */
const FOV = 42;
const NEAR = 0.05;
const FAR = 100;

/** the nearest tag above or on an object */
const tagOf = (o: Object3D): ExportTag | null => {
  for (let at: Object3D | null = o; at; at = at.parent) {
    const t = at.userData.export as ExportTag | undefined;
    if (t) return t;
  }
  return null;
};
/** the nearest name given above or on an object */
const givenName = (o: Object3D): string | null => {
  for (let at: Object3D | null = o; at; at = at.parent) {
    const n = at.userData.name as string | undefined;
    if (n) return n;
  }
  return null;
};

type Classic = MeshStandardMaterial | MeshPhysicalMaterial;
/** a material the exporter and the tracer read: a classic one is
    cloned (textures shared); a node material becomes a Standard one
    with the same colour and maps; anything else a Standard one in its
    colour */
const classicOf = (m: Material): Classic => {
  const any = m as Material & {
    isNodeMaterial?: boolean;
    isMeshPhysicalMaterial?: boolean;
    isMeshStandardMaterial?: boolean;
    color?: Color;
    map?: Texture | null;
    normalMap?: Texture | null;
    normalScale?: { x: number; y: number };
    roughness?: number;
    roughnessMap?: Texture | null;
    metalness?: number;
    emissive?: Color;
    emissiveIntensity?: number;
  };
  if (!any.isNodeMaterial) {
    if (any.isMeshPhysicalMaterial) return (m as MeshPhysicalMaterial).clone();
    if (any.isMeshStandardMaterial) return (m as MeshStandardMaterial).clone();
  }
  const out = new MeshStandardMaterial({
    color: any.color ?? new Color("#ffffff"),
    map: any.map ?? null,
    normalMap: any.normalMap ?? null,
    roughness: any.roughness ?? 0.8,
    roughnessMap: any.roughnessMap ?? null,
    metalness: any.metalness ?? 0,
    emissive: any.emissive ?? new Color("#000000"),
    emissiveIntensity: any.emissiveIntensity ?? 1,
    transparent: m.transparent,
    opacity: m.opacity,
    side: m.side,
    vertexColors: m.vertexColors,
  });
  if (any.normalScale)
    out.normalScale.set(any.normalScale.x, any.normalScale.y);
  return out;
};

/** the picture a window's outside glows with: the sky's gradient over
    the ground, the sun's disc where the room's sun stands */
const skyPicture = (data: OutlookData): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const look = data.evening ? SKY.evening : SKY.day;
  const c = document.createElement("canvas");
  c.width = SKY_W;
  c.height = SKY_H;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const sky = ctx.createLinearGradient(0, 0, 0, SKY_H / 2);
  sky.addColorStop(0, look.zenith);
  sky.addColorStop(1, look.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SKY_W, SKY_H / 2);
  ctx.fillStyle = look.ground;
  ctx.fillRect(0, SKY_H / 2, SKY_W, SKY_H / 2);
  // the sun: its bearing across the picture, its height up it
  const [sx, sy, sz] = data.sun;
  const len = Math.hypot(sx, sy, sz) || 1;
  const up = Math.max(0, sy / len);
  const bearing = Math.atan2(sx, -sz);
  const x = ((bearing / Math.PI + 1) / 2) * SKY_W;
  const y = (SKY_H / 2) * (1 - up);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, SKY_H * 0.25);
  glow.addColorStop(0, look.sun);
  glow.addColorStop(0.08, look.sun);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SKY_W, SKY_H / 2);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/** the copy of a scene for a purpose */
export const copyForExport = (
  scene: Object3D,
  options: {
    purpose: CopyPurpose;
    /** cameras to carry (a glTF copy) */
    cameras?: readonly Bookmark[];
    /** the sun to carry (a glTF copy) */
    sun?: Sun;
  },
): Copy => {
  const root = new Group();
  root.name = "Furnishes room";
  const roomGroup = new Group();
  roomGroup.name = "Room";
  const pieceGroup = new Group();
  pieceGroup.name = "Pieces";
  root.add(roomGroup, pieceGroup);
  const made: { dispose: () => void }[] = [];
  const counts = new Map<string, number>();
  const uniqueName = (base: string) => {
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  };
  const place = (copy: Object3D, source: Object3D) => {
    source.updateWorldMatrix(true, false);
    copy.matrix.copy(source.matrixWorld);
    copy.matrix.decompose(copy.position, copy.quaternion, copy.scale);
  };
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    const tag = tagOf(o);
    if (!tag || tag === "helper") return;
    // a thing under a hidden ancestor is not in the room as it stands
    for (let at: Object3D | null = o.parent; at; at = at.parent)
      if (!at.visible) return;
    if (tag === "outlook") {
      const data = o.userData.outlook as OutlookData | undefined;
      const picture = data ? skyPicture(data) : null;
      const look = data?.evening ? SKY.evening : SKY.day;
      const m = new MeshStandardMaterial({
        color: "#000000",
        emissive: "#ffffff",
        emissiveMap: picture,
        emissiveIntensity: look.light,
        side: DoubleSide,
      });
      if (picture) made.push(picture);
      made.push(m);
      const copy = new Mesh(mesh.geometry, m);
      copy.name = uniqueName("Window outside");
      place(copy, o);
      roomGroup.add(copy);
      return;
    }
    const sources = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const materials = sources.map(classicOf);
    for (const m of materials) made.push(m);
    const copy = new Mesh(
      mesh.geometry,
      materials.length === 1 ? materials[0]! : materials,
    );
    copy.castShadow = mesh.castShadow;
    copy.receiveShadow = mesh.receiveShadow;
    const base =
      givenName(o) ??
      (tag === "room" ? "Room part" : tag === "prop" ? "Prop" : "Piece");
    copy.name = uniqueName(base);
    place(copy, o);
    (tag === "room" ? roomGroup : pieceGroup).add(copy);
  });
  if (options.purpose === "gltf") {
    if (options.cameras?.length) {
      const cameras = new Group();
      cameras.name = "Cameras";
      for (const b of options.cameras) {
        const cam = new PerspectiveCamera(FOV, 16 / 10, NEAR, FAR);
        cam.name = b.name;
        cam.position.set(...b.position);
        cam.lookAt(new Vector3(...b.at));
        cameras.add(cam);
      }
      root.add(cameras);
    }
    if (options.sun) {
      const sun = new DirectionalLight(
        options.sun.colour,
        options.sun.intensity,
      );
      sun.name = "Sun";
      sun.position.set(...options.sun.position);
      // a light looks down its -Z at what it lights, as glTF has it
      sun.lookAt(new Vector3(0, 0, 0));
      root.add(sun);
    }
  } else {
    // a tracing copy keeps the scene's own sun and lamps; the fills
    // that only a raster needs (sky, hemisphere) are not light to a
    // tracer, which sees the sky itself
    const lights = new Group();
    lights.name = "Lights";
    scene.traverse((o) => {
      const l = o as DirectionalLight;
      if (!l.isDirectionalLight || !l.visible) return;
      const copy = l.clone();
      copy.castShadow = false;
      place(copy, o);
      lights.add(copy);
    });
    if (lights.children.length) root.add(lights);
  }
  return {
    root,
    dispose: () => {
      for (const m of made) m.dispose();
    },
  };
};
