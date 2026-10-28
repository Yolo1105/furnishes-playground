import { toMetres } from "@furnishes/scene";
import type { Opening } from "./room-data";
import type { Point } from "./room-templates";
import { openingCentre } from "./room-health";
import { inward } from "./window-light";

/** a drape's stack, drawn back: a share of the window's width within
    bounds, m */
export const STACK = { share: 0.16, least: 0.3, most: 0.45 };
export const stackOf = (width: number) =>
  Math.min(STACK.most, Math.max(STACK.least, width * STACK.share));
/** how far into the room a drawn-back drape's waves reach from the
    wall, m: its track (Room3D's TRACK.drape) and the depth of its
    folds */
export const DRAPE_REACH = 0.17 + 0.08;

/** what stands on a room's floor, mm from its north-west corner */
export type Block = { x: number; y: number; w: number; d: number };

/**
 * Which of a window's two drawn-back drapes hang: the one on its left
 * as the room sees it (the window's own -x), then its right. One is
 * left off where a piece stands against the wall within the drape's
 * reach (a television's unit by the window, a cabinet, a plant), as it
 * would be in a home: hung, it fell through the piece.
 */
export const drapesFree = (
  r: { W: number; D: number; outline: readonly Point[] },
  o: Opening,
  /** how far the tracks run past the window each side, m */
  past: number,
  blocks: readonly Block[],
): [boolean, boolean] => {
  if (!blocks.length) return [true, true];
  const width = toMetres(o.width);
  const run = width + 2 * past;
  const stack = stackOf(width);
  const { centre, at } = openingCentre(r, o);
  const across = o.wall === "north" || o.wall === "south";
  // the window's middle on the wall's face, m from the room's corner
  const x = toMetres(across ? centre : at);
  const z = toMetres(across ? at : centre);
  // into the room, and along the wall as the window's own x runs
  const [nx, nz] = inward(o.wall);
  const [ux, uz] = [nz, -nx];
  const free = (side: -1 | 1) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const along of [side * (run / 2 - stack), (side * run) / 2])
      for (const into of [0, DRAPE_REACH]) {
        const px = x + along * ux + into * nx;
        const pz = z + along * uz + into * nz;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        z0 = Math.min(z0, pz);
        z1 = Math.max(z1, pz);
      }
    const gap = 0.01;
    return !blocks.some((b) => {
      const bx = toMetres(b.x);
      const bz = toMetres(b.y);
      return (
        bx < x1 - gap &&
        x0 + gap < bx + toMetres(b.w) &&
        bz < z1 - gap &&
        z0 + gap < bz + toMetres(b.d)
      );
    });
  };
  return [free(-1), free(1)];
};
