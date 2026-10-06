import type { Configuration, Product } from "./catalogue";
import { assembly, billOfParts, type PartGroup, type PartNode } from "./parts";

/**
 * Count, don't claim. The steps to build a piece, the boxes it comes in
 * and the counts a product page shows are all read from the part list
 * of the configuration on screen. Bolt counts and minutes are working
 * estimates until the assembly record is validated on samples; part and
 * box counts are exact for the drawing shown.
 */
export type Box = {
  id: string;
  label: string;
  contents: string;
  weightKg: number;
};

export type Step = {
  n: number;
  /** the assembly record's action code */
  action: string;
  title: string;
  detail: string;
  parts: { name: string; quantity: number }[];
  partIds: string[];
  bolts: number;
  tool: "L-key" | "none";
  people: 1 | 2;
  minutes: number;
  /** where you stand to do it */
  stands: string;
};

function tally(nodes: PartNode[]) {
  const m = new Map<string, { name: string; quantity: number }>();
  for (const n of nodes) {
    const e = m.get(n.partId);
    if (e) e.quantity++;
    else m.set(n.partId, { name: n.name, quantity: 1 });
  }
  return [...m.values()];
}

export function buildSteps(p: Product, c: Configuration): Step[] {
  const nodes = assembly(p, c);
  const heavy = p.height >= 1600 || p.width >= 1200;
  const steps: Step[] = [];
  let n = 0;
  const push = (
    action: string,
    title: string,
    detail: string,
    group: PartGroup | PartGroup[],
    filter: (x: PartNode) => boolean,
    boltsPer: number,
    tool: Step["tool"],
    people: 1 | 2,
    minutes: number,
    stands: string,
  ) => {
    const groups = Array.isArray(group) ? group : [group];
    const picked = nodes.filter(
      (x) => groups.includes(x.group) && x.kind !== "wheel" && filter(x),
    );
    if (!picked.length) return;
    n++;
    steps.push({
      n,
      action,
      title,
      detail,
      parts: tally(picked),
      partIds: [...new Set(picked.map((x) => x.partId))],
      bolts: boltsPer * picked.length,
      tool,
      people,
      minutes,
      stands,
    });
  };

  if (p.shape === "folding") {
    push(
      "A0",
      "Lay out the leaves",
      "Three frames, three panels each. Nothing is fixed yet.",
      "Screen frames",
      () => true,
      0,
      "none",
      1,
      3,
      "On the floor, on the box",
    );
    push(
      "A11",
      "Slide the panels into the frames",
      "Each leaf takes three panels in its grooves.",
      "Screen panels",
      () => true,
      2,
      "L-key",
      1,
      6,
      "Kneeling beside each leaf",
    );
    push(
      "A15",
      "Join the leaves",
      "Continuous hinges connect neighbouring frames.",
      "Connections",
      () => true,
      6,
      "L-key",
      2,
      6,
      "One person holds, one drives",
    );
    return steps;
  }

  push(
    "A0",
    "Set the base where the piece will stand",
    "Pads or casters go on first. The L-key lives in the base.",
    "Base",
    () => true,
    0,
    "none",
    1,
    2,
    "Where it will live",
  );
  push(
    "A2",
    "Stand the side panels on the base",
    "Holes face inward on the sides you look at, outward where you use them.",
    "Body panels",
    (x) => x.partId.startsWith("side-"),
    4,
    "L-key",
    heavy ? 2 : 1,
    heavy ? 6 : 4,
    "Beside the piece, panel leaning on you",
  );
  push(
    "A3",
    "Drop in the bottom panel",
    "It squares the two sides. Bolt from underneath, through the base.",
    "Body panels",
    (x) => x.partId === "structural-bottom",
    4,
    "L-key",
    1,
    3,
    "Crouched at the front",
  );
  push(
    "A4",
    "Fit the functional panel",
    "The working face with the exposed holes. Check it sits flush before tightening.",
    "Body panels",
    (x) => x.partId === "functional-panel",
    4,
    "L-key",
    1,
    p.tiers > 1 ? 5 : 3,
    "At the back",
  );
  push(
    "A6",
    "Slide in the shelves",
    "Shelves rest on the side-panel holes and bolt through. Any height that lines up.",
    "Shelves",
    () => true,
    4,
    "L-key",
    1,
    3,
    "At the front",
  );
  push(
    "A15",
    "Connect the bays",
    "Bay connectors bolt through neighbouring side panels.",
    "Connections",
    (x) => x.partId === "bay-connector",
    4,
    "L-key",
    2,
    5,
    "One person each side",
  );
  push(
    "A8",
    "Cap it with the top",
    "The top closes the body. Once it is on, the piece stands on its own.",
    "Top",
    () => true,
    4,
    "L-key",
    p.width >= 1200 ? 2 : 1,
    3,
    "Standing, above the piece",
  );
  push(
    "A12",
    "Attach the desk",
    "The desk surface bolts to the organiser and to its own support.",
    ["Desk", "Connections"],
    (x) => x.group === "Desk" || x.partId === "desk-bracket",
    4,
    "L-key",
    2,
    10,
    "One person holds the surface level",
  );
  push(
    "A13",
    "Hang the doors",
    "Hinges bolt to the side panels. Adjust until the gap is even.",
    "Doors",
    () => true,
    4,
    "L-key",
    1,
    4,
    "At the front",
  );
  push(
    "A17",
    "Add the accessories",
    "Hooks, trays and rails hang on the exposed holes. No bolts for hooks; rails take two.",
    "Accessories",
    () => true,
    0,
    "none",
    1,
    2,
    "Wherever you'll use them",
  );
  return steps;
}

export function boxes(p: Product, c: Configuration): Box[] {
  const parts = billOfParts(p, c);
  const out: Box[] = [];
  if (p.shape === "folding") {
    out.push({
      id: "leaves",
      label: "Box 1",
      contents: "3 leaf frames, 9 screen panels",
      weightKg: 17,
    });
    out.push({
      id: "tray",
      label: "Tray",
      contents: "2 hinges, bolts by step, 1 L-key",
      weightKg: 1,
    });
    return out;
  }
  const panelsPerBay = parts
    .filter((r) => r.kind === "panel" && r.group !== "Desk")
    .reduce((s, r) => s + r.quantity, 0);
  const perBay = Math.ceil(panelsPerBay / p.bays);
  const bayWeight = Math.min(
    20,
    Math.round(perBay * (p.height >= 1600 ? 3.2 : 2.6)),
  );
  for (let i = 0; i < p.bays; i++)
    out.push({
      id: `bay-${i}`,
      label: `Box ${i + 1}`,
      contents:
        p.bays > 1
          ? `Body panels and shelves for bay ${i + 1}`
          : "All body panels, shelves and top",
      weightKg: bayWeight,
    });
  if (p.shape === "desk")
    out.push({
      id: "desk",
      label: `Box ${out.length + 1}`,
      contents: "Desk surface and support",
      weightKg: 16,
    });
  const doors = parts.find((r) => r.group === "Doors");
  if (doors)
    out.push({
      id: "doors",
      label: `Box ${out.length + 1}`,
      contents: `${doors.quantity} door${doors.quantity > 1 ? "s" : ""} with hinges`,
      weightKg: Math.round(doors.quantity * (p.height >= 800 ? 5 : 3)),
    });
  const bases = parts.find((r) => r.group === "Base");
  out.push({
    id: "base",
    label: `Box ${out.length + 1}`,
    contents: `${bases?.quantity ?? 1} base${(bases?.quantity ?? 1) > 1 ? "s" : ""}, L-key parked inside`,
    weightKg: (bases?.quantity ?? 1) * 4,
  });
  const acc = parts.filter((r) => r.group === "Accessories");
  out.push({
    id: "tray",
    label: "Tray",
    contents:
      "Bolts grouped by step" +
      (acc.length
        ? ", " +
          acc
            .map(
              (r) =>
                `${r.quantity} ${r.name.toLowerCase()}${r.quantity > 1 ? "s" : ""}`,
            )
            .join(", ")
        : ""),
    weightKg: 1,
  });
  return out;
}

export type Counts = {
  parts: number;
  bolts: number;
  people: 1 | 2;
  minutes: number;
  boxes: number;
  heaviestKg: number;
};

/** what a product page says in numbers */
export function counts(p: Product, c: Configuration): Counts {
  const steps = buildSteps(p, c);
  const bx = boxes(p, c);
  return {
    parts: billOfParts(p, c).reduce((s, r) => s + r.quantity, 0),
    bolts: steps.reduce((s, st) => s + st.bolts, 0),
    people: steps.some((s) => s.people === 2) ? 2 : 1,
    minutes: steps.reduce((s, st) => s + st.minutes, 0),
    boxes: bx.length,
    heaviestKg: Math.max(...bx.map((b) => b.weightKg)),
  };
}
