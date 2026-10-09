"use client";

import type { FeatureStatus } from "@furnishes/domain";
import { create } from "zustand";
import type { FaceInfo, PartMesh } from "./part-build";

/**
 * What the studio knows of its parts: each as last built, the editing
 * state, the counts the stage says. The store alone, so the plan's
 * clashes and Eva can read a part's outline without the part client,
 * which brings three's geometry along for the stage.
 */
/** a part item as last built: its mesh (none when nothing stood), each
    feature's state, and the key it was built for */
export type PartBuilt = {
  key: string;
  mesh: PartMesh | null;
  statuses: FeatureStatus[];
  ms: number;
};
type PartState = {
  pending: number;
  failed: string | null;
  /** the part items built, by their node id */
  built: Record<string, PartBuilt>;
  /** how many builds have come back, which the stage says
      (`data-part-builds`) so a test can wait for the next */
  builds: number;
  /** the rollback marker on a part's history: how many features are
      built; unset is all of them */
  upTo: Record<string, number>;
  /** the feature (or sketch) open for editing in the Detail tab */
  editing: { id: string; feature?: string; sketch?: string } | null;
  /** a face is being picked on the stage for the feature in hand */
  picking: boolean;
  /** the face last picked, whose other readings the form offers */
  pickedFace: FaceInfo | null;
  setBuilt: (id: string, built: PartBuilt | null) => void;
  setUpTo: (id: string, upTo: number | undefined) => void;
  setEditing: (e: PartState["editing"]) => void;
  setPicking: (on: boolean) => void;
  setPickedFace: (face: FaceInfo | null) => void;
};
export const usePartStore = create<PartState>((set) => ({
  pending: 0,
  failed: null,
  built: {},
  builds: 0,
  upTo: {},
  editing: null,
  picking: false,
  pickedFace: null,
  setBuilt: (id, built) =>
    set((s) => {
      const next = { ...s.built };
      if (built) next[id] = built;
      else delete next[id];
      return { built: next, builds: s.builds + (built ? 1 : 0) };
    }),
  setUpTo: (id, upTo) =>
    set((s) => {
      const next = { ...s.upTo };
      if (upTo === undefined) delete next[id];
      else next[id] = upTo;
      return { upTo: next };
    }),
  setEditing: (editing) => set({ editing, picking: false, pickedFace: null }),
  setPicking: (picking) => set({ picking }),
  setPickedFace: (pickedFace) => set({ pickedFace, picking: false }),
}));
