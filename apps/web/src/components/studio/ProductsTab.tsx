"use client";

import { useState } from "react";
import { CATEGORY_NAMES, sgd, type AssetCategory } from "./assets-data";
import { PlusIcon } from "./icons";
import { products, useScene } from "./scene-store";

/**
 * The catalogue as a grid of cards: a picture, the name, the price. One
 * press puts the piece into the room; it appears in the outliner, on the
 * shelf and in the count at once.
 */
export function ProductsTab({
  query,
  category,
}: {
  query: string;
  category: AssetCategory | null;
}) {
  const add = useScene((s) => s.addProduct);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const shown = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q)),
  );
  const onAdd = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    add(p);
    setJustAdded(id);
    window.setTimeout(() => setJustAdded((c) => (c === id ? null : c)), 1200);
  };
  return (
    <div className="products" aria-label="Products">
      {shown.length === 0 && (
        <p className="assets-empty">Nothing here matches.</p>
      )}
      {shown.map((p) => (
        <article key={p.id} className="product" data-added={justAdded === p.id}>
          <div className="product-pic" aria-hidden="true">
            <span className="product-cat">{CATEGORY_NAMES[p.category]}</span>
          </div>
          <div className="product-row">
            <span className="product-name">{p.name}</span>
            <span className="product-price f-num">{sgd(p.price)}</span>
          </div>
          <button
            type="button"
            className="product-add"
            aria-label={`Add ${p.name} to the room`}
            onClick={() => onAdd(p.id)}
          >
            <PlusIcon size={14} />
            {justAdded === p.id ? "Added" : "Add"}
          </button>
        </article>
      ))}
    </div>
  );
}
