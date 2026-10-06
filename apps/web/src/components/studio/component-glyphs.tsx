/**
 * A component as it is seen from the front, for its tile: the shelf a
 * wide panel with its pin holes, the divider an upright panel, the back
 * panel a square sheet, the drawer a box with its front and a pull, the
 * door a tall leaf with a handle. Drawn in the tile's own ink, so the
 * tile says what the thing is before its name does.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  "c-shelf": (
    <>
      <rect x="6" y="26" width="52" height="6" rx="1" />
      <circle cx="12" cy="22" r="1.2" />
      <circle cx="52" cy="22" r="1.2" />
      <circle cx="12" cy="36" r="1.2" />
      <circle cx="52" cy="36" r="1.2" />
    </>
  ),
  "c-divider": (
    <>
      <rect x="29" y="8" width="6" height="48" rx="1" />
      <line x1="14" y1="56" x2="50" y2="56" />
    </>
  ),
  "c-back": (
    <>
      <rect x="12" y="10" width="40" height="44" rx="1" />
      <line x1="12" y1="32" x2="52" y2="32" strokeDasharray="2 3" />
    </>
  ),
  "c-drawer": (
    <>
      <rect x="10" y="20" width="44" height="26" rx="1.5" />
      <line x1="10" y1="26" x2="54" y2="26" />
      <rect x="26" y="33" width="12" height="3" rx="1.5" />
    </>
  ),
  "c-door": (
    <>
      <rect x="20" y="8" width="24" height="48" rx="1.5" />
      <circle cx="40" cy="32" r="1.6" />
    </>
  ),
};

export function ComponentGlyph({ id }: { id: string }) {
  const g = GLYPHS[id];
  if (!g) return null;
  return (
    <svg
      className="component-glyph"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {g}
    </svg>
  );
}
