import { useEffect } from "react";
import { create } from "zustand";
import { newId } from "./ids";

/**
 * The board: pictures kept for a project's sake, each with a title and
 * a note. A picture is uploaded here (sized down in the browser before
 * it is kept, so the board stays small enough to mirror) or saved from
 * a generated room item's tile. Kept in the browser and mirrored to the
 * account when signed in, so a removed one is remembered as gone with
 * the time. The starred room items are the board's other half, and
 * show beside these.
 */
const KEY = "furnishes.board";
/** the longest side a kept picture is sized down to, px */
export const PICTURE_PX = 1024;
/** what the whole board may weigh, characters of data, so the mirror
    (which holds two million a document) always takes it */
export const BOARD_MAX = 1_500_000;
export const PICTURES_MAX = 24;

export type Picture = {
  id: string;
  /** a data URL once sized down, or a provider's picture URL */
  src: string;
  title: string;
  note: string;
  from: "upload" | "item";
  at: number;
};

type BoardState = {
  pictures: Picture[];
  /** the ids removed here, with when: a mirror does not bring them back */
  gone: Record<string, number>;
  /** null when it was kept, else why it was not */
  add: (p: Omit<Picture, "id" | "at">) => string | null;
  edit: (id: string, patch: Partial<Pick<Picture, "title" | "note">>) => void;
  remove: (id: string) => void;
  adopt: (next: Pick<BoardState, "pictures" | "gone">) => void;
};

/** what the board weighs, characters */
export const weightOf = (pictures: readonly Picture[]) =>
  pictures.reduce(
    (t, p) => t + p.src.length + p.title.length + p.note.length,
    0,
  );

export const useBoard = create<BoardState>((set, get) => ({
  pictures: [],
  gone: {},
  add: (p) => {
    const { pictures } = get();
    if (pictures.some((x) => x.src === p.src))
      return "That picture is on the board already.";
    if (pictures.length >= PICTURES_MAX)
      return `The board holds ${PICTURES_MAX} pictures; take one off to keep another.`;
    if (weightOf(pictures) + p.src.length > BOARD_MAX)
      return "The board is full; take a picture off to keep another.";
    const pic: Picture = { ...p, id: newId("pic"), at: Date.now() };
    set({ pictures: [pic, ...pictures] });
    return null;
  },
  edit: (id, patch) =>
    set((s) => ({
      pictures: s.pictures.map((p) =>
        p.id === id ? { ...p, ...patch, at: Date.now() } : p,
      ),
    })),
  remove: (id) =>
    set((s) => ({
      pictures: s.pictures.filter((p) => p.id !== id),
      gone: { ...s.gone, [id]: Date.now() },
    })),
  adopt: (next) => set(next),
}));

/** a picture file sized down to PICTURE_PX on its long side, as a JPEG
    data URL; what the browser cannot read is refused */
export const shrink = (file: File): Promise<string | null> =>
  new Promise((resolve) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PICTURE_PX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

/** the board comes back on arrival and is kept on every change */
export function useBoardSync() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const kept = JSON.parse(raw) as Partial<
          Pick<BoardState, "pictures" | "gone">
        >;
        if (Array.isArray(kept.pictures))
          useBoard.setState({ pictures: kept.pictures, gone: kept.gone ?? {} });
      }
    } catch {
      /* nothing kept, or storage blocked */
    }
    return useBoard.subscribe((s) => {
      try {
        localStorage.setItem(
          KEY,
          JSON.stringify({ pictures: s.pictures, gone: s.gone }),
        );
      } catch {
        /* the board lasts the session */
      }
    });
  }, []);
}
