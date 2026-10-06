"use client";

import { Portrait } from "./Portrait";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_NAMES, sgd, type AssetCategory } from "./assets-data";
import { products } from "./catalogue";
import { endTileDrag, moveTileDrag, startTileDrag } from "./dnd";
import { PlusIcon } from "./icons";
import { ComponentGlyph } from "./component-glyphs";
import { useRoom } from "./room-store";
import { useScene } from "./scene-store";

/**
 * The catalogue as a grid of cards: a portrait (a part's plan mark), the
 * name, the price. One
 * press puts the piece into the room; it appears in the outliner, on the
 * shelf and in the count at once. A card can also be dragged onto the
 * room and dropped where it should stand.
 */
export function ProductsTab({
  query,
  category,
}: {
  query: string;
  category: AssetCategory | null;
}) {
  const add = useScene((s) => s.addProduct);
  const activeId = useRoom((s) => s.activeId);
  const select = useScene((s) => s.select);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const flash = useRef(0);
  useEffect(() => () => window.clearTimeout(flash.current), []);
  const q = query.trim().toLowerCase();
  const shown = products.filter(
    (p) =>
      (!category || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q)),
  );
  const onAdd = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    select(add(p, activeId), false);
    setJustAdded(id);
    window.clearTimeout(flash.current);
    flash.current = window.setTimeout(() => setJustAdded(null), 1200);
  };
  const groups = (Object.keys(CATEGORY_NAMES) as AssetCategory[])
    .map((c) => ({
      id: c,
      name: CATEGORY_NAMES[c],
      items: shown.filter((p) => p.category === c),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <div className="products" aria-label="Products">
      {groups.length === 0 && (
        <p className="assets-empty">Nothing here matches.</p>
      )}
      {groups.map((g) => (
        <section
          key={g.id}
          className="products-group"
          aria-labelledby={`cat-${g.id}`}
        >
          <p id={`cat-${g.id}`} className="products-title">
            {g.name}
            <span className="assets-n f-num">{g.items.length}</span>
          </p>
          <div className="products-grid">
            {g.items.map((p) => (
              <article
                key={p.id}
                className="product"
                data-added={justAdded === p.id}
                onPointerDown={(e) => startTileDrag(e, p)}
                onPointerMove={moveTileDrag}
                onPointerUp={endTileDrag}
                onPointerCancel={endTileDrag}
              >
                <div className="product-pic" aria-hidden="true">
                  {p.recipe ? (
                    <Portrait productId={p.id} />
                  ) : (
                    <ComponentGlyph id={p.id} />
                  )}
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
        </section>
      ))}
    </div>
  );
}

/** a catalogue product as the piece it would be in the room, for its mark */
