/**
 * Inline line icons, the playground's set: 24×24 viewBox, no fill,
 * stroke 1.8 (UI) or 2 (chevrons, send arrow), rounded caps and joins.
 * Drawn in currentColor, which is never black: ink at 55% for rest,
 * 85% on hover, orange for the one primary action.
 */
export type IconProps = { size?: number };

const s18 = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const s20 = { ...s18, strokeWidth: 2 };

const svg = (size: number, p = s18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  ...p,
});

/** a panel with its left column marked: collapse / expand the left rail */
export function PanelLeftIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </svg>
  );
}

/** a panel with its right column marked: collapse / expand the right rail */
export function PanelRightIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M15 4v16" />
    </svg>
  );
}

export function ChevronDownIcon({
  size = 12,
  rotated = false,
}: IconProps & { rotated?: boolean }) {
  return (
    <svg
      {...svg(size, s20)}
      style={{
        transform: rotated ? "rotate(180deg)" : undefined,
        transition: "transform 0.15s ease",
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function PlusIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size, s20)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ImageIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-4-4a2 2 0 0 0-2.8 0L4 21" />
    </svg>
  );
}

export function LightbulbIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z" />
    </svg>
  );
}

export function SendArrowIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svg(size, s20)}>
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}

export function MicIcon({ size = 15 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M19 11v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 19v3M9 22h6" />
    </svg>
  );
}

export function GearIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function HelpIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function MoreIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function SignOutIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
      <path d="M15 8l5 4-5 4M20 12H9" />
    </svg>
  );
}

export function KeyboardIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

/** three lines, shorter each step: filter */
export function FilterIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 7h16M7 12h10M10 17h4" />
    </svg>
  );
}

export function ChevronRightIcon({
  size = 12,
  open = false,
}: IconProps & { open?: boolean }) {
  return (
    <svg
      {...svg(size, s20)}
      style={{
        transform: open ? "rotate(90deg)" : undefined,
        transition: "transform 0.15s ease",
      }}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronUpDownIcon({
  size = 14,
  up = false,
}: IconProps & { up?: boolean }) {
  return (
    <svg
      {...svg(size, s20)}
      style={{
        transform: up ? "rotate(180deg)" : undefined,
        transition: "transform 0.2s ease",
      }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function EyeIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LockIcon({ size = 12 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function CubeIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
    </svg>
  );
}

/** two arrows trading places: swap the main and the small view */
export function SwapIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 7h13l-3-3M20 17H7l3 3" />
    </svg>
  );
}

/** a floor plan: the 2D view */
export function PlanIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h9M12 3v9M12 12v9M16 12v4" />
    </svg>
  );
}
