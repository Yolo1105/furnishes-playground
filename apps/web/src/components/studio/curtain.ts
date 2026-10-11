import { BufferGeometry, Float32BufferAttribute } from "three";
import { WOOD_M } from "./surface-paint";

/** a curtain's cloth, m: how deep a fold stands and how wide one is
    (a drawn-back panel's, and a sheer's finer ones), how much fuller
    the folds stand at the hem than at the rail, as cloth hangs, and the
    cloth's thickness */
export const CURTAIN = {
  fold: 0.05,
  pitch: 0.14,
  sheerFold: 0.025,
  sheerPitch: 0.08,
  flare: 1.35,
  cloth: 0.004,
};
/** the steps a fold is drawn in across, and the rows down the drop */
const STEPS = 8;
const ROWS = 6;

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
) => {
  const folds = Math.max(2, Math.round(width / pitch));
  const across = folds * STEPS;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const cols = across + 1;
  for (const face of [1, -1]) {
    const base = pos.length / 3;
    for (let r = 0; r <= ROWS; r++) {
      const down = r / ROWS;
      const y = -down * height;
      const depth = fold * (1 + (CURTAIN.flare - 1) * down);
      for (let i = 0; i <= across; i++) {
        const x = (i / across - 0.5) * width;
        const z =
          (depth / 2) * Math.sin((i / across) * folds * 2 * Math.PI) -
          (face < 0 ? CURTAIN.cloth : 0);
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
