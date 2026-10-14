"use client";

import { cloth, metal, type Part, Rod, Soft, Built } from "./finish";
import { shade } from "./textures";
import type { ReactNode } from "react";

/**
 * The touches a lived-in room has and a showroom does not (the View
 * settings' Tidy or Lived-in): cushions thrown into a sofa's corners and
 * a throw over its arm, a mug, a book and the remote on the coffee
 * table, a bowl on the dining table, a throw folded at a bed's foot, a
 * lamp's cord running off to the wall. Each sits on its own piece and
 * moves with it, so nothing stands in a walkway or in front of a
 * product, a few to a piece, chosen and placed by the piece's seed so a
 * flat looks the same on every load. Plain shapes from the finishes the
 * room already draws with (no new shader, no file to load).
 */

/** the textile colours the touches are picked from: muted, as a room's
    cushions and throws are, never a primary */
const TEXTILES = [
  "#b5654f", // terracotta
  "#8e9a7f", // sage
  "#d9c7a7", // oat
  "#5d6b7d", // slate
  "#c9a24f", // mustard
  "#a9878f", // rose-grey
] as const;
const CERAMICS = ["#eeeae2", "#d8cbb6", "#a9b8b0", "#3f3b38"] as const;
const COVERS = ["#6b3a32", "#3d4a5c", "#e2d9c6", "#6f7a63"] as const;

/** a seeded pick, the same each time for the same seed and slot */
const pick = <T,>(xs: readonly T[], seed: number, slot: number): T =>
  xs[Math.abs((seed * 31 + slot * 17) >>> 0) % xs.length]!;
/** a seeded number in -1..1 */
const wobble = (seed: number, slot: number) =>
  ((((seed * 9301 + slot * 49297) >>> 0) % 233280) / 233280) * 2 - 1;

/** a sofa's or an armchair's: a cushion in each back corner, leaning
    on the back and the arm, and on a sofa a throw over one arm */
export function SeatTouches({
  w,
  d,
  seatTop,
  arm,
  back,
  seats,
  seed,
  cushions = null,
}: {
  w: number;
  d: number;
  /** the real cushions drawn in place of the built ones, when listed */
  cushions?: ReactNode;
  /** the seat cushions' top, m */
  seatTop: number;
  /** the arm's width and the back's depth, m */
  arm: number;
  back: number;
  seats: number;
  seed: number;
}) {
  const c = 0.42;
  const corners = seats > 1 ? [-1, 1] : [wobble(seed, 1) > 0 ? 1 : -1];
  const throwSide = wobble(seed, 2) > 0 ? 1 : -1;
  return (
    <group>
      {cushions ??
        corners.map((s, i) => (
          <Soft
            key={s}
            f={cloth(pick(TEXTILES, seed, i))}
            at={[
              s * (w / 2 - arm - c / 2 + 0.03),
              seatTop + c / 2 - 0.04,
              -d / 2 + back + 0.1,
            ]}
            dims={[c, c, 0.13]}
            radius={0.06}
            rotation={[-0.32, s * (0.3 + 0.08 * wobble(seed, 3 + i)), s * 0.12]}
          />
        ))}
      {seats > 1 && (
        // the throw: over the arm's top and down its outer side
        <group position={[throwSide * (w / 2 - arm / 2), 0, 0.04]}>
          <Soft
            f={cloth(pick(TEXTILES, seed, 7))}
            at={[0, seatTop + 0.2, 0]}
            dims={[arm + 0.03, 0.025, 0.5]}
            radius={0.012}
          />
          <Soft
            f={cloth(pick(TEXTILES, seed, 7))}
            at={[throwSide * (arm / 2 + 0.008), seatTop + 0.02, 0]}
            dims={[0.02, 0.36, 0.5]}
            radius={0.01}
          />
        </group>
      )}
    </group>
  );
}

/** a coffee table's: a mug, two books stacked and the remote; a dining
    table's: a bowl in its middle */
export function TableTouches({
  w,
  h,
  d,
  coffee,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  coffee: boolean;
  seed: number;
}) {
  if (!coffee) {
    // a wide, low bowl, its rim wider than its foot
    return (
      <Built
        parts={[
          {
            f: { colour: pick(CERAMICS, seed, 1), rough: 0.35, coat: 0.3 },
            at: [
              wobble(seed, 1) * w * 0.08,
              h + 0.04,
              wobble(seed, 2) * d * 0.08,
            ],
            rod: [0.07, 0.08, 0.14],
          },
        ]}
      />
    );
  }
  const sx = wobble(seed, 4) > 0 ? 1 : -1;
  const books: Part[] = [0, 1].map((i) => ({
    f: { colour: pick(COVERS, seed, 5 + i), rough: 0.7 },
    at: [sx * w * 0.22, h + 0.012 + i * 0.024, -d * 0.12],
    dims: [0.24 - i * 0.03, 0.022, 0.17 - i * 0.02],
    rotation: [0, wobble(seed, 6 + i) * 0.35, 0],
  }));
  return (
    <Built
      parts={[
        ...books,
        // the mug and its handle
        {
          f: { colour: pick(CERAMICS, seed, 9), rough: 0.3, coat: 0.3 },
          at: [-sx * w * 0.2, h + 0.045, d * 0.15],
          rod: [0.04, 0.09],
        },
        {
          f: { colour: pick(CERAMICS, seed, 9), rough: 0.3, coat: 0.3 },
          at: [-sx * w * 0.2 + 0.05, h + 0.045, d * 0.15],
          dims: [0.014, 0.05, 0.012],
        },
        // the remote, at a slant
        {
          f: { colour: "#262524", rough: 0.45 },
          at: [sx * w * 0.02, h + 0.009, d * 0.2],
          dims: [0.05, 0.018, 0.17],
          rotation: [0, 0.4 + wobble(seed, 11) * 0.3, 0],
        },
      ]}
    />
  );
}

/** a bed's: a throw folded across its foot */
export function BedTouches({
  w,
  d,
  top,
  seed,
}: {
  w: number;
  d: number;
  /** the duvet's top, m */
  top: number;
  seed: number;
}) {
  return (
    <Soft
      f={cloth(shade(pick(TEXTILES, seed, 2), 0.02))}
      at={[0, top + 0.02, d / 2 - 0.3]}
      dims={[w - 0.06, 0.04, 0.42]}
      radius={0.02}
    />
  );
}

/** a floor lamp's cord: from its base along the floor towards the wall
    behind it, where a socket is */
export function LampCord({ seed }: { seed: number }) {
  const len = 0.55 + 0.15 * wobble(seed, 1);
  const turn = 0.25 * wobble(seed, 2);
  return (
    <group rotation={[0, Math.PI + turn, 0]}>
      <Rod
        f={metal("#2a2928", 0.6)}
        at={[0, 0.004, len / 2 + 0.1]}
        r={0.0035}
        h={len}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

/** a dining chair pulled out from its table and turned a little, as
    chairs are left: by the chair's seed, 5–10° and 40–90 mm back */
export const chairPose = (seed: number) => {
  const turn = (5 + 5 * Math.abs(wobble(seed, 1))) * (Math.PI / 180);
  return {
    rotation: turn * (wobble(seed, 2) > 0 ? 1 : -1),
    back: 0.04 + 0.05 * Math.abs(wobble(seed, 3)),
  };
};
