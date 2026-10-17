import { defaultConfig, depthOf, products } from "@furnishes/domain";
import { type FormPart, furnishesForm, type Role } from "../studio/furnishes-forms";
import type { V3 } from "./board-uv";
import type { Board } from "./bookcase";

/**
 * Round 10, Part 4: the product studio view's piece, any Furnishes
 * recipe as the proof draws its bookcase. The recipe's form
 * (furnishes-forms.ts, as the room draws it) split in two: its birch
 * boards (the body's panels and the base's, standing square) drawn
 * with the scanned sets and baked for their occlusion; the rest (a
 * turned leaf, the hardware, the castors, the house's orange marks)
 * drawn plain in what each is made of, as Furniture3D's `finishFor`
 * has it.
 */

export type Plain = {
  at: V3;
  rotation?: V3 | undefined;
  colour: number;
  rough: number;
  metal: number;
} & ({ dims: V3 } | { rod: [number, number, number?] });

/** a board of the piece, with its tone over the birch: the base a
    shade under the body, as the room draws it */
export type ProductBoard = Board & { tint: "body" | "base" };

export type ProductPiece = {
  id: string;
  name: string;
  size: V3;
  boards: ProductBoard[];
  /** square boards the bake leaves out (a turned leaf) */
  turned: (ProductBoard & { rotation: V3 })[];
  plain: Plain[];
};

/** each role's plain finish (Furniture3D's `finishFor`) */
const PLAIN: Record<Exclude<Role, "body" | "base">, Omit<Plain, "at" | "dims" | "rod">> = {
  accent: { colour: 0xd4652e, rough: 0.5, metal: 0 },
  metal: { colour: 0x8d8780, rough: 0.35, metal: 1 },
  dark: { colour: 0x2b2826, rough: 0.75, metal: 0 },
  cloth: { colour: 0xbfb4a6, rough: 0.9, metal: 0 },
  thing: { colour: 0xbfb4a6, rough: 0.8, metal: 0 },
};

const hexOf = (css: string | undefined, fallback: number) =>
  css && /^#[0-9a-f]{6}$/i.test(css) ? parseInt(css.slice(1), 16) : fallback;

const m = (mm: number) => mm / 1000;

/** a recipe's piece for the studio view, or null for an unknown id */
export const productPiece = (id: string): ProductPiece | null => {
  const r = products.find((p) => p.id === id);
  if (!r) return null;
  const size: V3 = [m(r.width), m(r.height), m(depthOf(r))];
  const form = furnishesForm({
    recipe: r,
    size,
    doors: defaultConfig(r).doors,
    accessories: defaultConfig(r).accessories,
    colours: [],
    seed: 7,
  });
  const boards: ProductBoard[] = [];
  const turned: ProductPiece["turned"] = [];
  const plain: Plain[] = [];
  form.parts.forEach((p: FormPart, k) => {
    if ((p.role === "body" || p.role === "base") && "dims" in p) {
      const b: ProductBoard = {
        id: `${p.role}-${k}`,
        dims: p.dims,
        at: p.at,
        tint: p.role,
      };
      if (p.rotation && p.rotation.some((x) => x !== 0))
        turned.push({ ...b, rotation: p.rotation });
      else boards.push(b);
      return;
    }
    const role = p.role === "body" || p.role === "base" ? "thing" : p.role;
    const f = PLAIN[role];
    const colour =
      role === "cloth" || role === "thing" ? hexOf(p.colour, f.colour) : f.colour;
    plain.push({
      ...f,
      colour,
      at: p.at,
      rotation: p.rotation,
      ...("dims" in p ? { dims: p.dims } : { rod: p.rod }),
    });
  });
  return { id: r.id, name: r.name, size, boards, turned, plain };
};
