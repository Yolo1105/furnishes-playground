import { create } from "zustand";
import {
  BRAINSTORM,
  followupsFor,
  FURNISH,
  ROOM_KIND,
  ROOM_REVIEW,
  SHORTER,
  type Conversation,
  type Message,
  type PersonaId,
  type PreferenceCategory,
} from "./eva-data";
import { sgd } from "./assets-data";
import {
  isLong,
  recommend,
  reply,
  shorter,
  type ChatMode,
  type Chip,
  type Context,
  type Reply,
  type Standing,
} from "./eva-brain";
import { CUSTOM_OPTIONS } from "./eva-data";
import { FLOW_NAMES, type Flow } from "./quiz-data";
import type { QuizResult } from "./quiz-engine";
import { footprint, type PieceProps } from "./piece-detail";
import { layoutsOf } from "./piece-actions";
import { describeItem } from "./generation-store";
import { products } from "./catalogue";
import { healthOf } from "./room-health";
import {
  activeOf,
  footprintOf,
  openingsOf,
  overlapText,
  roomOverlaps,
  useRoom,
} from "./room-store";
import { inRoom, propsOf, standingOf, useScene } from "./scene-store";
import { newId } from "./ids";
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
  /** which Eva answers: the same assistant leaning one way */
  persona: PersonaId;
  /** the turn under way, to stop it */
  turn: AbortController | null;
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
  send: (text: string, mode?: ChatMode) => Promise<void>;
  /** a thumb on one of Eva's answers; the same thumb again takes it off */
  rate: (msgId: string, rating: "up" | "down") => void;
  setPersona: (persona: PersonaId) => void;
  /** keep one of Eva's answers with the project, or let it go */
  pin: (msgId: string) => void;
  /** stop the answer under way: nothing arrives */
  stop: () => void;
  /** Brainstorm for me: three directions for the room */
  brainstorm: () => Promise<void>;
  /** a finished quiz: Eva says what it found and proposes its preferences */
  fromQuiz: (flow: Flow, result: QuizResult) => void;
  /** take up, or set aside, a preference Eva heard */
  settleProposal: (msgId: string, i: number, take: boolean) => void;
  /** do what Eva's changes say, as one undo step, or set them aside */
  applyChanges: (msgId: string, take: boolean) => void;
  /** Furnish this room: what it lacks, laid out by the book */
  furnish: () => Promise<void>;
  /** Review this room: what Eva notices about it as it stands */
  reviewRoom: () => Promise<void>;
  /** a chip under one of Eva's messages: say it, or do it */
  pickChip: (msgId: string, chip: Chip) => void;
  /** what Eva knows right now, for the room plan */
  context: () => Context;
};

/** what Eva knows at this moment, from the room and the scene */
const contextOf = (
  s: Pick<EvaState, "preferences" | "exploration" | "persona">,
): Context => {
  const st = useRoom.getState();
  const r = activeOf(st);
  const sc = useScene.getState();
  // what stands in the active room, not the whole flat, each where it
  // stands: placed by hand, or where the room laid it out
  const pieces: Standing[] = sc.groups
    .flatMap((g) => g.items)
    .filter(
      (n) =>
        n.kind !== "fixed" &&
        inRoom(sc.overrides[n.id] ?? {}, r.id, st.rooms[0]!.id),
    )
    .map((n): Standing => {
      const p = propsOf(n, sc.overrides);
      const spot =
        p.x !== undefined && p.y !== undefined
          ? { x: p.x, y: p.y }
          : standingOf(n.id);
      if (!spot || p.hidden) return n;
      const f = footprint(p);
      return { ...n, at: { ...spot, w: f.w, d: f.d, rotation: p.rotation } };
    });
  // what the planner flags, in its words: the same findings the plan
  // shows, the room's own standing in the flat first
  const findings = [
    ...roomOverlaps(st.rooms, r.id).map((o) => overlapText(st.rooms, r, o)),
    ...healthOf(
      pieces.flatMap((n) =>
        n.at
          ? [
              {
                id: n.id,
                name: n.name,
                ...n.at,
                h: propsOf(n, sc.overrides).height,
              },
            ]
          : [],
      ),
      {
        W: r.width,
        D: r.depth,
        outline: footprintOf(r),
        openings: openingsOf(st, r),
        rules: r.rules,
        thickness: r.thickness,
      },
    )
      .filter((i) => i.kind !== "missing")
      .map((i) => i.text),
  ].slice(0, 8);
  return {
    room: {
      id: r.room,
      flat: st.flat,
      width: r.width,
      depth: r.depth,
      height: r.height,
      sized: r.start !== null,
    },
    pieces,
    cart: sc.cart,
    findings,
    prefs: s.preferences,
    exploration: s.exploration,
    rules: r.rules,
    persona: s.persona,
  };
};

/** Shorter, answered by the rules from the thread when no model is
    connected: the latest answer's first sentence or two */
const refined = (text: string, thread: Message[]): Reply | null => {
  if (text !== SHORTER.send) return null;
  const last = [...thread].reverse().find((m) => m.who === "eva");
  return {
    text: last ? shorter(last.text) : "There is nothing to shorten yet.",
    proposals: [],
    cards: [],
    chips: [],
  };
};

/** Eva's own state: the conversations and the confirmed preferences.
    No conversation until one is started; a style arrives as if Eva
    heard it, so her first picks have a lean. */
export const useEva = create<EvaState>((set, get) => ({
  conversations: [],
  messages: {},
  draft: "",
  thinking: false,
  offline: false,
  persona: "eva",
  turn: null,
  exploration: false,
  activeId: null,
  preferences: {
    style: { values: ["Japandi", "Minimalist"] },
  },
  custom: {},
  setDraft: (draft) => set({ draft }),
  newConversation: () => {
    const c: Conversation = {
      id: newId("c"),
      title: "New conversation",
      snippet: "",
      at: Date.now(),
      turns: 0,
    };
    set((s) => ({ conversations: [c, ...s.conversations], activeId: c.id }));
    return c.id;
  },
  send: async (text, mode = "ask") => {
    const body = text.trim();
    if (!body) return;
    const id = get().activeId ?? get().newConversation();
    const now = Date.now();
    const you: Message = { id: newId("m"), who: "you", text: body, at: now };
    const asked = body;
    set((s) => ({
      thinking: true,
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), you] },
      conversations: s.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              title:
                c.title === "New conversation" ? body.slice(0, 48) : c.title,
              snippet: body,
              at: now,
              turns: c.turns + 1,
            }
          : c,
      ),
    }));
    const ctx = contextOf(get());
    const whole = get().messages[id] ?? [];
    const thread = whole
      .slice(-9, -1)
      .map((m) => ({ who: m.who, text: m.text }));
    const turn = new AbortController();
    set({ turn });
    let r: Reply;
    let source: Message["source"] = "rules";
    const own = () =>
      refined(asked, whole.slice(0, -1)) ?? reply(asked, ctx, mode);
    // a review is its own route, with a day's share; past it, or
    // without a key, the rules review the room
    const review = asked === ROOM_REVIEW;
    try {
      const res = await fetch(review ? "/api/suggestions" : "/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          review
            ? { context: ctx }
            : { message: asked, thread, context: ctx, mode },
        ),
        signal: turn.signal,
      });
      if (res.ok) {
        r = ((await res.json()) as { reply: Reply }).reply;
        source = "model";
      } else {
        if (res.status === 503) set({ offline: true });
        r = own();
        if (review && res.status === 429)
          r = {
            ...r,
            text: `That is the day's share of reviews from the model; the studio's own rules looked instead. ${r.text}`,
          };
      }
    } catch {
      // stopped: nothing arrives
      if (turn.signal.aborted) return;
      r = own();
    }
    if (turn.signal.aborted) return;
    // what might be said next, when the answer offers nothing itself; a
    // long answer offers itself shorter
    const chips: Chip[] = r.chips.length
      ? [...r.chips]
      : followupsFor(r.text).map((label) => ({ label, send: label }));
    if (isLong(r.text) && !chips.some((c) => c.label === SHORTER.label))
      chips.push(SHORTER);
    const eva: Message = {
      id: newId("m"),
      who: "eva",
      text: r.text,
      at: Date.now(),
      source,
      ...(r.proposals.length ? { proposals: r.proposals } : {}),
      ...(r.cards.length ? { cards: r.cards } : {}),
      ...(r.changes ? { changes: r.changes } : {}),
      ...(r.observations?.length ? { observations: r.observations } : {}),
      chips,
    };
    set((s) => ({
      thinking: false,
      turn: s.turn === turn ? null : s.turn,
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), eva] },
    }));
  },
  stop: () => {
    get().turn?.abort();
    set({ turn: null, thinking: false });
  },
  brainstorm: () => get().send(BRAINSTORM),
  furnish: () => get().send(FURNISH, "layout"),
  reviewRoom: () => get().send(ROOM_REVIEW),
  applyChanges: (msgId, take) => {
    const { activeId, messages } = get();
    if (!activeId) return;
    const msg = messages[activeId]?.find((m) => m.id === msgId);
    const ch = msg?.changes;
    if (!msg || !ch || ch.settled) return;
    if (take) {
      const st = useRoom.getState();
      const r = activeOf(st);
      const roomId = r.id;
      const adds = ch.adds.flatMap((a) => {
        const product = products.find((p) => p.id === a.id);
        return product ? [{ product, roomId }] : [];
      });
      useScene.getState().change(
        {
          removes: ch.removes.map((x) => x.id),
          adds,
          items: ch.items.map((it) => ({
            item: describeItem(it.words),
            roomId,
          })),
        },
        (added) => {
          // the spots Eva named, then the layout she asked for over
          // everything in the room
          const places: Record<string, Partial<PieceProps>> = {};
          for (const m of ch.moves)
            places[m.id] = { x: m.x, y: m.y, rotation: m.rotation };
          ch.adds.forEach((a, i) => {
            const node = added[i];
            if (node && a.x !== undefined && a.y !== undefined)
              places[node.id] = { x: a.x, y: a.y };
          });
          ch.items.forEach((it, i) => {
            const node = added[ch.adds.length + i];
            if (node && it.x !== undefined && it.y !== undefined)
              places[node.id] = { x: it.x, y: it.y };
          });
          if (ch.layout) {
            const sc = useScene.getState();
            const gone = new Set(ch.removes.map((x) => x.id));
            const standing = [
              ...sc.groups
                .flatMap((g) => g.items)
                .filter(
                  (n) =>
                    !gone.has(n.id) &&
                    n.kind !== "fixed" &&
                    inRoom(sc.overrides[n.id] ?? {}, roomId, st.rooms[0]!.id),
                ),
              ...added,
            ];
            const overrides = { ...sc.overrides };
            for (const [id, patch] of Object.entries(places))
              overrides[id] = { ...overrides[id], ...patch };
            for (const n of added)
              overrides[n.id] = { ...overrides[n.id], roomId };
            const plan = layoutsOf(r, st.joins, standing, overrides).plans.find(
              (p) => p.id === ch.layout,
            );
            if (plan)
              standing.forEach((n, i) => {
                const at = plan.places[i]!;
                if (!propsOf(n, overrides).locked)
                  places[n.id] = { ...places[n.id], ...at };
              });
          }
          return places;
        },
      );
    }
    set((s) => ({
      messages: {
        ...s.messages,
        [activeId]: s.messages[activeId]!.map((m) =>
          m.id === msgId
            ? {
                ...m,
                changes: { ...ch, settled: take ? "applied" : "dismissed" },
              }
            : m,
        ),
      },
    }));
  },
  setPersona: (persona) => set({ persona }),
  pin: (msgId) => {
    const { activeId } = get();
    if (!activeId) return;
    set((s) => ({
      messages: {
        ...s.messages,
        [activeId]: (s.messages[activeId] ?? []).map((m) =>
          m.id === msgId ? { ...m, pinned: !m.pinned } : m,
        ),
      },
    }));
  },
  fromQuiz: (flow, result) => {
    const id = get().activeId ?? get().newConversation();
    const eva: Message = {
      id: newId("m"),
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
      if (p.cat === "room") {
        // the room is the Room tab's: a kept room becomes the active room
        const kind = ROOM_KIND[p.values[0] as keyof typeof ROOM_KIND];
        if (kind) useRoom.getState().setRoom(kind);
      } else if (p.budget) get().setBudget(p.budget[0], p.budget[1]);
      else {
        for (const v of p.values) {
          const known = (CUSTOM_OPTIONS[p.cat] ?? []).includes(v);
          if (known || p.cat === "color" || p.cat === "furniture")
            get().toggleValue(p.cat, v, true);
          else get().addCustom(p.cat, v, true);
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
      id: newId("m"),
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
