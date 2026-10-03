"use client";

import { useMemo, useState } from "react";
import { CATEGORY_NAMES, sgd, type AssetCategory } from "./assets-data";
import { products } from "./catalogue";
import { startProductDrag } from "./dnd";
import { useScene } from "./scene-store";

/**
 * What the + in the toolbar opens: a strip under the bar with the parts
 * and pieces to put in the room. One line of chips narrows it by
 * category. A tile goes into the room on a click, or can be dragged onto
 * the surface and dropped where it should stand.
 */
type Chip = "all" | AssetCategory;
/** every category with something to add, and All first */
const CHIPS: Chip[] = [
  "all",
  ...(Object.keys(CATEGORY_NAMES) as AssetCategory[]).filter((c) =>
    products.some((p) => p.category === c),
  ),
];

export function AddStrip({ onAdded }: { onAdded: (id: string) => void }) {
  const add = useScene((s) => s.addProduct);
  const select = useScene((s) => s.select);
  const [category, setCategory] = useState<Chip>("all");
  const shown = useMemo(
    () => products.filter((p) => category === "all" || p.category === category),
    [category],
  );
  return (
    <div
      className="glass shell-menu add-strip"
      role="dialog"
      aria-label="Add to the room"
    >
      <div className="add-strip-chips" role="group" aria-label="Category">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className="assets-chip"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c === "all" ? "All" : CATEGORY_NAMES[c]}
          </button>
        ))}
      </div>
      <div className="add-strip-row no-scrollbar">
        {shown.length === 0 && (
          <p className="assets-empty">Nothing here matches.</p>
        )}
        {shown.map((p) => (
          <button
            key={p.id}
            type="button"
            className="add-tile"
            draggable
            onDragStart={(e) => startProductDrag(e, p)}
            onClick={() => {
              const id = add(p);
              select(id);
              onAdded(id);
            }}
            aria-label={`Add ${p.name}, ${sgd(p.price)}`}
          >
            <span className="add-tile-pic" aria-hidden="true" />
            <span className="add-tile-name">{p.name}</span>
            <span className="add-tile-price f-num">{sgd(p.price)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
