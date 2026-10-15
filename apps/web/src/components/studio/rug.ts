import { BufferGeometry, Float32BufferAttribute } from "three";
import { FOOT_HEIGHT, withBakeDefaults } from "./bake-defaults";
import { seeded, within } from "./seeded";
import { CLOTH_M, WOOD_M } from "./textures";

/**
 * A rug as it lies on a floor (round 8, Part 5): its pile, its edge
 * rolled down to the floor, a woven band round its border with a fine
 * line each side of it, and a soft shadow on the floor where its edge
 * meets it. One sheet over the floor in the rug's colour, the band and
 * its lines in the sheet's vertex tones (so they cost no texture and
 * stay sharp at any distance), its weave the cloth's own maps laid at
 * a pile's scale; the shadow a ring of its own. Plain geometry, kept
 * by size, so it is tested here.
 */

/** the rug's thickness, and the round its edge rolls down by, m; its
    very edge a hair over the floor and over its shadow there, so the
    two never fight for a pixel */
export const RUG_H = 0.012;
const LIFT = 2 * FOOT_HEIGHT;
/** the border band's width, the lines' width, how far in from the
    band's sides they lie, and the tones, m and shares of the field's */
export const RUG_BAND = { wide: 0.09, line: 0.008, inset: 0.012 };
const TONE = { band: 0.74, line: 1.12, edge: 0.62 };
/** the pile's weave repeats this often, m (the cloth's maps tile
    CLOTH_M over a part laid in wood tiles) */
const PILE_M = 0.15;
/** the steps across the field, and the steps in the rolled edge, m */
const STEP = 0.06;
const ROLL_STEPS = 4;
/** the pile's faint mottle: how much, and how large a patch, m */
const MOTTLE = 0.03;
const PATCH = 0.4;
/** the shadow on the floor round the rug: how far it reaches, m, and
    how dark it is at the rug's edge */
export const RUG_CONTACT = { reach: 0.035, dark: 0.35 };

/** the samples across one side, from −half to +half: dense in the
    rolled edge and at the band's and its lines' sides, even between */
const samples = (half: number) => {
  const from: number[] = [];
  for (let k = 0; k <= ROLL_STEPS; k++) from.push((RUG_H * k) / ROLL_STEPS);
  const { wide, line, inset } = RUG_BAND;
  // each tone's change made sharp: a sample a hair either side of it
  for (const e of [
    inset,
    inset + line,
    wide - inset - line,
    wide - inset,
    wide,
  ])
    if (e < half) from.push(e - 0.0005, e + 0.0005);
  const inner = Math.max(wide + 0.001, half);
  const n = Math.max(1, Math.ceil((inner - wide) / STEP));
  for (let k = 1; k <= n; k++)
    from.push(Math.min(half, wide + ((half - wide) * k) / n));
  const fromEdge = [
    ...new Set(from.filter((e) => e <= half).map((e) => +e.toFixed(5))),
  ].sort((a, b) => a - b);
  // the edge's samples, then the far edge's mirrored
  const out = fromEdge.map((e) => -half + e);
  for (const e of [...fromEdge].reverse())
    if (half - e > out[out.length - 1]! + 1e-6) out.push(half - e);
  return out;
};

/** the tone at a point `e` in from the nearest edge */
const toneAt = (e: number) => {
  const { wide, line, inset } = RUG_BAND;
  if (e < RUG_H) return TONE.edge + (TONE.band - TONE.edge) * (e / RUG_H);
  if (e > wide) return 1;
  const onLine = (a: number) => e >= a && e <= a + line;
  return onLine(inset) || onLine(wide - inset - line)
    ? TONE.band * TONE.line
    : TONE.band;
};

const rugs = new Map<string, BufferGeometry>();
const KEPT = 8;

export const rugGeometry = (w: number, d: number, seed: number) => {
  const key = `${w},${d},${seed}`;
  const had = rugs.get(key);
  if (had) return had;
  const xs = samples(w / 2);
  const zs = samples(d / 2);
  const next = seeded(seed * 2971 + 5);
  // the mottle: a few soft patches, each its own place and sign
  const patches = Array.from({ length: 6 }, () => ({
    x: within(next(), [-w / 2, w / 2]),
    z: within(next(), [-d / 2, d / 2]),
    s: next() < 0.5 ? -1 : 1,
  }));
  const pos: number[] = [];
  const uv: number[] = [];
  const tone: number[] = [];
  const pile = CLOTH_M / PILE_M / WOOD_M;
  for (const z of zs)
    for (const x of xs) {
      const e = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
      // the edge rolled down to the floor on a quarter round
      const t = Math.min(1, Math.max(0, e / RUG_H));
      const y = LIFT + (RUG_H - LIFT) * Math.sqrt(1 - (1 - t) * (1 - t));
      pos.push(x, y, z);
      uv.push((x + w / 2) * pile, (z + d / 2) * pile);
      let k = toneAt(Math.max(0, e));
      if (e > RUG_BAND.wide)
        for (const p of patches)
          k *=
            1 +
            p.s *
              MOTTLE *
              Math.exp(-((x - p.x) ** 2 + (z - p.z) ** 2) / (PATCH * PATCH));
      tone.push(k, k, k);
    }
  const nx = xs.length;
  const index: number[] = [];
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const q = j * nx + i;
      // wound so its face looks up
      index.push(q, q + nx, q + 1, q + 1, q + nx, q + nx + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(tone, 3));
  g.setAttribute(
    "ply",
    new Float32BufferAttribute(new Float32Array(pos.length), 3),
  );
  g.setIndex(index);
  g.computeVertexNormals();
  withBakeDefaults(g);
  if (rugs.size >= KEPT) {
    const oldest = rugs.keys().next().value!;
    rugs.get(oldest)!.dispose();
    rugs.delete(oldest);
  }
  rugs.set(key, g);
  return g;
};

/** the rug's shadow on the floor: a ring from its edge out, dark at the
    edge and gone at its reach, its darkness in `shade` */
export const rugContactGeometry = (w: number, d: number) => {
  const r = RUG_CONTACT.reach;
  const ring = (grow: number) => [
    [-w / 2 - grow, -d / 2 - grow],
    [w / 2 + grow, -d / 2 - grow],
    [w / 2 + grow, d / 2 + grow],
    [-w / 2 - grow, d / 2 + grow],
  ];
  const pos: number[] = [];
  const shade: number[] = [];
  for (const [x, z] of ring(0)) {
    pos.push(x!, FOOT_HEIGHT, z!);
    shade.push(RUG_CONTACT.dark);
  }
  for (const [x, z] of ring(r)) {
    pos.push(x!, FOOT_HEIGHT, z!);
    shade.push(0);
  }
  // each side a quad from the edge (0–3) to the reach (4–7), looking up
  const index: number[] = [];
  for (let k = 0; k < 4; k++) {
    const a = k;
    const b = (k + 1) % 4;
    index.push(a, b, a + 4, b, b + 4, a + 4);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("shade", new Float32BufferAttribute(shade, 1));
  g.setIndex(index);
  return g;
};
