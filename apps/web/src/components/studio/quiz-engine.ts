import { sgd } from "./assets-data";
import type { PreferenceCategory } from "./eva-data";
import {
  budgetOf,
  ROOM_QUIZ,
  STYLE_PROFILES,
  STYLE_QUIZ,
  type Flow,
  type StyleKey,
} from "./quiz-data";

/**
 * What a finished quiz says: a summary for the result screen, and the
 * preferences it proposes, which go to Eva as proposals to keep or set
 * aside, never kept on their own.
 */
type QuizProposal = {
  cat: PreferenceCategory;
  values: string[];
  budget?: [number, number];
};
export type QuizResult = {
  title: string;
  lead: string;
  body: string;
  palette?: string[];
  proposals: QuizProposal[];
};

type Answers = Record<string, string[]>;

/** the five-way tally of a style quiz, highest first */
const tallyOf = (answers: Answers) => {
  const t: Record<StyleKey, number> = {
    minimal: 0,
    maximalist: 0,
    organic: 0,
    industrial: 0,
    artisan: 0,
  };
  for (const q of STYLE_QUIZ)
    for (const id of answers[q.id] ?? []) {
      const s = q.options.find((o) => o.id === id)?.style;
      if (s) t[s] += 1;
    }
  return (Object.entries(t) as [StyleKey, number][]).sort(
    (a, b) => b[1] - a[1],
  );
};

export const resultOf = (flow: Flow, answers: Answers): QuizResult => {
  if (flow === "style") {
    const ranked = tallyOf(answers);
    const [first, second] = ranked;
    const p = STYLE_PROFILES[first![0]];
    const q = second && second[1] > 0 ? STYLE_PROFILES[second[0]] : null;
    const styles = [
      ...new Set([...p.styles, ...(q?.styles.slice(0, 1) ?? [])]),
    ];
    return {
      title: p.name,
      lead: p.tagline,
      body: `${p.description}${q ? ` With a streak of ${q.name.replace("The ", "the ")}.` : ""}`,
      palette: p.palette,
      proposals: [
        { cat: "style", values: styles },
        { cat: "color", values: p.colours },
      ],
    };
  }
  if (flow === "budget") {
    const [lo, hi] = budgetOf(answers);
    const approach = answers.b1?.[0];
    return {
      title: `${sgd(lo)} to ${sgd(hi)}`,
      lead:
        approach === "hard"
          ? "A hard cap: Eva keeps under the top of this."
          : approach === "flexible"
            ? "Flexible: the top can stretch a little for the right piece."
            : "Exploring: Eva will show pieces across this range.",
      body: "Worked out from the room, its size, where you start, how long it should last, the quality you want and how you like to buy. Change it any time in the Budget block.",
      proposals: [
        {
          cat: "budget",
          values: [`${sgd(lo)} – ${sgd(hi)}`],
          budget: [lo, hi],
        },
      ],
    };
  }
  const room = answers.r0?.[0];
  const needs = new Set(answers.r10 ?? []);
  const who = answers.r1?.[0];
  const pets = answers.r2?.[0];
  const light = answers.r5?.[0];
  const uses = new Set(answers.r9 ?? []);
  if (uses.has("r9c") || uses.has("r9k")) needs.add("Desk");
  if (uses.has("r9b")) needs.add("Shelving");
  if (
    who === "r1c" ||
    who === "r1f" ||
    uses.has("r9f") ||
    (pets && pets !== "r2e")
  )
    needs.add("Storage");
  const colours =
    light === "r5c"
      ? ["Soft white", "Warm neutrals"]
      : light === "r5a"
        ? ["Cool grey", "Sage"]
        : ["Birch", "Warm neutrals"];
  const notes: string[] = [];
  if (who === "r1c")
    notes.push("young kids: closed storage at low level, rounded edges");
  if (pets && pets !== "r2e")
    notes.push("pets: hard-wearing finishes, nothing low and open");
  if (light === "r5c") notes.push("a dim room: light finishes to lift it");
  const list = ROOM_QUIZ.find((q) => q.id === "r10")!.options;
  return {
    title: room ?? "Your room",
    lead: `${[...needs].map((n) => list.find((o) => o.id === n)?.label.toLowerCase() ?? n.toLowerCase()).join(", ") || "nothing fixed yet"}.`,
    body: notes.length
      ? `Eva will keep in mind: ${notes.join("; ")}.`
      : "Eva will plan around how the room is used.",
    proposals: [
      ...(room ? [{ cat: "room" as const, values: [room] }] : []),
      ...(needs.size
        ? [{ cat: "furniture" as const, values: [...needs] }]
        : []),
      { cat: "color", values: colours },
    ],
  };
};
