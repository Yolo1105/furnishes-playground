import type { Object3D } from "three";

/** the layer the sun's shadow sees that the camera does not: a near
    wall taken out of the picture, and the ceiling that keeps the sun
    out of the open top */
export const SHADOW_LAYER = 1;

/** a part and everything in it put on one layer */
export const layerOf = (root: Object3D, layer: number) =>
  root.traverse((o) => o.layers.set(layer));

/** the walls down for the camera, by id: out of the picture, on the
    shadow layer alone (Room3D's WallRun keeps the list) */
export const wallsDown = new Map<string, Object3D>();

/** `draw` with every wall standing: the room's light (the probes) and
    its picture in the floor are of the room as it is, whatever the
    camera has taken out of its own picture. A bake taken while a near
    wall was down for the camera lit the room another way than one
    taken with it standing, and which came first was a matter of when
    the camera glided in */
export const withWallsStanding = (draw: () => void) => {
  const down = [...wallsDown.values()];
  for (const f of down) layerOf(f, 0);
  try {
    draw();
  } finally {
    for (const f of down) layerOf(f, SHADOW_LAYER);
  }
};
