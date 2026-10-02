/**
 * What floats over the main surface: a thin toolbar across the top and a
 * shelf of cards along the bottom. Both are glass, both are placeholders
 * until real tools and real pieces arrive.
 */

/** Ghost icon buttons in two groups, the way a toolbar reads. */
export function MainTopBar({ groups = [4, 3, 2] }: { groups?: number[] }) {
  return (
    <div className="main-top" role="toolbar" aria-label="Tools">
      {groups.map((n, g) => (
        <div key={g} className="main-top-group">
          {Array.from({ length: n }, (_, i) => (
            <button
              key={i}
              type="button"
              className="main-icon"
              aria-label={`Tool ${g + 1}.${i + 1}`}
            >
              <span className="main-icon-glyph" aria-hidden="true" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export type ShelfCard = {
  id: string;
  name: string;
  price: string;
  /** "square" or "wide" placeholder until an image is set */
  shape?: "square" | "wide";
};

/** Cards in a row that scrolls sideways; the scrollbar is hidden. */
export function MainShelf({ cards }: { cards: ShelfCard[] }) {
  return (
    <div className="main-shelf" aria-label="Pieces">
      <div className="main-shelf-scroll no-scrollbar">
        {cards.map((c) => (
          <article key={c.id} className="shelf-card">
            <div
              className="shelf-card-pic"
              data-shape={c.shape ?? "square"}
              aria-hidden="true"
            />
            <div className="shelf-card-row">
              <span className="shelf-card-name">{c.name}</span>
              <span className="shelf-card-price">{c.price}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Placeholder cards until the catalogue is wired. */
export const placeholderCards: ShelfCard[] = Array.from(
  { length: 14 },
  (_, i) => ({
    id: `p${i + 1}`,
    name: `Piece ${String(i + 1).padStart(2, "0")}`,
    price: `S$ ${(i + 1) * 60}`,
    shape: i % 4 === 3 ? "wide" : "square",
  }),
);
