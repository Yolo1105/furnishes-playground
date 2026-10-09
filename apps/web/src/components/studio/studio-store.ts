import type { PhotoSize } from "./photo-size";
import { create } from "zustand";
import type { Carried } from "./dnd";
import type { WheelMode } from "./input";

/**
 * What the toolbar holds and the surfaces follow: the mode, the tool
 * (Select picks and moves; Inspect picks and offers a piece's details or
 * a label for Eva; Wall draws, from the Room tab; Measure reads a
 * distance off the plan), which view is on the main surface, how far
 * the plan is zoomed and panned, whether the panels are hidden to look at the room, a
 * piece in focus on its own, the project panel's tab, the loading line,
 * and the Render run. Render walks
 * a fixed path: generating (the line on the toolbar's edge), revealing
 * (the divider sweeps left to right between the rails, the render filling
 * in behind it), done (the render stands alone), compare (with the panels
 * hidden, the divider comes in from the left to the middle and can be
 * dragged: the view as edited is left of it, the render right).
 */
type Mode = "edit" | "preview";
export type Tool = "select" | "inspect" | "wall" | "measure" | "tour";
/** what lights and reflects in the room from outside it: the studio's
    own light panels, or one of four surroundings (Poly Haven environment
    maps under public/sky, see its LICENSES.md) */
export type Sky = "panels" | "apartment" | "studio" | "sunset" | "night";
export const SKIES: { id: Sky; label: string }[] = [
  { id: "panels", label: "Light panels" },
  { id: "apartment", label: "An apartment" },
  { id: "studio", label: "A photo studio" },
  { id: "sunset", label: "A sunset" },
  { id: "night", label: "Night" },
];
/** how the 3D room is looked at: edges on every piece, shadows (auto
    follows the pointer: off under a finger), names, a floor grid, the
    light and the surroundings */
export type SceneLook = {
  edges: boolean;
  shadows: "auto" | "on" | "off";
  labels: boolean;
  grid: boolean;
  light: "day" | "evening";
  sky: Sky;
  /** how bright the picture is, as a camera's exposure */
  exposure: number;
  /** the picture's finish: auto follows the device (see Post.tsx), the
      rest pick a tier, plain none */
  quality: Quality;
  /** the size a photo is traced at (photo-size.ts) */
  photoSize: PhotoSize;
  /** a panel's machining cut for real in 3D (cut-solid.ts): auto is on
      for the desktop tier, where the cuts cost nothing to notice */
  cuts: "auto" | "on" | "off";
};
export type Quality = "auto" | "full" | "light" | "plain";
export const QUALITIES: { id: Quality; label: string; sub: string }[] = [
  { id: "auto", label: "Auto", sub: "as the device allows" },
  { id: "full", label: "Full", sub: "the finish at full size" },
  { id: "light", label: "Light", sub: "the finish at half size" },
  { id: "plain", label: "Plain", sub: "the room as drawn" },
];
/** the least a render's line runs, ms: the page's `--preview-generate`
    token (the suite shortens or lengthens it), so a render that is done
    at once still shows its moment */
export const minRenderMs = () => {
  if (typeof document === "undefined") return 0;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--preview-generate")
    .trim();
  const n = v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
  return Number.isFinite(n) ? n : 1200;
};

/** the exposure's range: a dim room to a bright one */
export const EXPOSURE = { min: 0.6, max: 1.8, step: 0.05 };
export const SCENE_DEFAULT: SceneLook = {
  edges: false,
  shadows: "auto",
  labels: false,
  grid: false,
  light: "day",
  sky: "panels",
  exposure: 1.1,
  quality: "auto",
  photoSize: "screen",
  cuts: "auto",
};
/** how far the plan can be zoomed, and by how much a step zooms */
export const ZOOM = { min: 0.5, max: 4, step: 1.15 };
/** the project panel's tabs */
type PanelTab = "assets" | "products" | "room" | "detail";
/** Eva's tabs */
type EvaTab = "agent" | "history" | "preference";
/** the shelf's tabs */
export type ShelfTab = "saved" | "cart";
export type View = "3d" | "2d";
type PreviewStatus = "idle" | "generating" | "revealing" | "done" | "compare";
/** the ways to look at each view: a perspective and the straight-on
    sides in 3D, the plan and the elevations in 2D, as a CAD drawing has */
export const ANGLES: Record<View, readonly string[]> = {
  "3d": ["Perspective", "Front", "Back", "Left", "Right", "Top"],
  "2d": ["Plan", "Front", "Back", "Left", "Right"],
};
export type Angle = (typeof ANGLES)[View][number];

/** what the line under the toolbar is waiting for: a view swap is quick,
    a render takes its time */
type Loading = "view" | "render" | "photo" | null;
/** where a photo stands: idle, the scene being copied, the light
    traced, the picture cleaned, done, or failed and the graded view
    standing in */
export type PhotoState =
  "idle" | "scene" | "trace" | "denoise" | "done" | "failed";
/** a photo under way or shown: the view before it, for the compare,
    how many samples a pixel has of those asked for, where it stands,
    the time it has taken, ms, and its size, px */
export type PhotoStatus = {
  before: string;
  samples: number;
  of: number;
  state: PhotoState;
  ms: number;
  width: number;
  height: number;
};
/** a step of the work a render takes: the scene prepared and the light
    traced and denoised (a photo), or the light baked into the room, the
    floor's picture taken and the edges resolved (the view graded), or
    the view graded alone where the device does no more */
export type WorkStep =
  "scene" | "trace" | "denoise" | "light" | "floor" | "edges" | "grade";
/** the steps a render will take, which it is on, and how far along
    that step is when it is counted (done of of; 0 of 0 while not) */
export type Work = {
  plan: readonly WorkStep[];
  step: WorkStep;
  done: number;
  of: number;
};
/** WebGPU, WebGL 2, or WebGL 2 on a software GPU (SwiftShader, llvmpipe) */
export type Backend = "" | "webgpu" | "webgl" | "software";

type StudioState = {
  mode: Mode;
  tool: Tool;
  view: View;
  /** how the view is looked at, one of ANGLES[view] */
  angle: Angle;
  uiHidden: boolean;
  /** walking the room in 3D at eye height */
  walk: boolean;
  /** where the 3D camera stands about the room: its azimuth (0 looks in
      from the front, a quarter turn to the right from the right) and
      its height above the floor, radians; the view cube turns with it */
  cam: { yaw: number; pitch: number };
  /** the camera sent somewhere by the cube's drag: counted, so the same
      place sent twice still moves it */
  turn: { yaw: number; pitch: number; n: number } | null;
  /** the camera was turned by hand since the last named angle */
  free: boolean;
  /** where the toolbar's eye was when the panels were hidden, so the peek
      bar's eye stands in the same place */
  peekAt: { top: number; left: number } | null;
  /** a piece shown on its own, on a blank ground */
  focusId: string | null;
  panelTab: PanelTab;
  evaTab: EvaTab;
  shelfTab: ShelfTab;
  loading: Loading;
  /** counts each start, so a repeat of the same kind restarts the line */
  loadingAt: number;
  preview: PreviewStatus;
  /** the renderer's backend once it is up */
  backend: Backend;
  /** the picture's tier as the scene decided it (Post.tsx), once drawn */
  tier: "desktop" | "laptop" | "phone" | null;
  /** whether the machining is cut for real: the setting, or on the
      desktop tier when it is auto */
  cutsOn: () => boolean;
  /** the largest side a texture can have on this device, px: what a
      photo's size is kept to */
  photoMax: number;
  photo: PhotoStatus | null;
  /** what the render is doing now, while it generates */
  work: Work | null;
  /** the 3D view's last picture before it left the main column, for
      the small panel to show it as it stood */
  lastFrame: string | null;
  /** where the divider stands, as a percent of the stage's width */
  split: number;
  /** the plan's zoom (1 is the sheet fitted) and pan, px */
  planZoom: number;
  planPan: { x: number; y: number };
  /** what a plain wheel does on the plan: see input.ts */
  wheelMode: WheelMode;
  /** a moved piece near a wall goes flush to it */
  magnet: boolean;
  scene: SceneLook;
  /** the tour is playing: the walk camera runs through the stops */
  touring: boolean;
  /** how far along, 0 to 1, which stop is next, and how many there are
      on the path being walked (a round's corners count) */
  tourAt: number;
  tourStop: number;
  tourOf: number;
  /** a product being dragged towards the room, from a tile or a card */
  /** what a tile drag carries over the stage, while it does */
  carrying: Carried | null;
  /** a shared room is looked at, not changed: a click picks, nothing
      moves, no actions */
  readOnly: boolean;
  setMode: (mode: Mode) => void;
  setBackend: (backend: Backend, photoMax?: number) => void;
  setTier: (tier: StudioState["tier"]) => void;
  /** the photo's progress, or none once the view is edited again */
  setPhoto: (patch: Partial<PhotoStatus> | null) => void;
  setWork: (work: Work | null) => void;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setAngle: (angle: Angle) => void;
  /** the scene says where the camera stands */
  reportCam: (cam: { yaw: number; pitch: number }) => void;
  /** turn the camera to an azimuth and height, as the cube is dragged */
  turnTo: (to: { yaw: number; pitch: number }) => void;
  setWalk: (walk: boolean) => void;
  setUiHidden: (hidden: boolean, at?: { top: number; left: number }) => void;
  setFocus: (id: string | null) => void;
  setPanelTab: (tab: PanelTab) => void;
  setEvaTab: (tab: EvaTab) => void;
  setShelfTab: (tab: ShelfTab) => void;
  /** the line reached the end */
  endLoading: () => void;
  /** the sweep reached the end */
  revealed: () => void;
  /** bring the divider to the middle and let it be dragged */
  compare: () => void;
  setSplit: (split: number) => void;
  /** zoom the plan by a factor, about a point (px from the sheet's
      middle) so what is under the pointer stays put */
  zoomPlan: (factor: number, about?: { x: number; y: number }) => void;
  panPlan: (dx: number, dy: number) => void;
  /** the sheet fitted again */
  fitPlan: () => void;
  setWheelMode: (wheelMode: WheelMode) => void;
  setMagnet: (magnet: boolean) => void;
  setScene: (patch: Partial<SceneLook>) => void;
  /** play the tour: the 3D room comes up, walking, and the camera goes */
  startTour: () => void;
  stopTour: () => void;
  setTourAt: (at: number, stop: number, of?: number) => void;
  setCarrying: (carrying: Carried | null) => void;
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export const other = (v: View): View => (v === "3d" ? "2d" : "3d");
export const viewName = (v: View) => (v === "3d" ? "3D view" : "2D plan");

export const useStudio = create<StudioState>((set, get) => ({
  mode: "edit",
  tool: "select",
  view: "3d",
  angle: "Perspective",
  cam: { yaw: Math.PI / 4, pitch: Math.PI / 5 },
  turn: null,
  free: false,
  uiHidden: false,
  walk: false,
  peekAt: null,
  focusId: null,
  panelTab: "assets",
  evaTab: "agent",
  shelfTab: "saved",
  loading: null,
  loadingAt: 0,
  preview: "idle",
  backend: "",
  tier: null,
  cutsOn: () => {
    const s = get();
    return (
      s.scene.cuts === "on" || (s.scene.cuts === "auto" && s.tier === "desktop")
    );
  },
  photoMax: 4096,
  photo: null,
  work: null,
  lastFrame: null,
  split: 0,
  planZoom: 1,
  planPan: { x: 0, y: 0 },
  wheelMode: "auto",
  magnet: true,
  scene: SCENE_DEFAULT,
  touring: false,
  tourAt: 0,
  tourStop: 0,
  tourOf: 0,
  carrying: null,
  readOnly: false,
  // a render is a photo where the renderer can trace one (WebGPU),
  // the view graded elsewhere
  setMode: (mode) =>
    set((s) =>
      mode === "preview"
        ? {
            mode,
            preview: "generating",
            split: 0,
            loading: s.backend === "webgpu" ? "photo" : "render",
            loadingAt: s.loadingAt + 1,
            work: null,
          }
        : {
            mode,
            preview: "idle",
            split: 0,
            loading: null,
            photo: null,
            work: null,
          },
    ),
  // measuring and placing the tour's stops are done on the plan: those
  // tools bring the plan up, and leaving the plan puts them down
  setTool: (tool) =>
    set((s) =>
      (tool === "wall" || tool === "measure" || tool === "tour") &&
      s.view !== "2d"
        ? {
            tool,
            view: "2d",
            angle: ANGLES["2d"][0]!,
            walk: false,
            loading: "view",
            loadingAt: s.loadingAt + 1,
          }
        : { tool },
    ),
  setView: (view) =>
    set((s) =>
      s.view === view
        ? {}
        : {
            view,
            angle: ANGLES[view][0]!,
            walk: false,
            loading: "view",
            loadingAt: s.loadingAt + 1,
            ...(view === "3d" && (s.tool === "measure" || s.tool === "tour")
              ? { tool: "select" as const }
              : {}),
          },
    ),
  setAngle: (angle) => set({ angle, walk: false, free: false }),
  reportCam: (cam) =>
    set((s) =>
      Math.abs(s.cam.yaw - cam.yaw) > 0.004 ||
      Math.abs(s.cam.pitch - cam.pitch) > 0.004
        ? { cam }
        : {},
    ),
  turnTo: (to) =>
    set((s) => ({
      turn: { ...to, n: (s.turn?.n ?? 0) + 1 },
      free: true,
    })),
  setWalk: (walk) => set(walk ? { walk } : { walk, touring: false }),
  setUiHidden: (uiHidden, at) =>
    set((s) => ({
      uiHidden,
      peekAt: uiHidden ? (at ?? null) : null,
      // comparing belongs to looking: with the panels back, the render
      // stands whole again
      ...(!uiHidden && s.preview === "compare"
        ? { preview: "done" as const, split: 100 }
        : {}),
    })),
  setBackend: (backend, photoMax) =>
    set((s) => ({ backend, photoMax: photoMax ?? s.photoMax })),
  setTier: (tier) => set((s) => (s.tier === tier ? {} : { tier })),
  setPhoto: (patch) =>
    set((s) => ({
      photo:
        patch === null
          ? null
          : {
              before: "",
              samples: 0,
              of: 0,
              state: "idle",
              ms: 0,
              width: 0,
              height: 0,
              ...s.photo,
              ...patch,
            },
    })),
  setWork: (work) =>
    set((s) =>
      s.work?.step === work?.step &&
      s.work?.done === work?.done &&
      s.work?.of === work?.of
        ? {}
        : { work },
    ),
  setFocus: (focusId) => set({ focusId }),
  setPanelTab: (panelTab) => set({ panelTab }),
  setEvaTab: (evaTab) => set({ evaTab }),
  setShelfTab: (shelfTab) => set({ shelfTab }),
  endLoading: () => {
    const s = get();
    set(
      (s.loading === "render" || s.loading === "photo") &&
        s.preview === "generating"
        ? { loading: null, preview: "revealing", split: 100, work: null }
        : { loading: null, work: null },
    );
  },
  revealed: () => {
    if (get().preview === "revealing") set({ preview: "done" });
  },
  compare: () => {
    // the render is already everywhere: the view as edited slides in
    // from the left once that frame has painted
    set({ preview: "compare", split: 0 });
    window.setTimeout(() => {
      if (get().preview === "compare") set({ split: 50 });
    }, 40);
  },
  setSplit: (split) => set({ split: clamp(split) }),
  zoomPlan: (factor, about = { x: 0, y: 0 }) =>
    set((s) => {
      const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, s.planZoom * factor));
      const k = zoom / s.planZoom;
      return {
        planZoom: zoom,
        planPan: {
          x: about.x - (about.x - s.planPan.x) * k,
          y: about.y - (about.y - s.planPan.y) * k,
        },
      };
    }),
  panPlan: (dx, dy) =>
    set((s) => ({ planPan: { x: s.planPan.x + dx, y: s.planPan.y + dy } })),
  fitPlan: () => set({ planZoom: 1, planPan: { x: 0, y: 0 } }),
  setWheelMode: (wheelMode) => set({ wheelMode }),
  setMagnet: (magnet) => set({ magnet }),
  setScene: (patch) => set((s) => ({ scene: { ...s.scene, ...patch } })),
  startTour: () =>
    set((s) => ({
      touring: true,
      tourAt: 0,
      tourStop: 0,
      walk: true,
      tool: s.tool === "tour" ? "select" : s.tool,
      ...(s.view === "3d"
        ? {}
        : {
            view: "3d",
            angle: ANGLES["3d"][0]!,
            loading: "view",
            loadingAt: s.loadingAt + 1,
          }),
    })),
  stopTour: () => set({ touring: false }),
  setTourAt: (tourAt, tourStop, tourOf) =>
    set((s) => ({ tourAt, tourStop, tourOf: tourOf ?? s.tourOf })),
  setCarrying: (carrying) => set({ carrying }),
}));
