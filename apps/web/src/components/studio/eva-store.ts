import { create } from "zustand";
import {
  conversations as seed,
  type Conversation,
  type Message,
  type PreferenceCategory,
} from "./eva-data";
import { sgd } from "./assets-data";
import {
  recommend,
  reply,
  type ChatMode,
  type Chip,
  type Context,
  type Reply,
} from "./eva-brain";
import { CUSTOM_OPTIONS } from "./eva-data";
import { FLOW_NAMES, type Flow } from "./quiz-data";
import type { QuizResult } from "./quiz-engine";
import { useRoom } from "./room-store";
import { useScene } from "./scene-store";
import { useStudio } from "./studio-store";

type PreferenceValue = {
  /** chip ids, or the budget as a range: from and to, S$ */
  values: string[];
  budget?: [number, number];
};

/** how many options of their own a block takes */
export const CUSTOM_MAX = 3;

type EvaState = {
  conversations: Conversation[];
  /** what was said in each conversation, by its id */
  messages: Record<string, Message[]>;
  /** text a prompt chip hands to the input box */
  draft: string;
  /** exploration: Eva sets the preferences aside and stays open to
      anything, instead of narrowing to what they say */
  exploration: boolean;
  activeId: string | null;
  /** Eva is answering (the route is being asked) */
  thinking: boolean;
  /** no model is connected on this server: the rules answer, and the
      Agent tab says so once */
  offline: boolean;
  preferences: Partial<Record<PreferenceCategory, PreferenceValue>>;
  /** options typed in by hand, per block, up to CUSTOM_MAX */
  custom: Partial<Record<PreferenceCategory, string[]>>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  /** toggle one chip; single-value blocks replace instead */
  toggleValue: (cat: PreferenceCategory, value: string, multi: boolean) => void;
  setBudget: (from: number, to: number) => void;
  clearPreference: (cat: PreferenceCategory) => void;
  /** add an option of one's own and pick it; a fourth is refused */
  addCustom: (cat: PreferenceCategory, value: string, multi: boolean) => void;
  removeCustom: (cat: PreferenceCategory, value: string) => void;
  setDraft: (draft: string) => void;
  setExploration: (on: boolean) => void;
  /** start a conversation and make it the open one */
  newConversation: () => string;
  /** say something in the open conversation (a new one if none): the
      model answers when one is connected, the rules otherwise */
  send: (text: string, image?: string, mode?: ChatMode) => Promise<void>;
  /** a thumb on one of Eva's answers; the same thumb again takes it off */
  rate: (msgId: string, rating: "up" | "down") => void;
  /** a finished quiz: Eva says what it found and proposes its preferences */
  fromQuiz: (flow: Flow, result: QuizResult) => void;
  /** take up, or set aside, a preference Eva heard */
  settleProposal: (msgId: string, i: number, take: boolean) => void;
  /** a chip under one of Eva's messages: say it, or do it */
  pickChip: (msgId: string, chip: Chip) => void;
  /** what Eva knows right now, for the room plan */
  context: () => Context;
};

let seq = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** what Eva knows at this moment, from the room and the scene */
const contextOf = (
  s: Pick<EvaState, "preferences" | "exploration">,
): Context => {
  const r = useRoom.getState();
  const sc = useScene.getState();
  return {
    room: {
      id: r.room,
      flat: r.flat,
      width: r.width,
      depth: r.depth,
      height: r.height,
      sized: r.start !== null,
    },
    pieces: sc.groups.flatMap((g) => g.items).filter((n) => n.kind !== "fixed"),
    cart: sc.cart,
    prefs: s.preferences,
    exploration: s.exploration,
  };
};

/** Eva's own state: the conversations and the confirmed preferences. The
    seed is placeholder; two preferences arrive as if Eva heard them. */
export const useEva = create<EvaState>((set, get) => ({
  conversations: seed,
  messages: {},
  draft: "",
  thinking: false,
  offline: false,
  exploration: false,
  activeId: seed[0]?.id ?? null,
  preferences: {
    room: { values: ["Living room"] },
    style: { values: ["Japandi", "Minimalist"] },
  },
  custom: {},
  setDraft: (draft) => set({ draft }),
  newConversation: () => {
    const c: Conversation = {
      id: nextId("c"),
      title: "New conversation",
      snippet: "",
      at: Date.now(),
      turns: 0,
    };
    set((s) => ({ conversations: [c, ...s.conversations], activeId: c.id }));
    return c.id;
  },
  send: async (text, image, mode = "ask") => {
    const body = text.trim();
    if (!body && !image) return;
    const id = get().activeId ?? get().newConversation();
    const now = Date.now();
    const you: Message = { id: nextId("m"), who: "you", text: body, at: now };
    if (image) you.image = image;
    const asked = body || `the picture ${image}`;
    set((s) => ({
      thinking: true,
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), you] },
      conversations: s.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              title:
                c.title === "New conversation" && body
                  ? body.slice(0, 48)
                  : c.title,
              snippet: body || `Picture: ${image}`,
              at: now,
              turns: c.turns + 1,
            }
          : c,
      ),
    }));
    const ctx = contextOf(get());
    const thread = (get().messages[id] ?? [])
      .slice(-9, -1)
      .map((m) => ({ who: m.who, text: m.text }));
    let r: Reply;
    let source: Message["source"] = "rules";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: asked, thread, context: ctx, mode }),
      });
      if (res.ok) {
        r = ((await res.json()) as { reply: Reply }).reply;
        source = "model";
      } else {
        if (res.status === 503) set({ offline: true });
        r = reply(asked, ctx, mode);
      }
    } catch {
      r = reply(asked, ctx, mode);
    }
    const eva: Message = {
      id: nextId("m"),
      who: "eva",
      text: r.text,
      at: Date.now(),
      source,
      ...(r.proposals.length ? { proposals: r.proposals } : {}),
      ...(r.cards.length ? { cards: r.cards } : {}),
      ...(r.chips.length ? { chips: r.chips } : {}),
    };
    set((s) => ({
      thinking: false,
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), eva] },
    }));
  },
  fromQuiz: (flow, result) => {
    const id = get().activeId ?? get().newConversation();
    const eva: Message = {
      id: nextId("m"),
      who: "eva",
      text: `From your ${FLOW_NAMES[flow].toLowerCase()}: ${result.title}. ${result.lead} Keep what fits and I'll plan to it.`,
      at: Date.now(),
      source: "rules",
      proposals: result.proposals,
    };
    set((s) => ({
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), eva] },
    }));
  },
  rate: (msgId, rating) => {
    const { activeId } = get();
    if (!activeId) return;
    set((s) => ({
      messages: {
        ...s.messages,
        [activeId]: (s.messages[activeId] ?? []).map((m) => {
          if (m.id !== msgId) return m;
          const next = { ...m };
          if (m.rating === rating) delete next.rating;
          else next.rating = rating;
          return next;
        }),
      },
    }));
  },
  settleProposal: (msgId, i, take) => {
    const { activeId, messages } = get();
    if (!activeId) return;
    const msg = messages[activeId]?.find((m) => m.id === msgId);
    const p = msg?.proposals?.[i];
    if (!msg || !p || p.settled) return;
    if (take) {
      if (p.budget) get().setBudget(p.budget[0], p.budget[1]);
      else {
        const multi = p.cat !== "room";
        for (const v of p.values) {
          const known = (CUSTOM_OPTIONS[p.cat] ?? []).includes(v);
          if (known || p.cat === "color" || p.cat === "furniture")
            get().toggleValue(p.cat, v, multi);
          else get().addCustom(p.cat, v, multi);
        }
      }
    }
    set((s) => ({
      messages: {
        ...s.messages,
        [activeId]: s.messages[activeId]!.map((m) =>
          m.id === msgId
            ? {
                ...m,
                proposals: m.proposals!.map((q, j) =>
                  j === i
                    ? { ...q, settled: take ? "accepted" : "dismissed" }
                    : q,
                ),
              }
            : m,
        ),
      },
    }));
  },
  pickChip: (msgId, chip) => {
    if (chip.send) return get().send(chip.send);
    if (chip.act === "room-tab")
      return useStudio.getState().setPanelTab("room");
    if (chip.act === "budget" && chip.budget) {
      get().setBudget(chip.budget[0], chip.budget[1]);
      return get().send(`My budget is up to ${sgd(chip.budget[1])}`);
    }
    // more, or cheaper: another three, after the ones already shown
    const { activeId, messages } = get();
    if (!activeId) return;
    const thread = messages[activeId] ?? [];
    const shown = thread.flatMap(
      (m) => m.cards?.map((c) => c.product.id) ?? [],
    );
    const asked =
      [...thread].reverse().find((m) => m.who === "you")?.text ?? "";
    const cards = recommend(contextOf(get()), asked, {
      skip: chip.act === "more" ? shown : [],
      cheaper: chip.act === "cheaper",
    });
    const eva: Message = {
      id: nextId("m"),
      who: "eva",
      text: cards.length
        ? chip.act === "cheaper"
          ? "The same, from the least dear up."
          : "Three more that would fit."
        : "That is everything in the catalogue that fits for now.",
      at: Date.now(),
      ...(cards.length
        ? { cards, chips: [{ label: "More options", act: "more" as const }] }
        : {}),
    };
    set((s) => ({
      messages: { ...s.messages, [activeId]: [...thread, eva] },
    }));
  },
  context: () => contextOf(get()),
  setExploration: (exploration) => set({ exploration }),
  selectConversation: (id) => set({ activeId: id }),
  deleteConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),
  renameConversation: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
    })),
  toggleValue: (cat, value, multi) =>
    set((s) => {
      const cur = s.preferences[cat]?.values ?? [];
      const on = cur.includes(value);
      const values = multi
        ? on
          ? cur.filter((v) => v !== value)
          : [...cur, value]
        : on
          ? []
          : [value];
      const next = { ...s.preferences };
      if (values.length === 0) delete next[cat];
      else next[cat] = { values };
      return { preferences: next };
    }),
  addCustom: (cat, value, multi) =>
    set((s) => {
      const v = value.trim();
      const cur = s.custom[cat] ?? [];
      if (!v || cur.includes(v) || cur.length >= CUSTOM_MAX) return {};
      const was = s.preferences[cat]?.values ?? [];
      const values = multi ? [...was, v] : [v];
      return {
        custom: { ...s.custom, [cat]: [...cur, v] },
        preferences: { ...s.preferences, [cat]: { values } },
      };
    }),
  removeCustom: (cat, value) =>
    set((s) => {
      const custom = {
        ...s.custom,
        [cat]: (s.custom[cat] ?? []).filter((x) => x !== value),
      };
      const values = (s.preferences[cat]?.values ?? []).filter(
        (x) => x !== value,
      );
      const preferences = { ...s.preferences };
      if (values.length === 0) delete preferences[cat];
      else preferences[cat] = { values };
      return { custom, preferences };
    }),
  setBudget: (from, to) =>
    set((s) => ({
      preferences: {
        ...s.preferences,
        budget: { values: [], budget: [from, to] },
      },
    })),
  clearPreference: (cat) =>
    set((s) => {
      const next = { ...s.preferences };
      delete next[cat];
      return { preferences: next };
    }),
}));
