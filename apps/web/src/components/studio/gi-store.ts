/**
 * The rooms' bounced light kept in the browser (IndexedDB), by the
 * bake's key (`giKey`, which holds everything a bake reads and the
 * bake's version): a room as it was on the last visit, or in another
 * project opened before, comes back lit at once, with no quick first
 * look and no fade. A key not found is baked as before and then kept.
 * At most `GI_KEPT` bakes are held, the ones least recently used let go
 * first. A browser without the store (a private window, a test) bakes
 * every time.
 */
import { GI_VERSION } from "./gi-bake";

/** how many bakes the store holds: a room's is tens of KB */
export const GI_KEPT = 240;

const DB = "furnishes-gi";
const STORE = `v${GI_VERSION}`;
type Entry = { half: Uint16Array; used: number };

let opened: Promise<IDBDatabase | null> | null = null;
const db = () =>
  (opened ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, GI_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        // an older bake's store goes: its results are not this bake's
        for (const name of [...d.objectStoreNames])
          if (name !== STORE) d.deleteObjectStore(name);
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }));

/** the keys to let go of, oldest use first, so `max` stay */
export const overflow = (
  entries: readonly { key: string; used: number }[],
  max: number,
) =>
  [...entries]
    .sort((a, b) => a.used - b.used)
    .slice(0, Math.max(0, entries.length - max))
    .map((e) => e.key);

/** a bake kept under its key, of the length its atlas needs, or null */
export const giFromDisk = async (key: string, length: number) => {
  const d = await db();
  if (!d) return null;
  return new Promise<Uint16Array | null>((resolve) => {
    try {
      const store = d.transaction(STORE, "readwrite").objectStore(STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const e = req.result as Entry | undefined;
        if (!e || !(e.half instanceof Uint16Array) || e.half.length !== length)
          return resolve(null);
        // used now: the last to be let go
        store.put({ half: e.half, used: Date.now() } satisfies Entry, key);
        resolve(e.half);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
};

/** a bake kept, and the least used let go past `GI_KEPT` */
export const giToDisk = async (key: string, half: Uint16Array) => {
  const d = await db();
  if (!d) return;
  try {
    const store = d.transaction(STORE, "readwrite").objectStore(STORE);
    store.put({ half, used: Date.now() } satisfies Entry, key);
    const seen: { key: string; used: number }[] = [];
    const cur = store.openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        seen.push({ key: String(c.key), used: (c.value as Entry).used ?? 0 });
        c.continue();
        return;
      }
      for (const k of overflow(seen, GI_KEPT)) store.delete(k);
    };
  } catch {
    // a full or closed store: the bake is only not kept
  }
};
