import {
  type FeatureStatus,
  type Part,
  type Sketch,
  type SketchSolve,
} from "@furnishes/domain";
import type { GcsWrapper } from "@salusoft89/planegcs";
import type * as Replicad from "replicad";
import {
  buildPart,
  drawingOf,
  MESH,
  meshOf,
  type PartMesh,
} from "./part-build";
import { solveWith } from "./part-solve";

/**
 * The part worker: a sketch solved by FreeCAD's constraint solver
 * (planegcs) and a profile made solid by OpenCascade (through
 * replicad), off the main thread, so the studio never waits on either.
 * Both come as WebAssembly, loaded the first time they are asked for
 * and never before (an 18 mm recipe never loads a kernel); the wasm
 * files are served as files of their own, unmodified, as their
 * licences ask (apps/web/LICENSES.md). Messages carry an id, and the
 * answer the same; a failure comes back as its words.
 */
export type PartRequest =
  | { id: number; kind: "solve"; sketch: Sketch }
  | { id: number; kind: "solid"; sketch: Sketch; thickness: number }
  | { id: number; kind: "step"; sketch: Sketch; thickness: number }
  /** a part built through its history, up to a rollback marker */
  | { id: number; kind: "build"; part: Part; upTo?: number }
  | { id: number; kind: "partStep"; part: Part }
  /** a STEP file's text read by the kernel: its box, or why not */
  | { id: number; kind: "checkStep"; step: string };

export type Solid = {
  /** the profile's frame: u along x, v along y, the thickness along z
      from 0, mm */
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

/** a request before its id is given */
export type PartAsk = {
  [K in PartRequest["kind"]]: Omit<Extract<PartRequest, { kind: K }>, "id">;
}[PartRequest["kind"]];

export type PartAnswer =
  | ({ id: number; ok: true; kind: "solve"; ms: number } & SketchSolve)
  | { id: number; ok: true; kind: "solid"; solid: Solid; ms: number }
  | { id: number; ok: true; kind: "step"; step: string; ms: number }
  | {
      id: number;
      ok: true;
      kind: "build";
      /** none when nothing built (every feature off or failed first) */
      mesh: PartMesh | null;
      statuses: FeatureStatus[];
      ms: number;
    }
  | { id: number; ok: true; kind: "partStep"; step: string; ms: number }
  | {
      id: number;
      ok: true;
      kind: "checkStep";
      bounds: [number, number, number][];
      ms: number;
    }
  | { id: number; ok: false; error: string };

let gcs: Promise<GcsWrapper> | undefined;
const solver = () =>
  (gcs ??= (async () => {
    const { init_planegcs_module, GcsWrapper } =
      await import("@salusoft89/planegcs");
    const wasm = new URL(
      "@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm",
      import.meta.url,
    ).href;
    const mod = await init_planegcs_module({ locateFile: () => wasm });
    return new GcsWrapper(new mod.GcsSystem());
  })());

let cad: Promise<typeof Replicad> | undefined;
const kernel = () =>
  (cad ??= (async () => {
    const [replicad, { default: opencascade }] = await Promise.all([
      import("replicad"),
      import("replicad-opencascadejs"),
    ]);
    const wasm = new URL("replicad-opencascadejs/wasm", import.meta.url).href;
    const oc = await opencascade({ locateFile: () => wasm });
    replicad.setOC(oc);
    return replicad;
  })());

const solve = async (sketch: Sketch) => solveWith(await solver(), sketch);

/** the profile drawn (part-build.ts: corners rounded, holes and rounds
    cut) and extruded */
const shape = async (sketch: Sketch, thickness: number) => {
  const r = await kernel();
  return drawingOf(r, sketch).sketchOnPlane("XY").extrude(thickness);
};

const answer = async (req: PartRequest): Promise<PartAnswer> => {
  const t0 = performance.now();
  switch (req.kind) {
    case "solve":
      return {
        id: req.id,
        kind: "solve",
        ...(await solve(req.sketch)),
        ok: true,
        ms: performance.now() - t0,
      };
    case "solid": {
      const s = await shape(req.sketch, req.thickness);
      const m = s.mesh(MESH);
      return {
        id: req.id,
        ok: true,
        kind: "solid",
        solid: {
          positions: Float32Array.from(m.vertices),
          normals: Float32Array.from(m.normals),
          indices: Uint32Array.from(m.triangles),
        },
        ms: performance.now() - t0,
      };
    }
    case "step": {
      const s = await shape(req.sketch, req.thickness);
      return {
        id: req.id,
        ok: true,
        kind: "step",
        step: await s.blobSTEP().text(),
        ms: performance.now() - t0,
      };
    }
    case "build": {
      const r = await kernel();
      const built = await buildPart(r, req.part, req.upTo);
      return {
        id: req.id,
        ok: true,
        kind: "build",
        mesh: built.body ? meshOf(built.body) : null,
        statuses: built.statuses,
        ms: performance.now() - t0,
      };
    }
    case "partStep": {
      const r = await kernel();
      const built = await buildPart(r, req.part);
      if (!built.body) throw new Error("the part has no body to write");
      return {
        id: req.id,
        ok: true,
        kind: "partStep",
        step: await built.body.blobSTEP().text(),
        ms: performance.now() - t0,
      };
    }
    case "checkStep": {
      const r = await kernel();
      const shape = await r.importSTEP(new Blob([req.step]));
      const bounds = shape.boundingBox.bounds;
      shape.mesh(MESH);
      return {
        id: req.id,
        ok: true,
        kind: "checkStep",
        bounds,
        ms: performance.now() - t0,
      };
    }
  }
};

self.onmessage = (e: MessageEvent<PartRequest>) => {
  void answer(e.data)
    .catch((error): PartAnswer => ({
      id: e.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }))
    .then((a) => {
      const transfer =
        a.ok && a.kind === "solid"
          ? [
              a.solid.positions.buffer,
              a.solid.normals.buffer,
              a.solid.indices.buffer,
            ]
          : a.ok && a.kind === "build" && a.mesh
            ? [
                a.mesh.positions.buffer,
                a.mesh.normals.buffer,
                a.mesh.indices.buffer,
                a.mesh.edges.buffer,
              ]
            : [];
      self.postMessage(a, { transfer });
    });
};
