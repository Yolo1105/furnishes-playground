"use client";

import type { Drape } from "./drape";
import { cloth, Draped, metal, type Part, Rod, Soft, Built } from "./finish";
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
export const CERAMICS = ["#eeeae2", "#d8cbb6", "#a9b8b0", "#3f3b38"] as const;
const COVERS = ["#6b3a32", "#3d4a5c", "#e2d9c6", "#6f7a63"] as const;

/** a throw, m: how wide it is, how far it falls down an outer side,
    how far it stops above a seat inside, its thickness, and its folds
    across it and how deep they are at the hem */
const THROW = {
  wide: 0.5,
  fall: 0.3,
  clear: 0.015,
  thick: 0.006,
  folds: 3,
  depth: 0.022,
};

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
  armTop,
  armRound,
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
  /** the seat cushions' top, and the arms' top and their edges' round, m */
  seatTop: number;
  armTop: number;
  armRound: number;
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
        // the throw: over the arm, a little down to the seat inside and
        // further down the outer side
        <Draped
          f={cloth(pick(TEXTILES, seed, 7))}
          at={[(throwSide * (w - arm)) / 2, armTop, 0.04]}
          shape={{
            over: arm,
            wide: THROW.wide,
            hang:
              throwSide > 0
                ? [armTop - seatTop - THROW.clear, THROW.fall]
                : [THROW.fall, armTop - seatTop - THROW.clear],
            round: armRound,
            thick: THROW.thick,
            puff: 0,
            ends: 0,
            folds: THROW.folds,
            depth: THROW.depth,
            seed,
          }}
        />
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

/** a bed's: a throw folded across its foot, over the duvet and down
    its sides */
export function BedTouches({
  duvet,
  top,
  at,
  seed,
}: {
  /** the duvet the throw lies over, and its mattress's top, m */
  duvet: Drape;
  top: number;
  /** the throw's middle along the bed, m */
  at: number;
  seed: number;
}) {
  // the duvet's surface as a support: its top at its edges, its sides
  // stood off by its thickness and its folds, puffed as it is
  const out = duvet.thick + duvet.depth;
  return (
    <Draped
      f={cloth(shade(pick(TEXTILES, seed, 2), 0.02))}
      at={[0, top + out, at]}
      shape={{
        over: duvet.over + 2 * out,
        wide: BED_THROW.wide,
        hang: [BED_THROW.fall, BED_THROW.fall],
        round: duvet.round + out,
        thick: BED_THROW.thick,
        puff: duvet.puff,
        ends: 0,
        folds: THROW.folds,
        depth: THROW.depth,
        seed,
      }}
    />
  );
}
/** a bed's throw, m: as wide as it is folded, how far it falls down the
    duvet's sides, and its thickness (folded double) */
const BED_THROW = { wide: 0.42, fall: 0.16, thick: 0.012 };

/** a television's cable: from behind the set across the console's top
    to its back edge, and down the back to the floor, where the TV point
    is; off to one side of the stand */
export function TvCable({
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
  const x = (wobble(seed, 21) > 0 ? 1 : -1) * w * 0.12;
  const f = metal(CORD, 0.6);
  const from = -d * 0.12 - 0.03;
  return (
    <group>
      <Rod
        f={f}
        at={[x, h + 0.004, (from - d / 2) / 2]}
        r={CABLE_R}
        h={Math.abs(from + d / 2)}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <Rod f={f} at={[x, h / 2, -d / 2 - CABLE_R]} r={CABLE_R} h={h} />
    </group>
  );
}
/** a cable's radius, m */
const CABLE_R = 0.0035;
/** a cable's or a cord's black */
const CORD = "#2a2928";

/** a garment left over a chair's back: a shirt or a cardigan, folded
    over the back board, falling further behind than in front; on one
    chair in four, by the chair's seed */
export const clothesOn = (seed: number) => wobble(seed, 13) > 0.5;
export function ChairClothes({
  w,
  h,
  d,
  back,
  seed,
}: {
  w: number;
  h: number;
  d: number;
  /** the back board's thickness, m */
  back: number;
  seed: number;
}) {
  return (
    <group position={[0, h, -d / 2 + 0.02]} rotation={[0, Math.PI / 2, 0]}>
      <Draped
        f={cloth(pick(TEXTILES, seed, 11))}
        at={[0, 0, wobble(seed, 12) * w * 0.15]}
        shape={{
          over: back,
          wide: Math.min(w * 0.8, GARMENT.wide),
          hang: [GARMENT.behind, GARMENT.front],
          round: back / 2,
          thick: GARMENT.thick,
          puff: 0,
          ends: 0,
          folds: GARMENT.folds,
          depth: GARMENT.depth,
          seed,
        }}
      />
    </group>
  );
}
/** a garment over a chair, m: as wide as it is folded, how far it falls
    behind the back and in front of it, its thickness and its folds */
const GARMENT = {
  wide: 0.4,
  behind: 0.38,
  front: 0.2,
  thick: 0.005,
  folds: 4,
  depth: 0.025,
};

/** a floor lamp's cord: from its base along the floor towards the wall
    behind it, where a socket is */
export function LampCord({ seed }: { seed: number }) {
  const len = 0.55 + 0.15 * wobble(seed, 1);
  const turn = 0.25 * wobble(seed, 2);
  return (
    <group rotation={[0, Math.PI + turn, 0]}>
      <Rod
        f={metal(CORD, 0.6)}
        at={[0, 0.004, len / 2 + 0.1]}
        r={CABLE_R}
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
