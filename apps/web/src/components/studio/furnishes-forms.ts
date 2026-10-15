import type { Product } from "@furnishes/domain";
import { seeded } from "./seeded";

/**
 * The Furnishes pieces in 3D, built as the assembly record builds them
 * (packages/domain parts.ts) and not as one carcass at thirteen sizes.
 * Every piece shares one language, so the thirteen read as a family:
 *
 *   - 18 mm birch panels, their edges showing;
 *   - a body is bays 600 wide, each with its own two sides, so a long
 *     piece shows a doubled side where two bays meet; the stacked
 *     pieces' sides are a panel a 400 mm tier, the joints showing,
 *     the full-height pieces' one panel up;
 *   - the back is the functional panel, a panel a tier; on the
 *     bookwall it stands in the middle, with shelves either side;
 *   - a base under every bay, darker, the body set a hand's width in
 *     on it, two orange marks on its front (the house's connectors):
 *     a foot base for a piece that stays, a caster base on four black
 *     castors for one that moves;
 *   - a door is a panel over a bay with a finger pull, never a bar.
 *
 * What tells one from another is what each is for, as its record
 * builds it and as it is used: the entry organiser's shoe shelf low
 * and a narrow shelf set back, hooks with bags under it; the
 * desk-side organiser's two shelves with files and its holed
 * functional panel; the coat stand's low shelf and the open height
 * over it with a rail of coats; the mobile screen's closed face; the
 * bookwall's books both sides of its middle panel; the workstation's
 * tower with the desk across its front on a panel leg; the folding
 * screen's three leaves at their fold; the kitchen trolley's board
 * and jars and its rail; the work cart's bins and handle; the island's
 * two bodies under one top; the bench's seat over baskets. The add-ons
 * chosen for it (the Detail tab's Customise) are drawn where they go:
 * hooks, the tray, the utility hook, the rails, the charging dock.
 *
 * Plain data, in metres in the piece's frame (x across, y up from the
 * floor, z to the front, about the middle of its box), so the forms
 * are tested here and drawn by Furniture3D.
 */

/** what a part is made of; Furniture3D gives each its finish */
export type Role =
  /** the piece's own panels, in its colour (or its bay's) */
  | "body"
  /** the base under the body, a darker tone of it */
  | "base"
  /** the house's orange: connectors, hooks, a hinge */
  | "accent"
  /** a rail, a stem */
  | "metal"
  /** a castor's wheel, a finger pull's shadow, a screen */
  | "dark"
  /** a bag, a coat, a towel: soft, in its own colour */
  | "cloth"
  /** a box, a file, a jar, a shoe: matte, in its own colour */
  | "thing";

type V3 = [number, number, number];
export type FormPart = {
  role: Role;
  at: V3;
  colour?: string | undefined;
  rotation?: V3 | undefined;
  /** what a board is to the carcass's hardware: a shelf on pins, or a
      bottom fixed to its sides with cam locks */
  hw?: "shelf" | "joint" | undefined;
  /** a small detail drawn on the desktop tier alone (a shelf pin) */
  detail?: true | undefined;
} & ({ dims: V3 } | { rod: [number, number, number?] });

/** a shelf's run of books: from x0 along bayW, standing on y, centred
    at z in depth and as deep as deep, with room above */
export type BookRun = {
  x0: number;
  y: number;
  bayW: number;
  z: number;
  deep: number;
  room: number;
  seed: number;
};

/** a door's front face: its middle and its width and height, for a
    mirror finish to lay a reflector on */
export type DoorFace = { at: V3; size: [number, number] };

export type FurnishesForm = {
  parts: FormPart[];
  books: BookRun[];
  doors: DoorFace[];
};

export type FormInput = {
  recipe: Pick<
    Product,
    "id" | "shape" | "family" | "bays" | "tiers" | "height" | "door"
  >;
  /** width, height, depth, m */
  size: V3;
  doors: boolean;
  accessories: readonly string[];
  /** a colour a bay (a piece of parts), else the piece's own */
  colours: readonly string[];
  seed: number;
};

/** a panel, m */
const T = 0.018;
/** a base plate's thickness; the foot base stands on pads under it, the
    caster base on its castors (baseZ in the record: 30 and 85 mm) */
const PLATE = 0.028;
const FOOT = 0.03;
const CASTOR = 0.085;
/** how far a body stands in from its base's edge, each side */
const INSET = 0.012;
/** a tier of the stacked bodies, as the record has it */
const TIER = 0.4;
/** a door's gap to its neighbours and the carcass, a shadow line */
const GAP = 0.002;
/** how far the back panel stands in from the sides' back edges */
const RECESS = 0.006;
/** a shelf pin: its radius, how far it stands out of the side, and how
    far in from the shelf's front and back it sits */
const PIN = { r: 0.0025, out: 0.006, inset: 0.035 };
/** a cam lock's cap on a fixed board's face: its radius and how far in
    from the side and the edges it sits */
const CAM = { r: 0.0075, h: 0.0012, inset: 0.034, colour: "#ddd6ca" };

/** the things a piece holds, in a few quiet tones and the house's
    orange, so a furnished room does not turn into a shop window */
export const THINGS = {
  charcoal: "#3f3b38",
  clay: "#c4673a",
  sage: "#8e9a7f",
  cream: "#e8e0d0",
  leather: "#6e4b36",
  stone: "#b9b2a6",
} as const;

const slab = (
  role: Role,
  at: V3,
  dims: V3,
  colour?: string,
  rotation?: V3,
): FormPart => ({
  role,
  at,
  dims,
  ...(colour ? { colour } : {}),
  ...(rotation ? { rotation } : {}),
});
const rod = (
  role: Role,
  at: V3,
  r: number,
  h: number,
  rotation?: V3,
  colour?: string,
): FormPart => ({
  role,
  at,
  rod: [r, h],
  ...(rotation ? { rotation } : {}),
  ...(colour ? { colour } : {}),
});

/** the box a bay's body fills, m */
type Bay = {
  /** middle across */
  x: number;
  /** outer width, side to side */
  w: number;
  /** the bottom's underside and the top's underside */
  y0: number;
  y1: number;
  /** depth, front to back, about z0 */
  d: number;
  z0: number;
  colour: string;
};

/** the base under a run of bays, the whole footprint: a foot base on
    its pads, or a caster base on four castors a bay */
function base(
  out: FormPart[],
  w: number,
  d: number,
  bays: number,
  mobile: boolean,
) {
  const top = mobile ? CASTOR : FOOT;
  out.push(slab("base", [0, top - PLATE / 2, 0], [w, PLATE, d]));
  // the connectors' marks on its front, either end
  for (const s of [-1, 1])
    out.push(
      slab(
        "accent",
        [s * (w / 2 - 0.05), top - PLATE / 2, d / 2 + 0.001],
        [0.034, 0.008, 0.002],
      ),
    );
  const bw = w / bays;
  for (let i = 0; i < bays; i++) {
    const cx = -w / 2 + bw * (i + 0.5);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = cx + sx * (bw / 2 - 0.05);
        const z = sz * (d / 2 - 0.05);
        if (mobile) {
          // the wheel on its side, and the swivel over it
          out.push(
            rod("dark", [x, 0.03, z], 0.03, 0.026, [0, 0, Math.PI / 2]),
            rod(
              "metal",
              [x, 0.06 + (top - PLATE - 0.06) / 2, z],
              0.014,
              top - PLATE - 0.06,
            ),
          );
        } else
          out.push(rod("dark", [x, (top - PLATE) / 2, z], 0.016, top - PLATE));
      }
  }
}

/** a bay's body: its two sides (a panel a tier on a stacked body), the
    bottom, the functional panel (a panel a tier) at the back or in the
    middle, and its own top unless a long one goes over all the bays */
function body(
  out: FormPart[],
  b: Bay,
  o: {
    stacked: boolean;
    tiers: number;
    back: "back" | "middle" | "full";
    top: boolean;
  },
) {
  const hb = b.y1 - b.y0;
  const ph = hb / o.tiers;
  for (const s of [-1, 1]) {
    const x = b.x + s * (b.w / 2 - T / 2);
    if (o.stacked)
      for (let t = 0; t < o.tiers; t++)
        out.push(
          slab(
            "body",
            [x, b.y0 + ph * (t + 0.5), b.z0],
            [T, ph, b.d],
            b.colour,
          ),
        );
    else
      out.push(slab("body", [x, b.y0 + hb / 2, b.z0], [T, hb, b.d], b.colour));
  }
  const inner = b.w - 2 * T;
  const behind = o.back === "back" ? T + RECESS : 0;
  out.push({
    ...slab(
      "body",
      [b.x, b.y0 + T / 2, b.z0 + behind / 2],
      [inner, T, b.d - behind],
      b.colour,
    ),
    hw: "joint",
  });
  if (o.back === "full")
    // a screen's closed face: one board over the back, side to side
    out.push(
      slab(
        "body",
        [b.x, b.y0 + hb / 2, b.z0 - b.d / 2 - T / 2],
        [b.w, hb, T],
        b.colour,
      ),
    );
  else
    for (let t = 0; t < o.tiers; t++) {
      const y = b.y0 + T + ((hb - T) / o.tiers) * (t + 0.5);
      out.push(
        slab(
          "body",
          [b.x, y, o.back === "back" ? b.z0 - b.d / 2 + RECESS + T / 2 : b.z0],
          [inner, (hb - T) / o.tiers, T],
          b.colour,
        ),
      );
    }
  if (o.top)
    out.push(slab("body", [b.x, b.y1 + T / 2, b.z0], [b.w, T, b.d], b.colour));
}

/** a shelf across a bay at height y (its top face), as deep as deep
    from the front, or set back to stand at z */
/** a shelf across a bay, flush at the front and stopping at the back's
    face (the back is set RECESS in, so a shelf as deep as the bay less
    a board ran 6 mm into it, z-fight.test) */
const shelf = (
  b: Bay,
  y: number,
  deep = b.d - T - RECESS,
  z?: number,
): FormPart => ({
  ...slab(
    "body",
    [b.x, y - T / 2, z ?? b.z0 + b.d / 2 - deep / 2],
    [b.w - 2 * T, T, deep],
    b.colour,
  ),
  hw: "shelf",
});

/** a door over a bay, a gap round it, with its finger pull at the top
    of the opening edge; it stands a board proud of the front */
function door(out: FormPart[], faces: DoorFace[], b: Bay, hinge: 1 | -1) {
  const w = b.w - 2 * T - 2 * GAP;
  const h = b.y1 - b.y0 - T - 2 * GAP;
  const z = b.z0 + b.d / 2 + T / 2 + 0.002;
  out.push(slab("body", [b.x, b.y0 + T + GAP + h / 2, z], [w, h, T], b.colour));
  faces.push({ at: [b.x, b.y0 + T + GAP + h / 2, z + T / 2], size: [w, h] });
  out.push(
    slab(
      "dark",
      [b.x - hinge * (w / 2 - 0.03), b.y0 + T + h - 0.07, z + T / 2],
      [0.012, 0.08, 0.002],
    ),
  );
}

/* ---------- the things a piece holds ---------- */

/** a pair of shoes on a shelf, toes to the front */
const shoes = (x: number, y: number, z: number, colour: string) =>
  [-1, 1].map((s) =>
    slab("thing", [x + s * 0.048, y + 0.035, z], [0.085, 0.07, 0.25], colour),
  );

/** upright files along a shelf */
const files = (
  x0: number,
  y: number,
  z: number,
  n: number,
  rnd: () => number,
) =>
  Array.from({ length: n }, (_, i) =>
    slab(
      "thing",
      [x0 + i * 0.085, y + 0.14, z],
      [0.075, 0.28, 0.24],
      [THINGS.charcoal, THINGS.cream, THINGS.sage, THINGS.stone][
        Math.floor(rnd() * 4)
      ],
    ),
  );

/** a box or a basket, as wide as w */
const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  colour: string,
) => slab("thing", [x, y + h / 2, z], [w, h, d], colour);

/** a bedside lamp, m: its foot, its stem and its linen shade, a cone
    narrower at the top */
const LAMP = {
  foot: [0.07, 0.022],
  stem: [0.009, 0.25],
  shade: [0.12, 0.17, 0.085],
} as const;
const lamp = (x: number, y: number, z: number): FormPart[] => {
  const [fr, fh] = LAMP.foot;
  const [sr, sh] = LAMP.stem;
  const [r, h, top] = LAMP.shade;
  return [
    rod("metal", [x, y + fh / 2, z], fr, fh),
    rod("metal", [x, y + fh + sh / 2, z], sr, sh),
    {
      role: "thing",
      at: [x, y + fh + sh + h / 2 - 0.03, z],
      rod: [r, h, top],
      colour: THINGS.cream,
    },
  ];
};

/** a jar: a short round thing with its lid */
const jar = (
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  colour: string,
): FormPart[] => [
  rod("thing", [x, y + h / 2, z], r, h, undefined, colour),
  rod(
    "thing",
    [x, y + h + 0.008, z],
    r * 0.92,
    0.016,
    undefined,
    THINGS.charcoal,
  ),
];

/* ---------- the add-ons, where they go ---------- */

/** the add-ons that hang on or stand on a bay: placed by what the bay
    is (the shelf the hooks go under, the side the rail is on) */
type Spots = {
  /** the bay the add-ons go on */
  b: Bay;
  /** the underside of the shelf hooks hang from */
  hooksUnder: number;
  /** the top the tray and the dock stand on */
  top: number;
  /** the x of the side the side add-ons go on (the outer face) */
  side: number;
};

function accessories(out: FormPart[], ids: readonly string[], s: Spots) {
  const { b } = s;
  const front = b.z0 + b.d / 2;
  for (const id of ids) {
    if (id === "coat-hook")
      // three hooks under the shelf, a hand in from the front
      for (let k = 0; k < 3; k++) {
        const x = b.x + (k - 1) * (b.w - 2 * T) * 0.3;
        out.push(
          rod("accent", [x, s.hooksUnder - 0.03, front - 0.05], 0.006, 0.06),
          rod("accent", [x, s.hooksUnder - 0.062, front - 0.035], 0.006, 0.03, [
            Math.PI / 2,
            0,
            0,
          ]),
        );
      }
    else if (id === "key-tray")
      // a shallow tray on the top, at the front corner: its two lips
      // stand on its base, not through it, so no face of one lies in a
      // face of the other (the ends and the front fought, z-fight.test)
      out.push(
        slab(
          "thing",
          [b.x - b.w * 0.2, s.top + 0.004, front - 0.11],
          [0.21, 0.008, 0.17],
          THINGS.clay,
        ),
        ...[-1, 1].map((k) =>
          slab(
            "thing",
            [b.x - b.w * 0.2 + k * 0.1, s.top + 0.019, front - 0.11],
            [0.01, 0.022, 0.17],
            THINGS.clay,
          ),
        ),
      );
    else if (id === "headphone-hook") {
      // the utility hook off the side, a pair of headphones on it
      const x = s.side + Math.sign(s.side - b.x) * 0.03;
      const y = b.y0 + (b.y1 - b.y0) * 0.72;
      out.push(
        rod("metal", [x, y, b.z0], 0.006, 0.06, [0, 0, Math.PI / 2]),
        slab(
          "thing",
          [x + Math.sign(s.side - b.x) * 0.02, y - 0.02, b.z0],
          [0.02, 0.05, 0.16],
          THINGS.charcoal,
        ),
        ...[-1, 1].map((k) =>
          rod(
            "thing",
            [x + Math.sign(s.side - b.x) * 0.02, y - 0.1, b.z0 + k * 0.075],
            0.035,
            0.03,
            [0, 0, Math.PI / 2],
            THINGS.charcoal,
          ),
        ),
      );
    } else if (id === "kitchen-rail") {
      // a rail along the side near the top, a towel over it
      const out_ = Math.sign(s.side - b.x);
      const x = s.side + out_ * 0.03;
      const y = b.y1 - 0.08;
      out.push(
        rod("metal", [x, y, b.z0], 0.008, b.d - 0.08, [Math.PI / 2, 0, 0]),
        ...[-1, 1].map((k) =>
          rod(
            "metal",
            [s.side + out_ * 0.015, y, b.z0 + k * (b.d / 2 - 0.04)],
            0.006,
            0.03,
            [0, 0, Math.PI / 2],
          ),
        ),
        slab(
          "cloth",
          [x + out_ * 0.012, y - 0.13, b.z0 + 0.02],
          [0.006, 0.26, 0.2],
          THINGS.sage,
        ),
      );
    } else if (id === "clothes-rail") {
      // a rail across the bay under the top, coats on hangers
      const y = b.y1 - 0.09;
      out.push(
        rod("metal", [b.x, y, b.z0], 0.012, b.w - 2 * T, [0, 0, Math.PI / 2]),
        slab(
          "cloth",
          [b.x - b.w * 0.12, y - 0.42, b.z0],
          [0.06, 0.78, Math.min(0.36, b.d - 0.06)],
          THINGS.charcoal,
        ),
        slab(
          "cloth",
          [b.x + b.w * 0.14, y - 0.34, b.z0],
          [0.05, 0.62, Math.min(0.32, b.d - 0.08)],
          THINGS.sage,
        ),
      );
    } else if (id === "charging-dock") {
      // on the top at the far end, its back to the back: a block with
      // three slots, two tablets and a phone standing in them, and the
      // light that says they are charging
      const x = b.x + b.w / 2 - 0.2;
      const z = b.z0 - b.d / 2 + 0.11;
      const lean: V3 = [-0.14, 0, 0];
      out.push(
        slab("base", [x, s.top + 0.0225, z], [0.28, 0.045, 0.15]),
        slab(
          "thing",
          [x - 0.075, s.top + 0.045 + 0.1, z - 0.012],
          [0.17, 0.24, 0.008],
          THINGS.charcoal,
          lean,
        ),
        slab(
          "thing",
          [x + 0.06, s.top + 0.045 + 0.085, z + 0.012],
          [0.15, 0.21, 0.008],
          THINGS.stone,
          lean,
        ),
        slab(
          "thing",
          [x + 0.11, s.top + 0.045 + 0.06, z + 0.045],
          [0.07, 0.14, 0.008],
          THINGS.sage,
          lean,
        ),
        slab("accent", [x, s.top + 0.03, z + 0.076], [0.02, 0.006, 0.002]),
      );
    }
  }
}

/* ---------- the pieces ---------- */

const MOBILE = new Set(["trolley", "screen", "island"]);

/** the hardware a real carcass shows: a pin under each corner of a
    shelf, standing out of the side it rests on, and a cam lock's cap on
    a fixed bottom's face by each side, front and back */
const hardwareOf = (parts: readonly FormPart[]): FormPart[] =>
  parts.flatMap((p): FormPart[] => {
    if (!p.hw || !("dims" in p)) return [];
    const [x, y, z] = p.at;
    const [w, t, d] = p.dims;
    const corners = [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => [sx, sz] as const),
    );
    if (p.hw === "shelf")
      return corners.map(([sx, sz]) => ({
        ...rod(
          "metal",
          [
            x + sx * (w / 2 - PIN.out / 2),
            y - t / 2 - PIN.r,
            z + sz * (d / 2 - PIN.inset),
          ],
          PIN.r,
          PIN.out,
          [0, 0, Math.PI / 2],
        ),
        detail: true,
      }));
    return corners.map(([sx, sz]) => ({
      ...rod(
        "thing",
        [
          x + sx * (w / 2 - CAM.inset),
          y + t / 2 + CAM.h / 2,
          z + sz * (d / 2 - CAM.inset),
        ],
        CAM.r,
        CAM.h,
      ),
      colour: CAM.colour,
      detail: true,
    }));
  });

export function furnishesForm(i: FormInput): FurnishesForm {
  const f = formOf(i);
  return { ...f, parts: [...f.parts, ...hardwareOf(f.parts)] };
}

function formOf(i: FormInput): FurnishesForm {
  const [w, h, d] = i.size;
  const r = i.recipe;
  const rnd = seeded(i.seed);
  const out: FormPart[] = [];
  const books: BookRun[] = [];
  const faces: DoorFace[] = [];
  const colourOf = (k: number) =>
    i.colours[Math.min(k, i.colours.length - 1)] ?? "#d9b98a";

  if (r.shape === "folding") {
    folding(out, w, h, d, colourOf(0));
    return { parts: out, books, doors: faces };
  }

  const mobile = MOBILE.has(r.shape);
  const footTop = mobile ? CASTOR : FOOT;
  const stacked = r.family === "stacked" || r.family === "seating";

  if (r.shape === "desk") {
    workstation(out, i, rnd);
    return { parts: out, books, doors: faces };
  }

  base(out, w, d, r.bays, mobile);
  // the bodies: the bays across, set in on the base
  const bw = (w - 2 * INSET) / r.bays;
  const bd = d - 2 * INSET;
  // a bench's seat is thicker than a top
  const seat = r.shape === "bench" ? 0.025 : T;
  const y0 = footTop;
  const y1 = h - seat;
  const longTop =
    r.shape === "island" ||
    (r.shape === "cabinet" && r.bays > 1) ||
    r.shape === "bench";
  // the record's tiers at its own height; a piece made taller or
  // shorter keeps its tiers near 400 mm
  const tiers =
    Math.abs(y1 - y0 - r.height / 1000) < 0.06
      ? r.tiers
      : Math.max(1, Math.round((y1 - y0) / TIER));
  const scale = (y1 - y0) / (r.height / 1000);
  const bays: Bay[] = Array.from({ length: r.bays }, (_, k) => ({
    x: -w / 2 + INSET + bw * (k + 0.5),
    w: bw,
    y0,
    y1,
    d: bd,
    z0: 0,
    colour: colourOf(k),
  }));
  for (const b of bays)
    body(out, b, {
      stacked,
      tiers,
      back:
        r.shape === "shelf" ? "middle" : r.shape === "screen" ? "full" : "back",
      top: !longTop,
    });
  if (longTop)
    out.push(
      slab(
        "body",
        [0, y1 + seat / 2, 0],
        [w - 2 * INSET, seat, bd],
        colourOf(0),
      ),
    );
  // the shelves, where the record puts them (scaled with the height)
  const at = (mm: number) => y0 + (mm / 1000) * scale;
  const even = () =>
    Array.from(
      { length: tiers - 1 },
      (_, t) => y0 + ((y1 - y0) / tiers) * (t + 1),
    );
  const first = bays[0]!;
  switch (r.id) {
    case "entry": {
      const b = first;
      // the shoe shelf low and deep; a narrow shelf set back high, the
      // hooks under it, bags on them
      const low = at(240);
      const high = at(780);
      out.push(shelf(b, low + T, (b.d - T) * (330 / 382)));
      const narrow = (b.d - T) * (190 / 382);
      out.push(
        shelf(b, high + T, narrow, b.z0 - b.d / 2 + T + 0.01 + narrow / 2),
      );
      out.push(
        ...shoes(b.x - 0.12, low + T, b.z0 + b.d / 2 - 0.15, THINGS.leather),
      );
      out.push(
        ...shoes(b.x + 0.12, low + T, b.z0 + b.d / 2 - 0.15, THINGS.cream),
      );
      out.push(...shoes(b.x, y0 + T, b.z0 + 0.02, THINGS.charcoal));
      if (i.accessories.includes("coat-hook"))
        out.push(
          slab(
            "cloth",
            [b.x - 0.12, high - 0.26, b.z0 + b.d / 2 - 0.07],
            [0.15, 0.36, 0.07],
            THINGS.sage,
          ),
          slab(
            "cloth",
            [b.x + 0.1, high - 0.3, b.z0 + b.d / 2 - 0.07],
            [0.13, 0.42, 0.06],
            THINGS.stone,
          ),
        );
      out.push(
        box(
          b.x,
          high + T,
          b.z0 - b.d / 2 + 0.12,
          0.3,
          0.12,
          0.16,
          THINGS.cream,
        ),
      );
      accessories(out, i.accessories, {
        b,
        hooksUnder: high,
        top: y1 + T,
        side: b.x + b.w / 2,
      });
      break;
    }
    case "coat-rack": {
      const b = first;
      // one low shelf, a box on it; the open height over it is the
      // rail's
      const low = at(300);
      out.push(shelf(b, low + T));
      out.push(
        box(b.x - 0.08, low + T, b.z0 + 0.02, 0.24, 0.22, 0.26, THINGS.clay),
      );
      out.push(...shoes(b.x + 0.06, y0 + T, b.z0 + 0.04, THINGS.charcoal));
      accessories(out, i.accessories, {
        b,
        hooksUnder: y1,
        top: y1 + T,
        side: b.x + b.w / 2,
      });
      break;
    }
    case "desk": {
      const b = first;
      const ys = [at(430), at(770)];
      for (const y of ys) out.push(shelf(b, y + T));
      // files on the middle shelf, a closed box below, paper above
      out.push(...files(b.x - 0.17, ys[0]! + T, b.z0 + 0.02, 3, rnd));
      out.push(
        box(
          b.x,
          y0 + T,
          b.z0 + 0.01,
          b.w - 2 * T - 0.06,
          0.24,
          b.d - 0.08,
          THINGS.stone,
        ),
      );
      out.push(
        box(b.x - 0.05, ys[1]! + T, b.z0 + 0.03, 0.3, 0.03, 0.22, THINGS.cream),
      );
      holes(out, b, ys[1]! + T, y1);
      accessories(out, i.accessories, {
        b,
        hooksUnder: ys[1]!,
        top: y1 + T,
        side: b.x + b.w / 2,
      });
      break;
    }
    case "mobile-screen": {
      const b = first;
      const ys = even();
      for (const y of ys) out.push(shelf(b, y + T));
      out.push(
        box(b.x - 0.1, ys[0]! + T, b.z0 + 0.02, 0.2, 0.2, 0.28, THINGS.clay),
      );
      out.push(
        box(
          b.x + 0.12,
          ys[0]! + T,
          b.z0 + 0.02,
          0.18,
          0.26,
          0.26,
          THINGS.stone,
        ),
      );
      out.push(
        box(
          b.x,
          y0 + T,
          b.z0 + 0.02,
          b.w - 2 * T - 0.08,
          0.2,
          b.d - 0.1,
          THINGS.cream,
        ),
      );
      accessories(out, i.accessories, {
        b,
        hooksUnder: ys[ys.length - 1]!,
        top: y1 + T,
        side: b.x + b.w / 2,
      });
      break;
    }
    case "bookwall": {
      // narrow shelves either side of the middle panel, books on both
      const deep = (bd - T) / 2;
      for (const [k, b] of bays.entries())
        for (const y of [y0 + T, ...even().map((v) => v + T)]) {
          if (y > y0 + T)
            for (const s of [-1, 1])
              out.push(shelf(b, y, deep, b.z0 + s * (T / 2 + deep / 2)));
          const next =
            even()
              .map((v) => v + T)
              .find((v) => v > y + 0.01) ?? y1;
          for (const s of [-1, 1])
            books.push({
              x0: b.x - b.w / 2 + T,
              y,
              bayW: b.w - 2 * T,
              z: b.z0 + s * (T / 2 + deep / 2),
              deep: deep * 0.85,
              room: next - y - T,
              seed: i.seed + k * 13 + Math.round(y * 100) + (s > 0 ? 7 : 0),
            });
        }
      break;
    }
    case "bench": {
      // two open bays under the seat: a basket in one, shoes in the other
      const [a, b] = [first, bays[1] ?? first];
      out.push(
        box(
          a.x,
          y0 + T,
          a.z0 + 0.01,
          a.w - 2 * T - 0.08,
          0.2,
          a.d - 0.08,
          THINGS.cream,
        ),
      );
      out.push(...shoes(b.x, y0 + T, b.z0 + 0.03, THINGS.leather));
      break;
    }
    default: {
      // the stacked bodies: a shelf at each tier, a door a bay if asked
      for (const b of bays) for (const y of even()) out.push(shelf(b, y + T));
      const open = !(i.doors && r.door);
      if (!open)
        bays.forEach((b, k) => door(out, faces, b, k % 2 === 0 ? -1 : 1));
      fill(out, books, r.id, bays, { y0, y1, tiers, open, seed: i.seed, rnd });
      const spot = bays[bays.length - 1]!;
      accessories(out, i.accessories, {
        b: spot,
        hooksUnder: even()[0] ?? y1,
        top: y1 + seat,
        side: spot.x + spot.w / 2,
      });
    }
  }
  return { parts: out, books, doors: faces };
}

/** the stacked bodies' things: what a sideboard, a bedside, a trolley,
    a cart and an island hold, open; a closed one shows its doors */
function fill(
  out: FormPart[],
  books: BookRun[],
  id: string,
  bays: Bay[],
  o: {
    y0: number;
    y1: number;
    tiers: number;
    open: boolean;
    seed: number;
    rnd: () => number;
  },
) {
  const shelfY = (t: number) => o.y0 + T + ((o.y1 - o.y0) / o.tiers) * t;
  const top = o.y1 + T;
  const b = bays[0]!;
  if (id === "kitchen" || id === "island") {
    // a board and a jar on the top; jars on the shelf; a basket below
    out.push(
      slab(
        "thing",
        [b.x - 0.08, top + 0.009, b.z0 + 0.03],
        [0.3, 0.018, 0.2],
        THINGS.stone,
      ),
      ...jar(b.x + 0.17, top, b.z0 - 0.08, 0.05, 0.12, THINGS.cream),
    );
    if (o.open)
      for (const bb of bays) {
        out.push(
          ...jar(
            bb.x - 0.14,
            shelfY(1),
            bb.z0 + 0.02,
            0.045,
            0.13,
            THINGS.cream,
          ),
          ...jar(bb.x - 0.03, shelfY(1), bb.z0 + 0.02, 0.04, 0.1, THINGS.stone),
          ...jar(
            bb.x + 0.12,
            shelfY(1),
            bb.z0 + 0.02,
            0.07,
            0.08,
            THINGS.charcoal,
          ),
          box(
            bb.x,
            shelfY(0),
            bb.z0 + 0.01,
            bb.w - 2 * T - 0.08,
            0.18,
            bb.d - 0.08,
            THINGS.cream,
          ),
        );
      }
    return;
  }
  if (id === "work-cart") {
    // a handle across the end for pushing; bins and a tool box
    const x = b.x + b.w / 2 + 0.025;
    out.push(
      rod("metal", [x, o.y1 - 0.05, b.z0], 0.011, b.d - 0.1, [
        Math.PI / 2,
        0,
        0,
      ]),
      ...[-1, 1].map((k) =>
        rod(
          "metal",
          [b.x + b.w / 2 + 0.012, o.y1 - 0.05, b.z0 + k * (b.d / 2 - 0.05)],
          0.008,
          0.026,
          [0, 0, Math.PI / 2],
        ),
      ),
    );
    if (o.open)
      out.push(
        box(b.x - 0.1, shelfY(1), b.z0 + 0.02, 0.26, 0.12, 0.2, THINGS.clay),
        ...jar(b.x + 0.15, shelfY(1), b.z0 + 0.0, 0.06, 0.22, THINGS.cream),
        box(
          b.x - 0.08,
          shelfY(0),
          b.z0 + 0.01,
          0.3,
          0.16,
          b.d - 0.1,
          THINGS.charcoal,
        ),
        box(
          b.x + 0.17,
          shelfY(0),
          b.z0 + 0.01,
          0.16,
          0.16,
          b.d - 0.1,
          THINGS.sage,
        ),
      );
    return;
  }
  if (id === "bedside") {
    // a lamp on the top, to the back; a book or two in the cube
    out.push(...lamp(b.x + b.w * 0.18, top, b.z0 - b.d * 0.12));
    if (o.open)
      out.push(
        box(b.x - 0.12, shelfY(0), b.z0 + 0.02, 0.17, 0.025, 0.23, THINGS.sage),
        box(
          b.x - 0.115,
          shelfY(0) + 0.025,
          b.z0 + 0.025,
          0.16,
          0.02,
          0.22,
          THINGS.cream,
        ),
      );
    return;
  }
  if (id === "sideboard" && o.open) {
    // books in the first bay, boxes in the middle, a basket in the last
    bays.forEach((bb, k) => {
      for (let t = 0; t < o.tiers; t++) {
        const y = shelfY(t);
        const room = (o.y1 - o.y0) / o.tiers - T;
        if (k === 0 && t === 0)
          books.push({
            x0: bb.x - bb.w / 2 + T,
            y,
            bayW: bb.w - 2 * T,
            z: bb.z0 - 0.02,
            deep: (bb.d - T) * 0.7,
            room,
            seed: o.seed + t * 7,
          });
        else if (k === bays.length - 1 && t === 0)
          out.push(
            box(
              bb.x,
              y,
              bb.z0 + 0.01,
              bb.w - 2 * T - 0.08,
              Math.min(0.24, room - 0.04),
              bb.d - 0.08,
              THINGS.cream,
            ),
          );
        else if (k === 1 && t === 1)
          out.push(
            box(bb.x - 0.12, y, bb.z0 + 0.02, 0.22, 0.16, 0.26, THINGS.stone),
            box(bb.x + 0.13, y, bb.z0 + 0.02, 0.2, 0.12, 0.24, THINGS.clay),
          );
      }
    });
  }
}

/** the functional panel's holes over a bay's back between two heights:
    the grid the hooks and the trays hang on, shown where it is used */
function holes(out: FormPart[], b: Bay, from: number, to: number) {
  const cols = 5;
  const rows = Math.max(2, Math.floor((to - from - 0.06) / 0.064));
  const z = b.z0 - b.d / 2 + T + 0.0006;
  for (let c = 0; c < cols; c++)
    for (let k = 0; k < rows; k++)
      out.push(
        rod(
          "dark",
          [b.x + (c - (cols - 1) / 2) * 0.096, from + 0.05 + k * 0.064, z],
          0.006,
          0.001,
          [Math.PI / 2, 0, 0],
        ),
      );
}

/** the workstation: the organiser tower at one end, at the back, its
    shelves at the tiers and the holed panel over the desk; the desk
    across the front at 750 mm, on brackets at the tower and on a
    panel leg at its far end; a laptop on it */
function workstation(out: FormPart[], i: FormInput, rnd: () => number) {
  const [w, h, d] = i.size;
  const tw = Math.min(0.6, w / 2);
  const td = Math.min(0.4, d * 0.4);
  const tz = -d / 2 + td / 2;
  const tx = -w / 2 + tw / 2;
  // the tower's base, and the tower
  out.push(slab("base", [tx, FOOT - PLATE / 2, tz], [tw, PLATE, td]));
  for (const s of [-1, 1])
    out.push(
      slab(
        "accent",
        [tx + s * (tw / 2 - 0.05), FOOT - PLATE / 2, tz + td / 2 + 0.001],
        [0.034, 0.008, 0.002],
      ),
      rod(
        "dark",
        [tx + s * (tw / 2 - 0.05), (FOOT - PLATE) / 2, tz],
        0.016,
        FOOT - PLATE,
      ),
    );
  const colour = i.colours[0] ?? "#d9b98a";
  const b: Bay = {
    x: tx,
    w: tw - 2 * INSET,
    y0: FOOT,
    y1: h - T,
    d: td - 2 * INSET,
    z0: tz,
    colour,
  };
  const tiers = Math.max(2, Math.round((b.y1 - b.y0) / TIER));
  body(out, b, { stacked: false, tiers, back: "back", top: true });
  const deskY = Math.min(0.75, h - 0.3);
  for (let t = 1; t < tiers; t++) {
    const y = b.y0 + ((b.y1 - b.y0) / tiers) * t;
    // the shelf the desk meets is left out: the desk is there
    if (Math.abs(y - deskY) > 0.08) out.push(shelf(b, y + T));
  }
  // the desk across the front, its leg at the far end
  const dd = d - td;
  const dz = d / 2 - dd / 2;
  out.push(slab("body", [0, deskY - T / 2, dz], [w, T, dd], colour));
  out.push(
    slab(
      "body",
      [w / 2 - T, (deskY - T) / 2, dz],
      [2 * T, deskY - T, dd - 0.02],
      colour,
    ),
  );
  for (const x of [tx - tw / 2 + 0.07, tx + tw / 2 - 0.07])
    out.push(
      slab(
        "accent",
        [x, deskY - T - 0.04, tz + td / 2 + 0.01],
        [0.05, 0.08, 0.02],
      ),
    );
  // things: a laptop open on the desk, files in the tower
  out.push(
    slab(
      "thing",
      [0.1, deskY + 0.006, dz + 0.05],
      [0.32, 0.012, 0.22],
      THINGS.stone,
    ),
    slab(
      "thing",
      [0.1, deskY + 0.11, dz - 0.06],
      [0.32, 0.21, 0.008],
      THINGS.stone,
      [-0.25, 0, 0],
    ),
    ...files(
      tx - 0.17,
      b.y0 + ((b.y1 - b.y0) / tiers) * (tiers - 1) + T,
      tz + 0.02,
      3,
      rnd,
    ),
  );
  holes(out, b, deskY + 0.02, b.y0 + ((b.y1 - b.y0) / tiers) * (tiers - 1));
  accessories(out, i.accessories, {
    b,
    hooksUnder: b.y0 + ((b.y1 - b.y0) / tiers) * (tiers - 1),
    top: b.y1 + T,
    side: b.x - b.w / 2,
  });
}

/** the folding screen: three framed leaves at their fold, a zigzag as
    deep as the box, each a stile either edge and a panel a tier, the
    orange hinges between */
function folding(
  out: FormPart[],
  w: number,
  h: number,
  d: number,
  colour: string,
) {
  const L = w / 3;
  const fold = Math.asin(Math.min(0.95, Math.max(0, d - 0.04) / L));
  const span = L * Math.cos(fold);
  const stile = 0.04;
  const tiers = Math.max(1, Math.round(h / TIER));
  // the hinge lines: where the leaves meet, front and back of the zig
  const xs = [-1.5, -0.5, 0.5, 1.5].map((k) => k * span);
  const zs = [-1, 1, -1, 1].map((s) => (s * (d - 0.04)) / 2);
  for (let k = 0; k < 3; k++) {
    const [xa, xb] = [xs[k]!, xs[k + 1]!];
    const [za, zb] = [zs[k]!, zs[k + 1]!];
    const mx = (xa + xb) / 2;
    const mz = (za + zb) / 2;
    const yaw = -Math.atan2(zb - za, xb - xa);
    const along = (t: number): [number, number] => [
      mx + (t * (xb - xa)) / L,
      mz + (t * (zb - za)) / L,
    ];
    for (const s of [-1, 1]) {
      const [x, z] = along(s * (L / 2 - stile / 2 - 0.006));
      out.push(slab("body", [x, h / 2, z], [stile, h, T], colour, [0, yaw, 0]));
    }
    for (let t = 0; t < tiers; t++) {
      const [x, z] = along(0);
      out.push(
        slab(
          "body",
          [x, (h / tiers) * (t + 0.5), z],
          [L - 2 * stile - 0.012, h / tiers - 0.004, T * 0.6],
          colour,
          [0, yaw, 0],
        ),
      );
    }
  }
  for (const k of [1, 2])
    out.push(rod("accent", [xs[k]!, h / 2, zs[k]!], 0.006, h - 0.04));
}
