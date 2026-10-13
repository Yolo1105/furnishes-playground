import { BufferGeometry, Float32BufferAttribute } from "three";
import { WOOD_M } from "./surface-paint";

/** a curtain's cloth, m: how deep a fold stands and how wide one is
    (a drawn-back panel's, and a sheer's finer ones), how much fuller
    the folds stand at the hem than at the rail, as cloth hangs, and the
    cloth's thickness */
export const CURTAIN = {
  fold: 0.05,
  pitch: 0.1,
  sheerFold: 0.014,
  sheerPitch: 0.07,
  flare: 1.35,
  cloth: 0.004,
  /** the pinch pleats at the head: how far down they run (a share of
      the drop) and how much flatter the folds stand there */
  pinch: 0.08,
  pinched: 0.45,
  /** how unevenly the folds fall, a share of their depth and pitch */
  uneven: 0.18,
  /** the hem: how deep it is and how much thicker it hangs */
  hem: 0.06,
};
/** the steps a fold is drawn in across, and the rows down the drop */
const STEPS = 8;
const ROWS = 12;

/**
 * A curtain drawn back to one side of a window: a panel `width` wide
 * and `height` tall from its rail, hanging in folds a pitch apart that
 * stand fuller towards the hem. Both faces are built, each with its own
 * normals (the front's towards the room, the back's towards the glass),
 * so one material draws it from either side. Its UVs lie in the wood
 * tiles a grain is laid in (`WOOD_M`), so the weave keeps its size
 * whatever the curtain's; it carries white vertex colours, as a soft
 * block does, so the cloth is the one shader the cushions built.
 */
export const curtainGeometry = (
  width: number,
  height: number,
  fold = CURTAIN.fold,
  pitch = CURTAIN.pitch,
  /** each window's panels hang their own way */
  seed = 1,
  /** both faces (a lined curtain), or the front alone (a sheer, drawn
      from both sides by its material: two layers of a see-through cloth
      doubled where the folds overlapped, a stripe each fold) */
  faces: 1 | 2 = 2,
) => {
  const folds = Math.max(2, Math.round(width / pitch));
  const across = folds * STEPS;
  // each fold a little deeper or shallower than the next, the same every
  // time for the same seed
  let n = seed >>> 0 || 1;
  const depthOf = Array.from({ length: folds + 1 }, () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return 1 + CURTAIN.uneven * ((n / 4294967296) * 2 - 1);
  });
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const cols = across + 1;
  /** the front face's depth at row `r`, step `i` */
  const frontZ = (r: number, i: number) => {
    const down = r / ROWS;
    // flatter where the pleats pinch it at the head, fuller to the hem
    const pinched =
      down < CURTAIN.pinch
        ? CURTAIN.pinched + (1 - CURTAIN.pinched) * (down / CURTAIN.pinch)
        : 1;
    const depth = fold * pinched * (1 + (CURTAIN.flare - 1) * down);
    const c = Math.max(0, Math.min(across, i));
    const f = (c / across) * folds;
    const k = Math.min(folds, Math.floor(f));
    return (depth / 2) * depthOf[k]! * Math.sin(f * 2 * Math.PI);
  };
  const dx = width / across;
  for (const face of faces === 2 ? [1, -1] : [1]) {
    const base = pos.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      const down = r / ROWS;
      const y = -down * height;
      // the hem hangs a little thicker
      const cloth =
        CURTAIN.cloth *
        (down > 1 - CURTAIN.hem / Math.max(height, 0.1) ? 2.5 : 1);
      for (let i = 0; i <= across; i++) {
        let x = (i / across - 0.5) * width;
        let z = frontZ(r, i);
        if (face < 0) {
          // the back lies a cloth's thickness behind the front along its
          // normal, not straight back: straight back, it stood in front
          // of the front on a fold's steep side and showed as a bright
          // sliver down each fold
          const slope = (frontZ(r, i + 1) - frontZ(r, i - 1)) / (2 * dx);
          const len = Math.hypot(slope, 1);
          // and never past the panel's own edges
          x = Math.max(
            -width / 2,
            Math.min(width / 2, x + (cloth * slope) / len),
          );
          z -= cloth / len;
        }
        pos.push(x, y, z);
        uv.push((x + width / 2) / WOOD_M, -y / WOOD_M);
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
