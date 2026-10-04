import { z } from "zod";
import { CATEGORY_NAMES, sgd } from "./assets-data";
import { products } from "./catalogue";
import { BUDGET, FURNITURE, ROOMS, STYLES, SWATCHES } from "./eva-data";
import {
  fitLines,
  planOf,
  stageOf,
  STAGES,
  type Chip,
  type Context,
  type Reply,
} from "./eva-brain";
import { HDB_CONVENTIONS, metres, ROOM_NAMES } from "./room-data";

/**
 * What the model is told and what it must answer with. The rules are the
 * chatbot's: keep to the order of the work, never invent a product or a
 * price, say why a piece fits in terms of something confirmed, name a
 * clash between styles. The context is the same the rule brain reads, so
 * the two agree on the facts; the answer is a fixed shape that the
 * studio turns into text, proposals, cards and chips. Shared by the API
 * route and its tests.
 */

/** the stable part, cached across turns: who Eva is and what she may pick */
export const EVA_RULES = `You are Eva, the design assistant of Furnishes, a Singapore studio that sells modular 18 mm panel furniture for HDB flats. You help one person plan one room at a time in the Furnishes studio, which shows the room as a plan and in 3D.

The order of the work, which you keep to:
1. Room: its walls and size must be set before any layout advice. If the room is not sized and the person asks for a layout, ask them to draw the walls or pick a template in the Room tab (ask = "room-size").
2. Preferences: style and a budget come before a shopping list. If they ask for a list or prices without a budget, ask for the budget range (ask = "budget"). If they ask for furniture and no room type is known, ask which room (ask = "room").
3. Pieces: pick from the catalogue below, by id only. Never invent a product, a price or a link. At most three picks per answer. Every pick's "why" must cite something confirmed: a kept preference, the room's size, a need they stated, or the budget left.
4. Refine and order: once the core pieces are in the room, help decide what is still missing and when it is ready to order.

Hearing preferences: when the person states a room type, style, colour, furniture need or budget, propose it (do not treat it as kept until they keep it). Use only these names: rooms ${ROOMS.join(", ")}; styles ${STYLES.join(", ")}; colours ${SWATCHES.map((s) => s.name).join(", ")}; needs ${FURNITURE.join(", ")}. A budget is a range in Singapore dollars between ${BUDGET.min} and ${BUDGET.max}, in steps of ${BUDGET.step}.

If two kept styles pull against each other, say so and suggest one as dominant and the other as accent. Prices are always written as S$ with a thousands comma. Measurements in millimetres or metres. Be brief: under 90 words of text unless asked for more, no headings, no lists in the text. If Exploration is on, set the kept preferences aside and range wide, and say so once.

Offer at most three chips: short things the person might say next, in their own voice.

The catalogue (id · name · category · price):
${products
  .filter((p) => p.category !== "components")
  .map(
    (p) =>
      `${p.id} · ${p.name} · ${CATEGORY_NAMES[p.category]} · ${sgd(p.price)}`,
  )
  .join("\n")}`;

/** the facts of this turn */
export const contextText = (c: Context) => {
  const plan = planOf(c);
  const stage = stageOf(c);
  const prefs = Object.entries(c.prefs)
    .map(([k, v]) =>
      v.budget
        ? `${k}: ${sgd(v.budget[0])} to ${sgd(v.budget[1])}`
        : `${k}: ${v.values.join(", ")}`,
    )
    .join("; ");
  return `Room: ${ROOM_NAMES[c.room.id]} in a ${c.room.flat} HDB flat, ${metres(c.room.width)} × ${metres(c.room.depth)}, ${metres(c.room.height)} high. Walls ${c.room.sized ? "set" : "NOT set yet"}.
Stage: ${STAGES.find((s) => s.id === stage)?.label} (${stage}). Readiness ${plan.score}%: ${plan.label}. Still to decide: ${plan.missing.map((k) => CATEGORY_NAMES[k]).join(", ") || "nothing"}.
In the room: ${
    c.pieces
      .map(
        (n) =>
          `${n.name}${n.kind === "piece" && n.price !== undefined ? ` (${sgd(n.price)})` : " (room item)"}`,
      )
      .join(", ") || "nothing yet"
  }. Furnishes pieces total ${sgd(plan.total)}${plan.to !== undefined ? `, budget ${sgd(plan.to)}, ${plan.remaining! >= 0 ? `${sgd(plan.remaining!)} left` : `${sgd(-plan.remaining!)} over`}` : ""}.
In the cart: ${c.cart.length} piece(s).
Kept preferences: ${prefs || "none yet"}. Exploration: ${c.exploration ? "on" : "off"}.
The room's rules: walkways ${c.rules.walkway} mm; the door's swing ${c.rules.doorClear ? "kept clear" : "may be stood in"}; the window ${c.rules.windowClear ? "kept clear of tall pieces" : "may be stood in front of"}; a bed against a wall ${c.rules.bedWall === "off" ? "not asked" : c.rules.bedWall}; must have ${c.rules.mustHave.join(", ") || "nothing in particular"}; layouts ${c.rules.walkway + c.rules.spacing} mm apart.
What fits this room of a ${c.room.flat} HDB flat: ${fitLines(c).join(" ") || "no guidance for this room"}
${plan.bands.length ? `Where the budget should go: ${plan.bands.map((b) => `${b.label} ${sgd(b.from)} to ${sgd(b.upTo)} (${sgd(b.spent)} so far)`).join("; ")}.` : ""}
New HDB flats in general: ${HDB_CONVENTIONS.join("; ")}.`;
};

/** what the model answers with */
export const ReplySchema = z.object({
  text: z.string(),
  ask: z.enum(["room-size", "budget", "room", "none"]),
  proposals: z.array(
    z.object({
      cat: z.enum(["room", "budget", "style", "color", "furniture"]),
      values: z.array(z.string()),
      budgetFrom: z.number().nullable(),
      budgetTo: z.number().nullable(),
    }),
  ),
  picks: z.array(z.object({ id: z.string(), why: z.string() })),
  chips: z.array(z.object({ label: z.string(), send: z.string() })),
});
type ModelReply = z.infer<typeof ReplySchema>;

const snap = (n: number) =>
  Math.min(
    BUDGET.max,
    Math.max(BUDGET.min, Math.round(n / BUDGET.step) * BUDGET.step),
  );

/** the model's answer as the studio shows it: unknown ids and pieces
    already in the room are dropped, a gate becomes its chips */
export const toReply = (m: ModelReply, c: Context): Reply => {
  const inRoom = new Set(c.pieces.map((n) => n.name));
  const cards = m.picks
    .map((p) => ({ product: products.find((x) => x.id === p.id), why: p.why }))
    .filter(
      (x): x is Reply["cards"][number] =>
        x.product !== undefined && !inRoom.has(x.product.name),
    )
    .slice(0, 3);
  const proposals = m.proposals.flatMap((p): Reply["proposals"] => {
    if (p.cat === "budget") {
      if (p.budgetTo === null) return [];
      const from = snap(p.budgetFrom ?? BUDGET.min);
      const to = snap(p.budgetTo);
      return [
        {
          cat: "budget" as const,
          values: [`${sgd(from)} – ${sgd(to)}`],
          budget: [Math.min(from, to), Math.max(from, to)] as [number, number],
        },
      ];
    }
    const values = p.values
      .map((v) => v.trim())
      .filter((v) => v && !c.prefs[p.cat]?.values.includes(v));
    return values.length ? [{ cat: p.cat, values }] : [];
  });
  const gate: Chip[] =
    m.ask === "room-size"
      ? [{ label: "Open the Room tab", act: "room-tab" }]
      : m.ask === "budget"
        ? [1500, 3000, 5000].map((n): Chip => ({
            label: `Under ${sgd(n)}`,
            act: "budget",
            budget: [BUDGET.min, n],
          }))
        : [];
  const chips: Chip[] = [
    ...gate,
    ...m.chips.slice(0, 3).map((ch) => ({ label: ch.label, send: ch.send })),
  ];
  if (cards.length)
    chips.unshift(
      { label: "More options", act: "more" },
      { label: "Cheaper", act: "cheaper" },
    );
  return { text: m.text, proposals, cards, chips: chips.slice(0, 5) };
};
