/**
 * Inline line icons, the playground's set: 24×24 viewBox, no fill,
 * stroke 1.8 (UI) or 2 (chevrons, send arrow), rounded caps and joins.
 * Drawn in currentColor, which is never black: ink at 55% for rest,
 * 85% on hover, orange for the one primary action.
 */
type IconProps = { size?: number };

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

export function KeyboardIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
    </svg>
  );
}

/** a mouse with its wheel: the Mouse & trackpad tab of Help */
export function MouseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M12 7v3" />
    </svg>
  );
}

/** a finger on a screen: the Touch tab of Help */
export function TouchIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 10.5a1.5 1.5 0 0 1 3 0V12a1.5 1.5 0 0 1 3 0v4.5a4.5 4.5 0 0 1-4.5 4.5h-1.2a4.5 4.5 0 0 1-3.8-2.1L6 15.5a1.4 1.4 0 0 1 2.3-1.6L9 15v-4" />
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

export function MessageIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export function PencilIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
      <path d="m13.5 6.5 3 3" />
    </svg>
  );
}

export function TrashIcon({ size = 14 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

/* ---- the toolbar's tools ---- */
export function CursorIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M5 3l14 8-6.5 1.5L10 19 5 3z" />
    </svg>
  );
}
export function WallIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M3 5h18v14H3z" />
      <path d="M3 10h18M3 15h18M9 5v5M15 10v5M9 15v4" />
    </svg>
  );
}
export function UndoIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}
export function RedoIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </svg>
  );
}
export function ExportIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function InfoIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** the before-and-after handle: two chevrons facing out */
export function CompareIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M9 7l-5 5 5 5" />
      <path d="M15 7l5 5-5 5" />
    </svg>
  );
}

export function CartIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L21 8H6" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="17.5" cy="20" r="1" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size, s20)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function EyeOffIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c5 0 8.6 3.6 10 7-.5 1.2-1.3 2.5-2.4 3.6" />
      <path d="M6.6 6.6C4.4 8 2.8 10 2 12c1.4 3.4 5 7 10 7 1.6 0 3-.3 4.3-.9" />
    </svg>
  );
}

/** a pointer with a ring: inspect what it lands on */
export function InspectIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 4l7 17 2.5-7.5L21 11z" />
      <circle cx="18" cy="18" r="3.5" />
    </svg>
  );
}

export function TagIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M20.6 13.4L12.6 21.4a1.4 1.4 0 0 1-2 0L3 13.8V3h10.8l6.8 6.8a2.5 2.5 0 0 1 0 3.6z" />
      <path d="M7.5 7.5h.01" />
    </svg>
  );
}

export function ExpandIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function CompassIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

export function RotateIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}

export function CopyIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function ThumbIcon({
  size = 16,
  down = false,
}: IconProps & { down?: boolean }) {
  return (
    <svg {...svg(size)} style={down ? { transform: "scaleY(-1)" } : undefined}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4-7a2.5 2.5 0 0 1 2.5 2.5V10h5a2 2 0 0 1 2 2.3l-1 6A2 2 0 0 1 17.5 20H7" />
    </svg>
  );
}

export function WalkIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="13" cy="4" r="1.6" />
      <path d="M10 9.5l2.5-1.5 3 2.5 2.5 1" />
      <path d="M12.5 8l-1 5 3 3v5" />
      <path d="M11.5 13l-2.5 3-1.5 5" />
      <path d="M9 10l-3 1.5" />
    </svg>
  );
}

export function StarIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
    </svg>
  );
}

export function MoreIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  );
}

export function RulerIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M3 17 17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2" />
    </svg>
  );
}

export function ZoomInIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.5-4.5M11 8v6M8 11h6" />
    </svg>
  );
}

export function ZoomOutIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.5-4.5M8 11h6" />
    </svg>
  );
}

export function FitIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}

export function PinIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3z" />
    </svg>
  );
}

export function StopIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function RefineIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" />
    </svg>
  );
}

export function SlidersIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h12M20 18h0" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export function RouteIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8 17.5c4-1 2-6 6-7s4-4.5 2.5-5.5" />
    </svg>
  );
}

export function PlayIcon({ size = 16 }: IconProps) {
  return (
    <svg {...svg(size)}>
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}
