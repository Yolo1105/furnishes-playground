import { useEffect } from "react";
import { newId } from "./ids";
import { create } from "zustand";
import type { AssetCategory } from "./assets-data";

/**
 * Room items made from a few words: a sofa, a plant, a lamp, anything
 * that sets the scene but is not for sale. With an image and mesh
 * provider connected, each gets a picture and a model; without one it
 * stands as a shape. Every generation is kept here, starred or not, so
 * it can go into any project again; the starred ones are the shortlist.
 * Kept in the browser until accounts land.
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
  /** how it came about */
  source: "fal" | "shape";
};

type GenerationState = {
  generations: Generation[];
  add: (g: Omit<Generation, "id" | "at" | "starred">) => Generation;
  star: (id: string) => void;
  remove: (id: string) => void;
};

export const useGenerations = create<GenerationState>((set) => ({
  generations: [],
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
    set((s) => ({ generations: s.generations.filter((g) => g.id !== id) })),
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
export function useGenerationsSync() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const kept = JSON.parse(raw) as { generations?: Generation[] };
        if (Array.isArray(kept.generations))
          useGenerations.setState({ generations: kept.generations });
      }
    } catch {
      /* nothing kept, or storage blocked */
    }
    return useGenerations.subscribe((s) => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ generations: s.generations }),
        );
      } catch {
        /* the generations last the session */
      }
    });
  }, []);
}
