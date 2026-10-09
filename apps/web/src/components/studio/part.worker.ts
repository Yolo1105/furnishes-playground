import {
  type Sketch,
  type SketchSolve,
  holesOf,
  roundsOf,
  outlineOf,
} from "@furnishes/domain";
import type { GcsWrapper } from "@salusoft89/planegcs";
import type * as Replicad from "replicad";
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
  | { id: number; kind: "step"; sketch: Sketch; thickness: number };

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
  | { id: number; ok: false; error: string };

/** how finely a solid is meshed, mm and radians */
const MESH = { tolerance: 0.2, angularTolerance: 0.3 };

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

/** the profile drawn, its corners rounded where asked, and extruded */
const shape = async (sketch: Sketch, thickness: number) => {
  const r = await kernel();
  const pts = outlineOf(sketch);
  let pen = r.draw(pts[0]);
  for (const p of pts.slice(1)) pen = pen.lineTo(p);
  let drawing = pen.close();
  const radii = sketch.loop.map((id) => sketch.corners[id] ?? 0);
  const radius = Math.max(...radii);
  if (radius > 0) drawing = drawing.fillet(radius);
  // the holes cut from the profile before it is made solid
  for (const hole of holesOf(sketch)) {
    let h = r.draw(hole[0]);
    for (const p of hole.slice(1)) h = h.lineTo(p);
    drawing = drawing.cut(h.close());
  }
  for (const round of roundsOf(sketch))
    drawing = drawing.cut(r.drawCircle(round.r).translate(round.x, round.y));
  return drawing.sketchOnPlane("XY").extrude(thickness);
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
          : [];
      self.postMessage(a, { transfer });
    });
};
