import type { AssetCategory } from "./assets-data";

/** A product from the catalogue, as the Products tab lists it. */
export type Product = {
  id: string;
  name: string;
  category: AssetCategory;
  /** S$ */
  price: number;
};

/** Placeholder catalogue until the product pages are wired. */
export const products: Product[] = [
  { id: "p-entry", name: "Entry organiser", category: "storage", price: 180 },
  {
    id: "p-desk",
    name: "Desk-side organiser",
    category: "storage",
    price: 190,
  },
  { id: "p-bedside", name: "Bedside cabinet", category: "storage", price: 150 },
  {
    id: "p-sideboard",
    name: "Three-bay sideboard",
    category: "storage",
    price: 360,
  },
  { id: "p-bookwall", name: "Bookwall", category: "storage", price: 540 },
  { id: "p-coat", name: "Coat stand", category: "storage", price: 210 },
  { id: "p-bench", name: "Storage bench", category: "seating", price: 240 },
  { id: "p-kitchen", name: "Kitchen trolley", category: "tables", price: 230 },
  { id: "p-cart", name: "Work cart", category: "tables", price: 220 },
  {
    id: "p-island",
    name: "Preparation island",
    category: "tables",
    price: 520,
  },
  { id: "p-screen", name: "Mobile screen", category: "decor", price: 320 },
  { id: "p-folding", name: "Folding screen", category: "decor", price: 280 },
];
