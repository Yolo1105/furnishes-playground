import { BufferGeometry, Float32BufferAttribute } from "three";
import { WOOD_M } from "./surface-paint";
import { seeded } from "./seeded";

/** a curtain's cloth, m: wave folds (a ripple-fold heading on a ceiling
    track), each wave a pitch from crest to crest and as deep as the
    cloth's fullness makes it (the cloth's width over the width it
    hangs across: 2 is a 100 % fullness wave); a drawn-back drape's
    cloth gathered fuller into its stack; how much fuller the waves
    stand at the hem than at the head, as cloth hangs; and the cloth's
    thickness */
export const CURTAIN = {
  pitch: 0.1,
  fullness: 2,
  /** a drape drawn back: its cloth stacked tighter and deeper */
  stackPitch: 0.09,
  stackFullness: 2.6,
  flare: 1.08,
  cloth: 0.004,
  /** how unevenly the waves fall, a share of their depth */
  uneven: 0.12,
  /** the hem: how deep it is and how much thicker it hangs */
  hem: 0.06,
};
/** the steps a wave is drawn in across, and the rows down the drop */
const STEPS = 12;
const ROWS = 12;

/** a sine wave's length over its pitch, at `k` = 2 pi amplitude / pitch */
const lengthRatio = (k: number) => {
  // the mean of sqrt(1 + k^2 cos^2) over a period, by the midpoint rule
  const n = 256;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const c = Math.cos(((i + 0.5) / n) * 2 * Math.PI);
    s += Math.sqrt(1 + k * k * c * c);
  }
  return s / n;
};
/**
 * The half-depth of a sine wave `pitch` long whose cloth runs
 * `fullness` times the width it crosses: 2x at a 0.1 m pitch stands
 * about 0.039 m either side of its middle, a wave 8 cm deep, as a
 * ripple-fold sheer hangs.
 */
export const waveAmplitude = (pitch: number, fullness: number) => {
  if (fullness <= 1) return 0;
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (lengthRatio(mid) < fullness) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2 / (2 * Math.PI)) * pitch;
};

/**
 * A curtain hanging in wave folds from its track, `width` across and
 * `height` down: whole waves, a pitch near the one asked for apart, as
 * deep as the cloth's fullness makes them, standing a little fuller
 * towards the hem. The waves are the geometry, so the side of each that
 * faces the window catches its light and the side that faces the room
 * its shade, whichever way it is lit. Both faces are built for a lined
 * drape, each with its own normals (the front's towards the room, the
 * back's towards the glass); a sheer has the front alone, drawn from
 * both sides by its material. The weave's UVs run along the cloth (its
 * length round the waves), in the wood tiles a grain is laid in
 * (`WOOD_M`), so the weave keeps its size on a wave's steep side; it
 * carries white vertex colours, as a soft block does, so the cloth is
 * the one shader the cushions built.
 */
export const curtainGeometry = (
  width: number,
  height: number,
  {
    pitch = CURTAIN.pitch,
    fullness = CURTAIN.fullness,
    seed = 1,
    faces = 2,
  }: {
    pitch?: number;
    fullness?: number;
    /** each window's curtains hang their own way */
    seed?: number;
    /** both faces (a lined drape), or the front alone (a sheer) */
    faces?: 1 | 2;
  } = {},
) => {
  const waves = Math.max(2, Math.round(width / pitch));
  const amplitude = waveAmplitude(width / waves, fullness);
  const across = waves * STEPS;
  // each wave a little deeper or shallower than the next, the same every
  // time for the same seed
  const next = seeded(seed);
  const depthOf = Array.from(
    { length: waves + 1 },
    () => 1 + CURTAIN.uneven * (next() * 2 - 1),
  );
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const cols = across + 1;
  const dx = width / across;
  /** the front face's depth at row `r`, step `i` */
  const frontZ = (r: number, i: number) => {
    const down = r / ROWS;
    const c = Math.max(0, Math.min(across, i));
    const f = c / STEPS;
    const k = Math.min(waves, Math.floor(f));
    return (
      amplitude *
      (1 + (CURTAIN.flare - 1) * down) *
      depthOf[k]! *
      Math.sin(f * 2 * Math.PI)
    );
  };
  for (const face of faces === 2 ? [1, -1] : [1]) {
    const base = pos.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      const down = r / ROWS;
      const y = -down * height;
      // the hem hangs a little thicker
      const cloth =
        CURTAIN.cloth *
        (down > 1 - CURTAIN.hem / Math.max(height, 0.1) ? 2.5 : 1);
      // the cloth's length along the row so far
      let run = 0;
      for (let i = 0; i <= across; i++) {
        if (i > 0) run += Math.hypot(dx, frontZ(r, i) - frontZ(r, i - 1));
        let x = (i / across - 0.5) * width;
        let z = frontZ(r, i);
        if (face < 0) {
          // the back lies a cloth's thickness behind the front along its
          // normal, not straight back: straight back, it stood in front
          // of the front on a wave's steep side and showed as a bright
          // sliver down each wave
          const slope = (frontZ(r, i + 1) - frontZ(r, i - 1)) / (2 * dx);
          const len = Math.hypot(slope, 1);
          // and never past the curtain's own edges
          x = Math.max(
            -width / 2,
            Math.min(width / 2, x + (cloth * slope) / len),
          );
          z -= cloth / len;
        }
        pos.push(x, y, z);
        uv.push(run / WOOD_M, -y / WOOD_M);
      }
    }
    for (let r = 0; r < ROWS; r++)
      for (let i = 0; i < across; i++) {
        const a = base + r * cols + i;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        // the front faces the room (+z), the back the glass
        if (face > 0) index.push(a, c, b, b, c, d);
        else index.push(a, b, c, b, d, c);
      }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute(
    "color",
    new Float32BufferAttribute(new Array<number>(pos.length).fill(1), 3),
  );
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
};
