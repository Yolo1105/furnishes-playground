import type { PieceProps } from "./piece-detail";
import type { Rules } from "./room-data";
import type { Issue } from "./room-health";
import type { Placed, PlanId } from "./room-layout";

/**
 * What a layout would do, in words and in a number: its cost against
 * the room's rules and priorities (the lower the better; Eva picks the
 * lowest), what it would leave unresolved, and which pieces it would
 * move, turn or leave. Everything here is read off the layout and the
 * findings, so it is the same answer every time and needs no model.
 */
/** a piece's journey from where it stands to where a layout puts it */
type Move = {
  id: string;
  name: string;
  /** mm, across the floor */
  dist: number;
  turns: boolean;
};
type Explained = {
  /** the cost: findings weighed by the priorities, and the room's feel */
  score: number;
  /** what the layout would leave, worst first */
  issues: Issue[];
  /** the pieces that would move or turn, farthest first */
  moves: Move[];
  /** how many stay exactly where they are */
  stays: number;
};

/** how much a finding weighs, before the priorities lean on it */
const WEIGHT: Record<Issue["kind"], number> = {
  outside: 2,
  overlap: 2,
  door: 1,
  walkway: 1,
  window: 0.5,
  bed: 1,
  missing: 0,
  // a layout moves the pieces, never the room: a room standing into
  // another weighs the same whichever way its pieces stand
  rooms: 0,
};
/** past this a priority is spoken of; under its mirror, the other way */
const LEANS = 70;
/** a move under this is standing still (the plan's own grid) */
const STILL = 50;

/** the cost of a layout: each finding's weight, flow leaning on the
    walkways and the door, light on the window; then the room's feel,
    an open middle favouring Along the walls and a cosy room the rows */
const scoreOf = (issues: Issue[], plan: PlanId, rules: Rules) => {
  const flow = rules.flow / 100;
  const open = rules.open / 100;
  let s = 0;
  for (const i of issues) {
    const lean =
      i.kind === "walkway" || i.kind === "door"
        ? flow
        : i.kind === "window"
          ? open
          : 0;
    s += WEIGHT[i.kind] + lean;
  }
  s +=
    plan === "walls" || plan === "book"
      ? (0.5 - open) * 1.5
      : (open - 0.5) * 0.75;
  return s;
};

export const explainPlan = (
  plan: PlanId,
  places: readonly Placed[],
  now: readonly { x: number; y: number }[],
  pieces: readonly { id: string; name: string; props: PieceProps }[],
  issues: Issue[],
  rules: Rules,
): Explained => {
  const left = issues.filter((i) => i.kind !== "missing");
  const moves: Move[] = [];
  let stays = 0;
  pieces.forEach((p, i) => {
    const to = places[i]!;
    const from = now[i]!;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const turns = to.rotation !== p.props.rotation;
    if (dist < STILL && !turns) stays += 1;
    else moves.push({ id: p.id, name: p.name, dist, turns });
  });
  moves.sort((a, b) => b.dist - a.dist);
  return {
    score: scoreOf(left, plan, rules),
    issues: [...left].sort((a, b) => WEIGHT[b.kind] - WEIGHT[a.kind]),
    moves,
    stays,
  };
};

/** how far a layout moves the pieces altogether, mm */
export const travel = (moves: readonly Move[]) =>
  moves.reduce((t, m) => t + m.dist, 0);

/** the lines that say why a layout stands where it does among the
    four: what it does, what the priorities ask, what it would leave */
export const whyLines = (
  plan: PlanId,
  e: Explained,
  rules: Rules,
  picked: boolean,
  tied: boolean,
): string[] => {
  const out: string[] = [];
  if (plan === "walls") out.push("The middle stays open to walk and sit.");
  else if (plan === "book")
    out.push(
      "The anchors stand where a designer would start them; the rest go along the walls.",
    );
  else
    out.push(
      plan === "rows"
        ? "The pieces stand in rows across the width."
        : "The pieces stand in rows down the depth.",
    );
  if (rules.open >= LEANS)
    out.push(
      plan === "walls" || plan === "book"
        ? "You asked for an open room, which this gives."
        : "You asked for an open room, which rows give less of.",
    );
  else if (rules.open <= 100 - LEANS)
    out.push(
      plan === "walls" || plan === "book"
        ? "You asked for a cosy room, which an open middle gives less of."
        : "You asked for a cosy room, which rows give.",
    );
  if (rules.flow >= LEANS)
    out.push(
      "Flow comes first, so a narrow gap or a blocked door weighs more.",
    );
  else if (rules.flow <= 100 - LEANS)
    out.push("Storage comes first, so a narrow gap weighs less.");
  out.push(
    e.issues.length === 0
      ? "It leaves nothing for the planner to flag."
      : `It would leave ${e.issues.length} ${e.issues.length === 1 ? "finding" : "findings"}.`,
  );
  if (picked)
    out.push(
      tied
        ? "Eva's pick: the costs tie, so the layout that moves the least."
        : "Eva's pick: the lowest cost against your rules and priorities.",
    );
  return out;
};
