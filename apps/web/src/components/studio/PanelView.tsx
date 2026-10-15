import { boundsOf, panelBoxSize, type Panel } from "@furnishes/domain";

/**
 * A piece's panels drawn flat, to scale: from the front, the side or
 * above, each panel a rectangle, the nearer over the farther, its doors
 * and drawer fronts in the finish. The design pane draws a recipe this
 * way before it is placed, and the shelf's card a designed piece.
 */
/** which world axes a view draws across and up, and which it looks
    along (the nearer, the later drawn) */
const VIEWS = {
  front: { across: 0, up: 1, along: 2, flip: true },
  side: { across: 2, up: 1, along: 0, flip: true },
  plan: { across: 0, up: 2, along: 1, flip: false },
} as const;
const VIEW_NAMES = { front: "Front", side: "Side", plan: "Plan" } as const;

/** one view of the panels, to scale, with its two sizes */
export function PanelView({
  panels,
  view,
  colour,
}: {
  panels: readonly Panel[];
  view: keyof typeof VIEWS;
  colour: string;
}) {
  const b = boundsOf(panels);
  if (!b) return null;
  const { across, up, along, flip } = VIEWS[view];
  const W = b.max[across] - b.min[across];
  const H = b.max[up] - b.min[up];
  const pad = Math.max(W, H) * 0.08;
  const rects = panels
    .map((p) => {
      const s = panelBoxSize(p);
      const x = p.position[across] - s[across] / 2 - b.min[across];
      const y0 = p.position[up] - s[up] / 2 - b.min[up];
      return {
        id: p.id,
        door: p.kind === "door",
        x,
        y: flip ? H - y0 - s[up] : y0,
        w: s[across],
        h: s[up],
        near: p.position[along] + s[along] / 2,
      };
    })
    .sort((p, q) => p.near - q.near);
  return (
    <figure className="design-view">
      <svg
        viewBox={`${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}`}
        role="img"
        aria-label={`${VIEW_NAMES[view]}: ${Math.round(W)} × ${Math.round(H)} mm`}
      >
        {rects.map((q) => (
          <rect
            key={q.id}
            x={q.x}
            y={q.y}
            width={q.w}
            height={q.h}
            // a carcass's panels in birch, its fronts in its finish
            fill={q.door ? colour : "var(--color-birch)"}
            fillOpacity={q.door ? 0.85 : 1}
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="f-num">
        {VIEW_NAMES[view]} · {Math.round(W)} × {Math.round(H)}
      </figcaption>
    </figure>
  );
}
