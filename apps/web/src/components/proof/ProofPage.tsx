"use client";

import { useEffect, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DataTexture,
  EquirectangularReflectionMapping,
  FloatType,
  Group,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { boardGeometry, cutOf, type ScanScale } from "./board-uv";
import { BOOKCASE, bookcase } from "./bookcase";
import { bakePiece, giveAoUv } from "./proof-ao";

/**
 * Round 10, Part 1: the one-day proof (`/rounded?proof=bookcase`). One
 * birch-ply bookcase in a product studio, drawn twice from one scene:
 * rasterised (`mode=raster`) and path traced (`mode=trace`, the
 * WebGL2 tracer of three-gpu-pathtracer, which reads the same
 * materials and the same coordinates). Standard materials only
 * (MeshPhysicalMaterial, no node tricks): the scan's colour in sRGB,
 * its normal and roughness linear, the colour white, no clear coat,
 * the piece's own baked occlusion its one AO (the tracer finds its own).
 *
 * The scans are the owner's (public/materials/README.md, "Round 10,
 * Part 1"): `scan/birch-face` and `scan/birch-edge`. Until they are
 * there the page draws a stand-in, said so on the stage
 * (`data-proof-scan="stand-in"`) and in `window.__proof`: the studio's
 * Wood049 tinted to birch on the faces, a drawn 13-ply stripe on the
 * edges. A stand-in proves the pipeline, not the look.
 *
 * Studio view: a light grey seamless backdrop lit by the Studio Small
 * 03 HDRI already in the repository, the piece's baked footprint as the
 * one contact shadow (the tracer casts its own), Neutral tone mapping,
 * the exposure metered so the backdrop reads 0.6 sRGB, and the frame
 * supersampled 2 × 2 (the still's equivalent of TRAA). Views: `view=45`
 * and `view=front`, 1600 px across.
 */

/** the frame, CSS px; drawn at twice that and read back */
const FRAME = { w: 1600, h: 1067 };
const SUPER = 2;
/** what the backdrop should read, sRGB, and the metering's passes */
const BACKDROP_TARGET = 0.6;
const METER_PASSES = 5;
/** the backdrop's grey and roughness */
const BACKDROP = { colour: 0xbdbdbd, rough: 0.95 };
/** the edge reads this much rougher than the face (the scan's map is
    multiplied by the material's roughness) */
const EDGE_ROUGH = 1.2;
/** the stand-in's birch tone over the studio's light grain values */
const STAND_IN_TINT = 0xdcc6a2;

type SetFiles = {
  color: Texture;
  normal: Texture | null;
  roughness: Texture | null;
  scale: ScanScale;
  tint: number;
  standIn: boolean;
};

const srgbToLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const loader = new TextureLoader();
const load = async (url: string, colour: boolean) => {
  const t = await loader.loadAsync(url);
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
};

const exists = async (url: string) => {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
};

/** a scanned set's scale: its `set.json` if it has one, else as given */
const scaleOf = async (base: string, fallback: ScanScale) => {
  try {
    const r = await fetch(`${base}/set.json`);
    if (!r.ok) return fallback;
    const s = (await r.json()) as Partial<ScanScale>;
    return {
      size: s.size ?? fallback.size,
      grain: s.grain ?? fallback.grain,
    } as ScanScale;
  } catch {
    return fallback;
  }
};

/** the face: the owner's scan, else the stand-in */
const faceSet = async (): Promise<SetFiles> => {
  const base = "/materials/scan/birch-face";
  if (await exists(`${base}/color.jpg`)) {
    // Poly Haven's plywood is 0.5 m across (the brief); set.json may say
    const scale = await scaleOf(base, { size: [0.5, 0.5], grain: "u" });
    return {
      color: await load(`${base}/color.jpg`, true),
      normal: await load(`${base}/normal.jpg`, false),
      roughness: await load(`${base}/roughness.jpg`, false),
      scale,
      tint: 0xffffff,
      standIn: false,
    };
  }
  return {
    color: await load("/materials/wood/color.jpg", true),
    normal: await load("/materials/wood/normal.jpg", false),
    roughness: await load("/materials/wood/roughness.jpg", false),
    scale: { size: [0.75, 0.75], grain: "u" },
    tint: STAND_IN_TINT,
    standIn: true,
  };
};

/** a drawn ply edge for the stand-in: 13 plies across the 18 mm,
    birch veneers with a glue line between, a hair different each */
const drawnPlies = () => {
  const c = document.createElement("canvas");
  const plies = 13;
  c.width = 64;
  c.height = plies * 12;
  const x = c.getContext("2d")!;
  for (let k = 0; k < plies; k++) {
    const l = 214 + ((k * 37) % 11) - 5;
    x.fillStyle = `rgb(${l},${l - 22},${l - 52})`;
    x.fillRect(0, k * 12, 64, 12);
    x.fillStyle = "rgb(150,120,84)";
    x.fillRect(0, k * 12, 64, 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  return t;
};

/** the edge: the owner's scan, else the drawn plies */
const edgeSet = async (): Promise<SetFiles> => {
  const base = "/materials/scan/birch-edge";
  if (await exists(`${base}/color.jpg`)) {
    const scale = await scaleOf(base, { size: [0.25, 0.25], grain: "u" });
    return {
      color: await load(`${base}/color.jpg`, true),
      normal: await load(`${base}/normal.jpg`, false),
      roughness: await load(`${base}/roughness.jpg`, false),
      scale,
      tint: 0xffffff,
      standIn: false,
    };
  }
  return {
    color: drawnPlies(),
    normal: null,
    roughness: null,
    // one period of the drawing is the board's 18 mm
    scale: { size: [0.25, 0.018], grain: "u" },
    tint: 0xffffff,
    standIn: true,
  };
};

/** a texture's mean colour, linear, read small */
const meanLinear = (t: Texture, tint: number) => {
  const img = t.image as CanvasImageSource & { width: number; height: number };
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const x = c.getContext("2d")!;
  x.drawImage(img, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4)
    sum +=
      0.2126 * srgbToLinear(d[i]! / 255) +
      0.7152 * srgbToLinear(d[i + 1]! / 255) +
      0.0722 * srgbToLinear(d[i + 2]! / 255);
  const tr = srgbToLinear(((tint >> 16) & 255) / 255);
  const tg = srgbToLinear(((tint >> 8) & 255) / 255);
  const tb = srgbToLinear((tint & 255) / 255);
  return (sum / (d.length / 4)) * (0.2126 * tr + 0.7152 * tg + 0.0722 * tb);
};

/** the bytes a texture takes on the GPU, with its mips */
const bytesOf = (t: Texture | null) => {
  if (!t) return 0;
  const img = t.image as { width?: number; height?: number } | null;
  return Math.round((img?.width ?? 0) * (img?.height ?? 0) * 4 * 1.333);
};

/** the seamless backdrop: a floor curving up into a wall */
const cyclorama = () => {
  const R = 1.4;
  const profile: [number, number][] = [];
  for (let z = 14; z > -2; z -= 0.5) profile.push([z, 0]);
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * (Math.PI / 2);
    profile.push([-2 - R * Math.sin(a), R - R * Math.cos(a)]);
  }
  profile.push([-2 - R, 6]);
  const xs = [-24, 24];
  const pos: number[] = [];
  const index: number[] = [];
  for (const [z, y] of profile) for (const x of xs) pos.push(x, y, z);
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return new Mesh(
    g,
    new MeshPhysicalMaterial({
      color: BACKDROP.colour,
      roughness: BACKDROP.rough,
    }),
  );
};

/** a board's two groups as two meshes over the same attributes */
const partsOf = (g: BufferGeometry, mats: MeshPhysicalMaterial[]) =>
  g.groups.map((grp) => {
    const part = new BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes))
      part.setAttribute(name, attr);
    part.setIndex(
      new BufferAttribute(
        (g.index!.array as Uint32Array).slice(grp.start, grp.start + grp.count),
        1,
      ),
    );
    return new Mesh(part, mats[grp.materialIndex ?? 0]);
  });

/** a bar handle: a 12 mm bar on two posts, satin steel */
const handleMesh = (length: number) => {
  const steel = new MeshPhysicalMaterial({
    color: 0xc4c7ca,
    metalness: 1,
    roughness: 0.35,
  });
  const g = new Group();
  const bar = new Mesh(new CylinderGeometry(0.006, 0.006, length, 24), steel);
  bar.position.z = 0.028;
  g.add(bar);
  for (const s of [-1, 1]) {
    const post = new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.028, 16), steel);
    post.rotation.x = Math.PI / 2;
    post.position.set(0, (s * 0.128) / 2, 0.014);
    g.add(post);
  }
  return g;
};

type Report = {
  scan: "scanned" | "stand-in";
  firstFrameMs: number;
  bakeMs: number;
  textureMB: number;
  albedo: { face: number; edge: number };
  exposure: number;
  backdrop: number;
  samples: number;
  traceMs: number;
};

export function ProofPage({
  view,
  mode,
  spp,
}: {
  view: "45" | "front";
  mode: "raster" | "trace";
  spp: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("loading");
  const [scan, setScan] = useState("");
  const [samples, setSamples] = useState(0);
  useEffect(() => {
    const began = performance.now();
    let stop = false;
    const renderer = new WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(SUPER);
    renderer.setSize(FRAME.w, FRAME.h);
    renderer.toneMapping = NeutralToneMapping;
    host.current!.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(32, FRAME.w / FRAME.h, 0.1, 40);
    const D = 4.7;
    if (view === "45")
      camera.position.set(D * Math.SQRT1_2, 1.25, D * Math.SQRT1_2);
    else camera.position.set(0, 1.15, D);
    camera.lookAt(0, 0.98, 0);
    void (async () => {
      const [face, edge, hdr] = await Promise.all([
        faceSet(),
        edgeSet(),
        new HDRLoader().setDataType(FloatType).loadAsync("/sky/studio.hdr"),
      ]);
      // a run let go (development mounts the page twice) draws nothing
      if (stop) return;
      hdr.mapping = EquirectangularReflectionMapping;
      const pmrem = new PMREMGenerator(renderer);
      const env = pmrem.fromEquirectangular(hdr).texture;
      scene.environment = env;
      setScan(face.standIn || edge.standIn ? "stand-in" : "scanned");
      // the piece and its one AO
      const { boards, handles } = bookcase();
      const ao = bakePiece(boards);
      const aoTex = new DataTexture(
        ao.atlas,
        ao.size[0],
        ao.size[1],
        RGBAFormat,
      );
      aoTex.colorSpace = LinearSRGBColorSpace;
      aoTex.magFilter = LinearFilter;
      aoTex.minFilter = LinearFilter;
      aoTex.channel = 1;
      aoTex.needsUpdate = true;
      const faceMat = new MeshPhysicalMaterial({
        color: face.tint,
        map: face.color,
        normalMap: face.normal,
        roughnessMap: face.roughness,
        roughness: 1,
        metalness: 0,
        clearcoat: 0,
        aoMap: aoTex,
      });
      const edgeMat = new MeshPhysicalMaterial({
        color: edge.tint,
        map: edge.color,
        normalMap: edge.normal,
        roughnessMap: edge.roughness,
        roughness: edge.roughness ? EDGE_ROUGH : 0.62,
        metalness: 0,
        clearcoat: 0,
        aoMap: aoTex,
      });
      const piece = new Group();
      boards.forEach((b, k) => {
        const g = boardGeometry(
          b.dims,
          face.scale,
          edge.scale,
          cutOf(BOOKCASE.id, b.id),
        );
        giveAoUv(g, k, ao.boxes[k]!, ao.charts, ao.size);
        // a mesh a material: the tracer gives each vertex one material,
        // and a board's faces and edges meet at shared vertices
        for (const m of partsOf(g, [faceMat, edgeMat])) {
          m.position.set(...b.at);
          piece.add(m);
        }
      });
      for (const h of handles) {
        const m = handleMesh(h.length);
        m.position.set(...h.at);
        piece.add(m);
      }
      scene.add(piece);
      scene.add(cyclorama());
      // the footprint, the raster's one contact shadow
      const f = ao.foot;
      const shade = new Uint8Array(f.nx * f.nz * 4);
      for (let j = 0; j < f.nz; j++)
        for (let i = 0; i < f.nx; i++) {
          // the plane's rows run from the front (+z) back
          const o = ((f.nz - 1 - j) * f.nx + i) * 4;
          const taken = 255 - ao.footprint[j * f.nx + i]!;
          shade[o] = taken;
          shade[o + 1] = taken;
          shade[o + 2] = taken;
          shade[o + 3] = 255;
        }
      const shadeTex = new DataTexture(shade, f.nx, f.nz, RGBAFormat);
      shadeTex.magFilter = LinearFilter;
      shadeTex.minFilter = LinearFilter;
      shadeTex.needsUpdate = true;
      const contact = new Mesh(
        new PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0),
        new MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          alphaMap: shadeTex,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      contact.rotation.x = -Math.PI / 2;
      contact.position.set((f.x0 + f.x1) / 2, 0.0008, (f.z0 + f.z1) / 2);
      scene.add(contact);
      // the exposure, metered on the backdrop over the top of the frame
      const read = document.createElement("canvas");
      read.width = 160;
      read.height = 107;
      const rx = read.getContext("2d", { willReadFrequently: true })!;
      const backdrop = () => {
        rx.drawImage(renderer.domElement, 0, 0, 160, 107);
        const d = rx.getImageData(0, 0, 160, 10).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4)
          s += (d[i]! + d[i + 1]! + d[i + 2]!) / 3 / 255;
        return s / (d.length / 4);
      };
      let exposure = 1;
      let reads = 0;
      for (let p = 0; p < METER_PASSES; p++) {
        renderer.toneMappingExposure = exposure;
        renderer.render(scene, camera);
        reads = backdrop();
        exposure *=
          srgbToLinear(BACKDROP_TARGET) / Math.max(1e-3, srgbToLinear(reads));
      }
      renderer.toneMappingExposure = exposure;
      renderer.render(scene, camera);
      reads = backdrop();
      const report: Report = {
        scan: face.standIn || edge.standIn ? "stand-in" : "scanned",
        firstFrameMs: Math.round(performance.now() - began),
        bakeMs: Math.round(ao.ms),
        textureMB:
          Math.round(
            ([face.color, face.normal, face.roughness, edge.color, edge.normal, edge.roughness]
              .map(bytesOf)
              .reduce((a, b) => a + b, 0) +
              ao.size[0] * ao.size[1] * 4) /
              1e4,
          ) / 100,
        albedo: {
          face: Math.round(meanLinear(face.color, face.tint) * 1000) / 1000,
          edge: Math.round(meanLinear(edge.color, edge.tint) * 1000) / 1000,
        },
        exposure: Math.round(exposure * 1000) / 1000,
        backdrop: Math.round(reads * 1000) / 1000,
        samples: 0,
        traceMs: 0,
      };
      if (stop) return;
      (window as unknown as { __proof?: Report }).__proof = report;
      if (mode === "raster") {
        setState("ready");
        return;
      }
      // the same scene, traced: the tracer finds its own shadows and
      // occlusion, so the footprint and the AO map are left out, and it
      // reads the HDRI itself rather than the prefiltered copy
      contact.visible = false;
      scene.environment = hdr;
      renderer.setPixelRatio(1);
      renderer.setSize(FRAME.w, FRAME.h);
      const { WebGLPathTracer } = await import("three-gpu-pathtracer");
      if (stop) return;
      const tracer = new WebGLPathTracer(renderer);
      tracer.bounces = 8;
      tracer.tiles.set(2, 2);
      tracer.renderDelay = 0;
      tracer.fadeDuration = 0;
      tracer.minSamples = 1;
      tracer.dynamicLowRes = false;
      faceMat.aoMap = null;
      edgeMat.aoMap = null;
      faceMat.needsUpdate = true;
      edgeMat.needsUpdate = true;
      tracer.setScene(scene, camera);
      setState("tracing");
      const traceFrom = performance.now();
      const step = () => {
        if (stop) return;
        tracer.renderSample();
        const n = Math.floor(tracer.samples);
        setSamples(n);
        report.samples = n;
        report.traceMs = Math.round(performance.now() - traceFrom);
        if (n >= spp) {
          setState("ready");
          return;
        }
        requestAnimationFrame(step);
      };
      step();
    })().catch((e: unknown) => {
      console.error(e);
      setState("failed");
    });
    return () => {
      stop = true;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [view, mode, spp]);
  return (
    <div
      className="proof-stage"
      data-proof={state}
      data-proof-scan={scan}
      data-proof-samples={samples}
      style={{ background: "#ddd", minHeight: "100vh", padding: 0 }}
    >
      <div ref={host} style={{ width: FRAME.w, height: FRAME.h }} />
      <p style={{ font: "12px system-ui", margin: 8 }}>
        Proof bookcase · {view} · {mode} · {scan || "…"} · {state}
        {mode === "trace" ? ` · ${samples}/${spp} spp` : ""}
      </p>
    </div>
  );
}
