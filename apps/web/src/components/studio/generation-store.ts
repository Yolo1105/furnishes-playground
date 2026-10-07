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

/** the stock meshes, by the words that name them; the first match wins,
    so the more particular come first */
const PROPS: [RegExp, string][] = [
  [/sofa|couch|settee/, "sofa_02"],
  [/armchair|lounge chair|reading chair|easy chair/, "modern_arm_chair_01"],
  [/stool/, "metal_stool_01"],
  [/chair/, "dining_chair_02"],
  [/coffee table|side table|low table/, "modern_coffee_table_01"],
  [/cabinet|dresser|chest|cupboard/, "modern_wooden_cabinet"],
  [/lamp|light/, "desk_lamp_arm_01"],
  [/planter|herbs?\b|window box/, "planter_box_02"],
  [/plant|fig|palm|fern|monstera|tree/, "potted_plant_04"],
  [/vase|jug|bottle/, "ceramic_vase_01"],
  [/basket|hamper/, "wicker_basket_01"],
  [/books?\b|encyclop/, "book_encyclopedia_set_01"],
  [/pillow|cushion/, "throw_pillows_01"],
  [/\bbox|carton|crate/, "cardboard_box_01"],
  [/laptop|computer|notebook/, "classic_laptop"],
];
/** the stock mesh that stands in for what the words describe, if any */
export const propFor = (prompt: string) => {
  const t = prompt.toLowerCase();
  const hit = PROPS.find(([re]) => re.test(t));
  return hit ? `/props/${hit[1]}.glb` : undefined;
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
