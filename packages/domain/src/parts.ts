import {
  ACCESSORIES,
  isMobile,
  type Configuration,
  type Product,
} from "./catalogue";

/**
 * The parts a configured piece is made of, each where it stands in the
 * body. Geometry is nominal, from the assembly record's unit (600 × 400
 * × 400, 18 mm panels). Positions are millimetres: x across the front,
 * y into the depth, z up. The bill of parts counts the same list by
 * part; the steps, the boxes and the price are all read from it, so
 * nothing about a piece is typed in twice.
 */
export type PartKind =
  "panel" | "base" | "accessory" | "wheel" | "door" | "hardware";

export type PartGroup =
  | "Base"
  | "Body panels"
  | "Shelves"
  | "Top"
  | "Doors"
  | "Connections"
  | "Desk"
  | "Accessories"
  | "Screen frames"
  | "Screen panels";

export type PartNode = {
  id: string;
  partId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  kind: PartKind;
  spec: string;
  group: PartGroup;
};

export type PartRow = {
  id: string;
  name: string;
  quantity: number;
  spec: string;
  group: PartGroup;
  kind: PartKind;
};

/** the order the groups go on, and are listed in */
export const GROUP_ORDER: PartGroup[] = [
  "Base",
  "Body panels",
  "Shelves",
  "Top",
  "Connections",
  "Desk",
  "Doors",
  "Screen frames",
  "Screen panels",
  "Accessories",
];

/** the panel's thickness and the unit's depth, mm */
export const PANEL_MM = 18;
export const UNIT_DEPTH = 400;
export const UNIT_WIDTH = 600;

const accessoryName = (id: string) => ACCESSORIES[id]?.name ?? id;
const accessoryBlurb = (id: string) => ACCESSORIES[id]?.description ?? "";

export function assembly(p: Product, c: Configuration): PartNode[] {
  const nodes: PartNode[] = [];
  let serial = 0;
  const add = (
    partId: string,
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    h: number,
    group: PartGroup = "Body panels",
    kind: PartKind = "panel",
    spec?: string,
  ) =>
    nodes.push({
      id: `${p.id}-${partId}-${serial++}`,
      partId,
      name,
      x,
      y,
      z,
      w,
      d,
      h,
      group,
      kind,
      spec:
        spec ??
        `${Math.round(w)} × ${Math.round(d)} × ${Math.round(h)} mm · nominal`,
    });
  const T = PANEL_MM;
  const D = UNIT_DEPTH;
  const segment = UNIT_WIDTH;
  const mobile = isMobile(p);
  const baseZ = mobile ? 85 : 30;
  const H = p.height;

  if (p.shape === "folding") {
    for (let leaf = 0; leaf < 3; leaf++) {
      for (let side = 0; side < 2; side++)
        add(
          "fold-frame",
          "Leaf frame upright",
          leaf * 600 + side * 582,
          0,
          0,
          18,
          40,
          H,
          "Screen frames",
          "panel",
          "Frame section, grooves and hinge gaps pending",
        );
      for (let tier = 0; tier < 3; tier++)
        add(
          "fold-panel",
          "Screen panel",
          leaf * 600 + 18,
          8,
          tier * 400,
          564,
          18,
          400,
          "Screen panels",
        );
      if (leaf < 2)
        add(
          "hinge-assembly",
          "Continuous hinge",
          (leaf + 1) * 600 - 10,
          0,
          20,
          12,
          25,
          H - 40,
          "Connections",
          "hardware",
          "Hinge specification to be confirmed",
        );
    }
    return nodes;
  }

  const bodyHeight = p.shape === "bench" ? 400 : H;
  for (let bay = 0; bay < p.bays; bay++) {
    const x = bay * segment;
    add(
      mobile ? "caster-base" : "foot-base",
      mobile ? "Caster base" : "Foot base",
      x - 12,
      -12,
      baseZ - 28,
      624,
      424,
      28,
      "Base",
      "base",
      mobile
        ? "Base tier B2 · casters · the L-key parks in here"
        : "Base tier B1 · adjustable pads · the L-key parks in here",
    );
    if (mobile)
      for (const [dx, dy] of [
        [38, 26],
        [530, 26],
        [38, 340],
        [530, 340],
      ] as const)
        add(
          "caster-display",
          "Caster",
          x + dx,
          dy,
          0,
          32,
          30,
          60,
          "Base",
          "wheel",
          "Caster count and installed height not final",
        );
    const full = p.family === "full-height";
    for (let side = 0; side < 2; side++)
      for (let t = 0; t < (full ? 1 : p.tiers); t++) {
        const ph = full ? bodyHeight : bodyHeight / p.tiers;
        add(
          full ? `side-f${bodyHeight}` : "side-s400",
          full ? "Full-height side panel" : "Stacking side panel",
          x + side * (600 - T),
          0,
          baseZ + t * ph,
          T,
          D,
          ph,
          "Body panels",
        );
      }
    for (let t = 0; t < p.tiers; t++)
      add(
        "functional-panel",
        "Functional panel",
        x + T,
        p.shape === "shelf" ? 191 : D - T,
        baseZ + t * (bodyHeight / p.tiers),
        600 - 2 * T,
        T,
        bodyHeight / p.tiers,
        "Body panels",
      );
    add(
      "structural-bottom",
      "Bottom panel",
      x + T,
      0,
      baseZ,
      564,
      380,
      T,
      "Body panels",
    );
    if (p.shape === "organiser") {
      if (p.id === "entry") {
        add(
          "shoe-shelf",
          "Shoe shelf",
          x + T,
          0,
          baseZ + 240,
          564,
          330,
          T,
          "Shelves",
        );
        add(
          "narrow-shelf",
          "Narrow shelf",
          x + T,
          180,
          baseZ + 780,
          564,
          190,
          T,
          "Shelves",
        );
      } else if (p.id === "coat-rack")
        add(
          "shelf-full",
          "Shelf",
          x + T,
          0,
          baseZ + 300,
          564,
          380,
          T,
          "Shelves",
        );
      else {
        const zs =
          bodyHeight >= 1200 ? [430, 770] : bodyHeight >= 800 ? [400] : [];
        for (const z of zs)
          add(
            "shelf-full",
            "Shelf",
            x + T,
            0,
            baseZ + z,
            564,
            380,
            T,
            "Shelves",
          );
      }
    } else if (p.shape === "shelf") {
      for (let t = 1; t < p.tiers; t++)
        for (const y of [0, 209])
          add(
            "narrow-shelf",
            "Narrow shelf",
            x + T,
            y,
            baseZ + t * 400,
            564,
            190,
            T,
            "Shelves",
          );
    } else
      for (let t = 1; t < p.tiers; t++)
        add(
          "shelf-full",
          "Shelf",
          x + T,
          0,
          baseZ + t * (bodyHeight / p.tiers),
          564,
          380,
          T,
          "Shelves",
        );
    if (
      !["island", "bench"].includes(p.shape) &&
      !(p.shape === "cabinet" && p.bays > 1)
    )
      add(
        p.id === "kitchen" ? "worktop-short" : "top-short",
        p.id === "kitchen" ? "Short worktop" : "Top panel",
        x,
        0,
        baseZ + bodyHeight,
        600,
        400,
        T,
        "Top",
      );
    if (c.doors && p.door)
      add(
        `door-assembly-${bodyHeight}`,
        "Door",
        x + T,
        -20,
        baseZ + T,
        564,
        18,
        bodyHeight - 30,
        "Doors",
        "door",
        "Door leaf with hinges; final specification pending",
      );
  }
  if (p.shape === "island" || (p.shape === "cabinet" && p.bays > 1)) {
    add(
      `long-top-${p.width}`,
      "Shared long top",
      0,
      0,
      baseZ + bodyHeight,
      p.width,
      400,
      18,
      "Top",
      "panel",
      `${p.width} × 400 mm · preliminary top`,
    );
  }
  if (p.shape === "bench")
    for (let bay = 0; bay < p.bays; bay++)
      add(
        "seat-assembly",
        "Seat panel",
        bay * 600,
        0,
        baseZ + bodyHeight,
        600,
        380,
        25,
        "Top",
        "panel",
        "600 × 380 × 25 mm candidate; seating validation pending",
      );
  if (p.bays > 1)
    for (let i = 1; i < p.bays; i++)
      add(
        "bay-connector",
        "Bay connector",
        i * 600 - 12,
        360,
        baseZ + 150,
        24,
        20,
        45,
        "Connections",
        "hardware",
        "Connector geometry and fasteners to be confirmed",
      );
  if (p.shape === "desk") {
    add("desktop", "Desk surface", 0, -600, baseZ + 720, 1200, 600, 18, "Desk");
    add(
      "desk-support",
      "Desk support",
      1164,
      -600,
      baseZ,
      36,
      580,
      720,
      "Desk",
      "panel",
      "Support construction pending",
    );
    for (const bracketX of [50, 500])
      add(
        "desk-bracket",
        "Desk bracket",
        bracketX,
        -70,
        baseZ + 660,
        50,
        80,
        60,
        "Connections",
        "hardware",
        "Bracket and fixing specification pending",
      );
  }
  c.accessories.forEach((id, i) => {
    const z = baseZ + bodyHeight * 0.65 - i * 150;
    if (id === "coat-hook")
      for (let k = 0; k < 3; k++)
        add(
          "coat-hook",
          "Coat hook",
          135 + k * 125,
          300,
          z,
          18,
          70,
          40,
          "Accessories",
          "accessory",
          "Hangs on the functional panel's exposed holes",
        );
    else if (id === "clothes-rail")
      add(
        id,
        accessoryName(id),
        80,
        170,
        baseZ + bodyHeight - 200,
        440,
        25,
        25,
        "Accessories",
        "accessory",
        "Rail and supports; final specification pending",
      );
    else if (id === "kitchen-rail")
      add(
        id,
        accessoryName(id),
        -32,
        60,
        baseZ + bodyHeight - 70,
        20,
        270,
        20,
        "Accessories",
        "accessory",
        "Side rail; final specification pending",
      );
    else
      add(
        id,
        accessoryName(id),
        180,
        id === "key-tray" ? 190 : 300,
        z,
        id === "key-tray" ? 210 : 20,
        id === "key-tray" ? 170 : 70,
        id === "key-tray" ? 30 : 50,
        "Accessories",
        "accessory",
        accessoryBlurb(id),
      );
  });
  return nodes;
}

/** the parts counted by what they are, in the order they go on */
export function billOfParts(p: Product, c: Configuration): PartRow[] {
  const map = new Map<string, PartRow>();
  for (const n of assembly(p, c)) {
    if (n.kind === "wheel") continue;
    const old = map.get(n.partId);
    if (old) old.quantity++;
    else
      map.set(n.partId, {
        id: n.partId,
        name: n.name,
        quantity: 1,
        spec: n.spec,
        group: n.group,
        kind: n.kind,
      });
  }
  return [...map.values()].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
  );
}
