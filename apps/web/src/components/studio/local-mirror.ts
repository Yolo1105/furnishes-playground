import { useEffect } from "react";
import type { StoreApi, UseBoundStore } from "zustand";

/**
 * A store's slice kept in the browser's own storage: read back on
 * arrival, written on every change. The orders, the generations and
 * the board all keep themselves this way; storage that is missing or
 * refused leaves the slice to last the session.
 */
export function useLocalMirror<S, K extends object>(
  store: UseBoundStore<StoreApi<S>>,
  key: string,
  pick: (s: S) => K,
  accept: (kept: Partial<K>) => Partial<S> | null,
) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const got = accept(JSON.parse(raw) as Partial<K>);
        if (got) store.setState(got);
      }
    } catch {
      /* nothing kept, or storage blocked */
    }
    return store.subscribe((s) => {
      try {
        localStorage.setItem(key, JSON.stringify(pick(s)));
      } catch {
        /* the slice lasts the session */
      }
    });
  }, [store, key, pick, accept]);
}
