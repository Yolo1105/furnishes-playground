import type { DragEvent } from "react";
import { products, type Product } from "./catalogue";

/**
 * Dragging a product onto the main surface. The tiles in the + strip
 * and the cards in the Products tab start it; the surface takes it.
 */
const PRODUCT_MIME = "application/x-furnishes-product";

export function startProductDrag(e: DragEvent, p: Product) {
  e.dataTransfer.setData(PRODUCT_MIME, p.id);
  e.dataTransfer.setData("text/plain", p.name);
  e.dataTransfer.effectAllowed = "copy";
}

export const carriesProduct = (e: DragEvent) =>
  Array.from(e.dataTransfer.types).includes(PRODUCT_MIME);

export function readProductDrag(e: DragEvent): Product | undefined {
  const id = e.dataTransfer.getData(PRODUCT_MIME);
  return products.find((p) => p.id === id);
}
