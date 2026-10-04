import { create } from "zustand";
import {
  conversations as seed,
  type Conversation,
  type PreferenceCategory,
} from "./eva-data";

type PreferenceValue = {
  /** chip ids, or the budget as a range: from and to, S$ */
  values: string[];
  budget?: [number, number];
};

/** how many options of their own a block takes */
export const CUSTOM_MAX = 3;

type EvaState = {
  conversations: Conversation[];
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
};

/** Eva's own state: the conversations and the confirmed preferences. The
    seed is placeholder; two preferences arrive as if Eva heard them. */
export const useEva = create<EvaState>((set) => ({
  conversations: seed,
  draft: "",
  exploration: false,
  activeId: seed[0]?.id ?? null,
  preferences: {
    room: { values: ["Living room"] },
    style: { values: ["Japandi", "Minimalist"] },
  },
  custom: {},
  setDraft: (draft) => set({ draft }),
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
