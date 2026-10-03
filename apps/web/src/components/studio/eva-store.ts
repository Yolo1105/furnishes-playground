import { create } from "zustand";
import {
  conversations as seed,
  type Conversation,
  type PreferenceCategory,
  type PreferenceOrigin,
} from "./eva-data";

export type PreferenceValue = {
  /** chip ids, or the budget as one number */
  values: string[];
  budget?: number;
  origin: PreferenceOrigin;
};

type EvaState = {
  conversations: Conversation[];
  activeId: string | null;
  preferences: Partial<Record<PreferenceCategory, PreferenceValue>>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  /** toggle one chip; single-value blocks replace instead */
  toggleValue: (cat: PreferenceCategory, value: string, multi: boolean) => void;
  setBudget: (value: number) => void;
  clearPreference: (cat: PreferenceCategory) => void;
};

/** Eva's own state: the conversations and the confirmed preferences. The
    seed is placeholder; two preferences arrive as if Eva heard them. */
export const useEva = create<EvaState>((set) => ({
  conversations: seed,
  activeId: seed[0]?.id ?? null,
  preferences: {
    room: { values: ["Living room"], origin: "chat" },
    style: { values: ["Japandi", "Minimalist"], origin: "chat" },
  },
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
      else next[cat] = { values, origin: "you" };
      return { preferences: next };
    }),
  setBudget: (value) =>
    set((s) => ({
      preferences: {
        ...s.preferences,
        budget: { values: [], budget: value, origin: "you" },
      },
    })),
  clearPreference: (cat) =>
    set((s) => {
      const next = { ...s.preferences };
      delete next[cat];
      return { preferences: next };
    }),
}));
