import type { Vector3Tuple } from "three";
import { isWindow, type Opening, OPENINGS, type Wall } from "./room-data";
import { openingCentre } from "./room-health";
import { toMetres } from "@furnishes/scene";
import { devNumber } from "./dev-flags";

/**
 * The soft daylight a window lets in, as a light in its opening: an
 * area light the size of the glass just inside the pane, facing into
 * the room, a cool sky by day and a dim dusk in the evening. A room is
 * lit from its windows this way, the faces towards a window bright and
 * the far side falling off, as a real room is (the even sky fill all
 * round it had none of that). The live view (Scene3D's WindowLights)
 * and the photo's copy (scene-copy.ts) take their colour and strength
 * from here, so the two agree.
 *
 * At most `max` lights, the active room's windows alone: an area light
 * casts no shadow, so a window of the next room lit the active room
 * through the wall between them (in the hall, a speckle of highlights
 * on the floor's grain from windows it does not have). The other
 * rooms' windows are lit by their probes. The count is the most windows
 * any room of the flat has (`lightCount`; a light not in use stands
 * dark), so moving between rooms builds no shader again, and no shader
 * carries lights no room can use: each one is an area light's whole
 * evaluation in every lit surface's shader (six of them, when the
 * count was always `max`, more than doubled the time a software
 * renderer took to build the room's shaders).
 */
export const WINDOW_LIGHT = {
  /** the sky's radiance through the glass, and its colour */
  day: { colour: "#eef3ff", intensity: 2.4 },
  evening: { colour: "#8d9cc0", intensity: 0.25 },
  /** the photo's copy is traced and gathers its own bounce: it takes
      the glass's light at this many times the live view's */
  traced: 2.5,
  max: 6,
  /** how far inside the pane, m */
  inset: 0.04,
} as const;

/** the sky through the glass for a look, as the live lights and the
    bounce bake both take it (`?win=` tries another day strength, in
    development) */
export const skyThrough = (evening: boolean) =>
  evening
    ? WINDOW_LIGHT.evening
    : {
        ...WINDOW_LIGHT.day,
        intensity: devNumber("win") ?? WINDOW_LIGHT.day.intensity,
      };

/** a wall's inward normal, in the scene's x and z */
export const inward = (wall: Wall): [number, number] =>
  wall === "north"
    ? [0, 1]
    : wall === "south"
      ? [0, -1]
      : wall === "west"
        ? [1, 0]
        : [-1, 0];

/** a room as the lights need it, mm: its place on the sheet, its box,
    its outline and its openings */
export type LitRoom = {
  id: string;
  pos: readonly [number, number];
  W: number;
  D: number;
  outline: readonly (readonly [number, number])[];
  openings: readonly Opening[];
};

/** a window's light: its middle (m, about the active room's middle), the
    way it faces (into the room), its size, m */
export type Pane = {
  at: Vector3Tuple;
  facing: [number, number];
  width: number;
  height: number;
};

/** how many window lights the flat's shaders carry: the most windows any
    one of its rooms has, at least one and at most WINDOW_LIGHT.max */
export const lightCount = (rooms: readonly LitRoom[]): number =>
  Math.min(
    WINDOW_LIGHT.max,
    Math.max(1, ...rooms.map((r) => r.openings.filter(isWindow).length)),
  );

/** the windows' lights, the active room's own, at most WINDOW_LIGHT.max */
export const panesOf = (
  rooms: readonly LitRoom[],
  activeId: string,
): Pane[] => {
  const active = rooms.find((r) => r.id === activeId);
  if (!active) return [];
  const panes: (Pane & { far: number })[] = [];
  for (const r of rooms) {
    if (r.id !== activeId) continue;
    // the room's middle from the active room's middle, m
    const dx =
      toMetres(r.pos[0] - active.pos[0]) +
      toMetres(r.W) / 2 -
      toMetres(active.W) / 2;
    const dz =
      toMetres(r.pos[1] - active.pos[1]) +
      toMetres(r.D) / 2 -
      toMetres(active.D) / 2;
    for (const o of r.openings) {
      if (!isWindow(o)) continue;
      const { centre, at } = openingCentre(r, o);
      const across = o.wall === "north" || o.wall === "south";
      const x = toMetres(across ? centre : at) - toMetres(r.W) / 2;
      const z = toMetres(across ? at : centre) - toMetres(r.D) / 2;
      const [nx, nz] = inward(o.wall);
      const sill = toMetres(o.sill ?? OPENINGS.window.sill);
      const head = toMetres(o.head ?? OPENINGS.window.head);
      const pane: Pane = {
        at: [
          dx + x + nx * WINDOW_LIGHT.inset,
          (sill + head) / 2,
          dz + z + nz * WINDOW_LIGHT.inset,
        ],
        facing: [nx, nz],
        width: toMetres(o.width),
        height: head - sill,
      };
      panes.push({
        ...pane,
        // the active room's own first, then by distance
        far: r.id === activeId ? -1 : Math.hypot(pane.at[0], pane.at[2]),
      });
    }
  }
  return panes
    .sort((a, b) => a.far - b.far)
    .slice(0, WINDOW_LIGHT.max)
    .map(({ far: _, ...p }) => p);
};
