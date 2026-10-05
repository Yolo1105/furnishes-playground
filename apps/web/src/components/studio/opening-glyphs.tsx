import type { OpeningKind } from "./room-data";

/**
 * An opening's mark, as the plan draws it, small: a door's leaf and
 * swing, a double door's two, a sliding door's two panels past each
 * other, a passage as the gap alone, a window as its three lines. The
 * wall runs along the top of the box; the room is below it.
 */
export function OpeningGlyph({
  kind,
  size = 36,
}: {
  kind: OpeningKind;
  size?: number;
}) {
  const w = 40;
  const h = 30;
  return (
    <svg
      className="opening-glyph"
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      aria-hidden="true"
    >
      {/* the wall, with the gap */}
      <line x1={0} y1={4} x2={8} y2={4} />
      <line x1={32} y1={4} x2={40} y2={4} />
      {kind === "door" && (
        <>
          <line x1={8} y1={4} x2={8} y2={28} />
          <path d="M 8 28 A 24 24 0 0 0 32 4" />
        </>
      )}
      {kind === "double" && (
        <>
          <line x1={8} y1={4} x2={8} y2={16} />
          <path d="M 8 16 A 12 12 0 0 0 20 4" />
          <line x1={32} y1={4} x2={32} y2={16} />
          <path d="M 32 16 A 12 12 0 0 1 20 4" />
        </>
      )}
      {kind === "sliding" && (
        <>
          <line x1={8} y1={2} x2={22} y2={2} />
          <line x1={18} y1={6} x2={32} y2={6} />
        </>
      )}
      {kind === "window" && (
        <>
          <line x1={8} y1={1} x2={32} y2={1} />
          <line x1={8} y1={4} x2={32} y2={4} />
          <line x1={8} y1={7} x2={32} y2={7} />
        </>
      )}
    </svg>
  );
}
