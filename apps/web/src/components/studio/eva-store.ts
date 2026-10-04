import { create } from "zustand";
import {
  conversations as seed,
  type Conversation,
  type Message,
  type PreferenceCategory,
} from "./eva-data";
import { pieceTotals, sgd } from "./assets-data";
import { metres, ROOM_NAMES } from "./room-data";
import { useRoom } from "./room-store";
import { useScene } from "./scene-store";

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
  /** say something in the open conversation (a new one if none): Eva answers
      with what she has read, until she is wired to think */
  send: (text: string, image?: string) => void;
};

let seq = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** Eva's answer for now: what she has read, said back */
const evaReply = (text: string, exploration: boolean) => {
  const r = useRoom.getState();
  const pieces = useScene
    .getState()
    .groups.flatMap((g) => g.items)
    .filter((n) => n.kind === "piece");
  const t = pieceTotals(pieces);
  const room = `${ROOM_NAMES[r.room]}, ${metres(r.width)} × ${metres(r.depth)}`;
  const held = `${t.pieces} pieces at ${sgd(t.total)}`;
  const stance = exploration
    ? "Exploration is on, so I'll range wide rather than keep to your preferences."
    : "I'll keep to your preferences.";
  return `On "${text}": I'm reading the ${room}, with ${held}. ${stance} I'm not connected to plan yet; when I am, this is where the plan comes back.`;
};

/** Eva's own state: the conversations and the confirmed preferences. The
    seed is placeholder; two preferences arrive as if Eva heard them. */
export const useEva = create<EvaState>((set, get) => ({
  conversations: seed,
  messages: {},
  draft: "",
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
  send: (text, image) => {
    const body = text.trim();
    if (!body && !image) return;
    const id = get().activeId ?? get().newConversation();
    const now = Date.now();
    const you: Message = { id: nextId("m"), who: "you", text: body, at: now };
    if (image) you.image = image;
    const eva: Message = {
      id: nextId("m"),
      who: "eva",
      text: evaReply(body || `the picture ${image}`, get().exploration),
      at: now + 1,
    };
    set((s) => ({
      messages: { ...s.messages, [id]: [...(s.messages[id] ?? []), you, eva] },
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
  },
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
