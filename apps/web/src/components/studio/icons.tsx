/** Small line icons, 16px, drawn in the current colour. */
type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** a panel with its left column marked: collapse / expand the left rail */
export function PanelLeftIcon({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  );
}

/** a panel with its right column marked: collapse / expand the right rail */
export function PanelRightIcon({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M10 2.5v11" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function PlusIcon({ size = 16 }: P) {
  return (
    <svg {...base(size)}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
