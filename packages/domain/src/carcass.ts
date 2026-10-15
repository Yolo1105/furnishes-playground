import { MARGIN, SHEET } from "./cutlist";
import { SYSTEM } from "./features";
import { partPrice } from "./price";
import {
  boundsOf,
  defaultGrain,
  freeId,
  PANEL_THICKNESS,
  panelSpec,
  sizeOf,
  type Axis,
  type Panel,
  type PanelKind,
  type Vec3,
} from "./panels";

/**
 * A carcass as panels: the body the studio draws for a storage piece
 * (a plinth, a bottom, a top, a back, a side at each end, a divider
 * between bays, shelves by the height, a door a bay when it has
 * doors), laid out at any size. This is the recipe made resizable:
 * opened as panels, a piece keeps this list and the person moves,
 * resizes, adds and takes away from it; the piece's size and its
 * price are then read from the panels.
 */

/** the plinth's height, mm, and how far its rail stands back */
export const PLINTH_MM = 60;
const PLINTH_BACK = 50;
/** a door's reveal to its opening, mm, each side */
const REVEAL = 3;

export type CarcassSpec = {
  width: number;
  depth: number;
  height: number;
  bays: number;
  doors: boolean;
  /** a designed piece's own choices (design.ts): the shelves a bay
      (else by the room inside it), how many bays from the left take a
      door when it has doors (else every one), how many bays after
      those take a drawer at their foot, and whether it stands on a
      plinth (else it does) */
  shelves?: number | undefined;
  doored?: number | undefined;
  drawers?: number | undefined;
  plinth?: boolean | undefined;
};

/** a back too big to cut from one sheet either way round, in strips
    one above another that each are: their heights, mm */
const backs = (w: number, h: number) => {
  const fits = (a: number, b: number) =>
    Math.max(a, b) <= SHEET.length - 2 * MARGIN &&
    Math.min(a, b) <= SHEET.width - 2 * MARGIN;
  // no strips help a back too wide for a sheet's length: the cut list
  // says it does not fit
  if (w > SHEET.length - 2 * MARGIN) return [h];
  let k = 1;
  while (!fits(w, h / k)) k += 1;
  return Array.from({ length: k }, () => h / k);
};

/** a drawer's front, mm tall */
export const DRAWER_MM = 160;

const make = (
  id: string,
  name: string,
  normal: Axis,
  length: number,
  width: number,
  position: Vec3,
  kind: PanelKind = "panel",
): Panel => ({
  id,
  name,
  normal,
  length: Math.round(length),
  width: Math.round(width),
  thickness: PANEL_THICKNESS,
  position: position.map((v) => Math.round(v)) as Vec3,
  grain: defaultGrain(length, width),
  kind,
});

/** how many shelves a bay takes by the room inside it, mm */
export const shelvesFor = (inner: number) =>
  inner > 1200 ? 3 : inner > 600 ? 1 : 0;

/** the carcass's panels in the piece's frame: x across the front, y up
    from the floor, z towards the viewer, the origin under the middle.
    The parts meet at joints and never stand in each other's space: the
    sides run the full height on the plinth, the bottom and the top
    span between them, the back stands between all four, a divider
    and a shelf stand between the bottom and the top; with doors the
    shelves stand back a thickness and the doors fill the front */
export const carcassPanels = ({
  width: w,
  depth: d,
  height: h,
  bays,
  doors,
  shelves: shelvesAsked,
  doored,
  drawers = 0,
  plinth = true,
}: CarcassSpec): Panel[] => {
  const T = PANEL_THICKNESS;
  const P = plinth ? PLINTH_MM : 0;
  const n = Math.max(1, Math.round(bays));
  const bayW = (w - T * (n + 1)) / n;
  const inner = h - P - 2 * T;
  const midY = P + T + inner / 2;
  const out: Panel[] = [
    ...(plinth
      ? [
          make("plinth", "Plinth", "z", w - 2 * T, PLINTH_MM, [
            0,
            PLINTH_MM / 2,
            d / 2 - PLINTH_BACK - T / 2,
          ]),
        ]
      : []),
    make("bottom", "Bottom", "y", w - 2 * T, d, [0, P + T / 2, 0]),
    make("top", "Top", "y", w - 2 * T, d, [0, h - T / 2, 0]),
    ...backs(w - 2 * T, inner).map((h, j, all) =>
      make(all.length > 1 ? `back-${j}` : "back", "Back", "z", w - 2 * T, h, [
        0,
        P + T + h * (j + 0.5),
        -d / 2 + T / 2,
      ]),
    ),
    make("side-west", "Side", "x", d, h - P, [
      -w / 2 + T / 2,
      P + (h - P) / 2,
      0,
    ]),
    make("side-east", "Side", "x", d, h - P, [
      w / 2 - T / 2,
      P + (h - P) / 2,
      0,
    ]),
  ];
  const doorBays = doors ? Math.min(n, doored ?? n) : 0;
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + T + i * (bayW + T);
    const mid = x0 + bayW / 2;
    const door = i < doorBays;
    const drawer = !door && i >= doorBays && i < doorBays + drawers;
    if (i > 0)
      out.push(
        make(`divider-${i}`, "Divider", "x", d - T, inner, [
          x0 - T / 2,
          midY,
          T / 2,
        ]),
      );
    // a drawer at the bay's foot: its front, and the runner shelf over
    // the box, the rest of the bay over it
    const floor = P + T + (drawer ? DRAWER_MM + T : 0);
    const room = h - T - floor;
    if (drawer)
      out.push(
        make(
          `drawer-${i}`,
          "Drawer front",
          "z",
          bayW - 2 * REVEAL,
          DRAWER_MM - 2 * REVEAL,
          [mid, P + T + DRAWER_MM / 2, d / 2 - T / 2],
          "door",
        ),
        make(`runner-${i}`, "Shelf", "y", bayW, d - 2 * T, [
          mid,
          P + T + DRAWER_MM + T / 2,
          0,
        ]),
      );
    const shelves = shelvesAsked ?? shelvesFor(inner);
    // a shelf runs from the back to the front, or to the door; its
    // height on the 32 mm system's step up from the floor of its bay
    const shelfD = door || drawer ? d - 2 * T : d - T;
    const shelfZ = door || drawer ? 0 : T / 2;
    for (let k = 0; k < shelves; k++) {
      const at =
        floor +
        Math.round(((k + 1) * room) / (shelves + 1) / SYSTEM.pitch) *
          SYSTEM.pitch;
      out.push(
        make(`shelf-${i}-${k}`, "Shelf", "y", bayW, shelfD, [mid, at, shelfZ]),
      );
    }
    if (door)
      out.push(
        make(
          `door-${i}`,
          "Door",
          "z",
          bayW - 2 * REVEAL,
          inner - 2 * REVEAL,
          [mid, midY, d / 2 - T / 2],
          "door",
        ),
      );
  }
  return out;
};

/** the panels brought to the piece's frame: the box round them
    centred across and in depth, standing on the floor; and the size
    that box is, mm */
export const settledPanels = (
  panels: readonly Panel[],
): { panels: Panel[]; width: number; depth: number; height: number } => {
  const b = boundsOf(panels);
  if (!b) return { panels: [], width: 0, depth: 0, height: 0 };
  const dx = (b.min[0] + b.max[0]) / 2;
  const dy = b.min[1];
  const dz = (b.min[2] + b.max[2]) / 2;
  return {
    panels: panels.map((p) => ({
      ...p,
      position: [
        p.position[0] - dx,
        p.position[1] - dy,
        p.position[2] - dz,
      ] as Vec3,
    })),
    ...sizeOf(b),
  };
};

/** what a piece of these panels would cost, S$: each panel priced as
    the part it is, from the one table of rates, an estimate */
export const priceOfPanels = (panels: readonly Panel[]) =>
  panels.reduce((t, p) => t + partPrice(p.kind, panelSpec(p)), 0);

/** what can be added to a piece's panels by a press */
export type Added = "shelf" | "divider" | "door" | "back";

/** one more panel for the piece, sized to the box round its panels:
    a shelf across the inside at mid height, a divider up the middle,
    a door over the front, a back behind; its id the first free one
    of its kind */
export const newPanel = (panels: readonly Panel[], kind: Added): Panel => {
  const T = PANEL_THICKNESS;
  const b = boundsOf(panels) ?? {
    min: [-300, 0, -200] as Vec3,
    max: [300, 900, 200] as Vec3,
  };
  const w = b.max[0] - b.min[0];
  const d = b.max[2] - b.min[2];
  const h = b.max[1] - b.min[1];
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  const inner = Math.max(T, h - PLINTH_MM - 2 * T);
  const midY = b.min[1] + PLINTH_MM + T + inner / 2;
  const id = freeId(panels, kind);
  switch (kind) {
    case "shelf":
      return make(id, "Shelf", "y", w - 2 * T, d - T, [cx, midY, cz + T / 2]);
    case "divider":
      return make(id, "Divider", "x", d - T, inner, [cx, midY, cz + T / 2]);
    case "door":
      return make(
        id,
        "Door",
        "z",
        w - 2 * T - 2 * REVEAL,
        inner - 2 * REVEAL,
        [cx, midY, cz + d / 2 - T / 2],
        "door",
      );
    case "back":
      return make(id, "Back", "z", w - 2 * T, inner, [
        cx,
        midY,
        cz - d / 2 + T / 2,
      ]);
  }
};
