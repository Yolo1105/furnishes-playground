import { newId } from "./ids";
import { create } from "zustand";
import { useLocalMirror } from "./local-mirror";
import type { AssetCategory } from "./assets-data";

/**
 * Room items made from a few words: a sofa, a plant, a lamp, anything
 * that sets the scene but is not for sale. With an image and mesh
 * provider connected, each gets a picture and a model; without one a
 * stock mesh of the thing stands in when there is one (CC0 models under
 * public/props), and otherwise it stands as a shape. Every generation
 * is kept here, starred or not, so
 * it can go into any project again; the starred ones are the shortlist.
 * Kept in the browser and mirrored to the account when signed in, so
 * a removed one is remembered as gone with the time.
 */
const KEY = "furnishes.generations";

export type Generation = {
  id: string;
  prompt: string;
  /** the item's name as the outliner shows it */
  name: string;
  category: AssetCategory;
  at: number;
  imageUrl?: string;
  modelUrl?: string;
  starred: boolean;
  /** how it came about: a provider, a stock mesh, or a shape */
  source: "fal" | "prop" | "shape";
};

type GenerationState = {
  generations: Generation[];
  /** the ids removed here, with when: a mirror does not bring them back */
  gone: Record<string, number>;
  add: (g: Omit<Generation, "id" | "at" | "starred">) => Generation;
  star: (id: string) => void;
  remove: (id: string) => void;
};

export const useGenerations = create<GenerationState>((set) => ({
  generations: [],
  gone: {},
  add: (g) => {
    const gen: Generation = {
      ...g,
      id: newId("gen"),
      at: Date.now(),
      starred: false,
    };
    set((s) => ({ generations: [gen, ...s.generations] }));
    return gen;
  },
  star: (id) =>
    set((s) => ({
      generations: s.generations.map((g) =>
        g.id === id ? { ...g, starred: !g.starred } : g,
      ),
    })),
  remove: (id) =>
    set((s) => ({
      generations: s.generations.filter((g) => g.id !== id),
      gone: { ...s.gone, [id]: Date.now() },
    })),
}));

/** the item's name and category read from the words */
export const describeItem = (prompt: string) => {
  const words = prompt.trim().replace(/^(a|an|the)\s+/i, "");
  const name = words
    ? words[0]!.toUpperCase() + words.slice(1, 40)
    : "Room item";
  const t = prompt.toLowerCase();
  const category: AssetCategory =
    /sofa|couch|chair|armchair|stool|bench|seat|\bbed\b(?!side)/.test(t)
      ? "seating"
      : /lamp|light|pendant|sconce/.test(t)
        ? "lighting"
        : /table|desk|console/.test(t)
          ? "tables"
          : /shelf|shelves|cabinet|sideboard|wardrobe|drawer/.test(t)
            ? "storage"
            : "decor";
  return { name, category };
};

/** the generations come back on arrival and are kept on every change */
const pick = (s: GenerationState) => ({
  generations: s.generations,
  gone: s.gone,
});
const accept = (kept: Partial<ReturnType<typeof pick>>) =>
  Array.isArray(kept.generations)
    ? { generations: kept.generations, gone: kept.gone ?? {} }
    : null;
export const useGenerationsSync = () =>
  useLocalMirror(useGenerations, KEY, pick, accept);
