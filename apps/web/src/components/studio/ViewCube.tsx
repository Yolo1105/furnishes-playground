"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { WalkIcon } from "./icons";
import { DRAG_FROM } from "./input";
import { ANGLES, useStudio, type Angle } from "./studio-store";

/**
 * How the view is looked at, shown as the thing itself. In 3D a small
 * cube turned exactly as the camera sees the room: its faces are Top,
 * Front, Right, Back, Left and Bottom, each a click away from that
 * angle, and a drag on the cube turns the camera with it, to any angle;
 * the near corner's dot is the perspective. In 2D a plan square with the
 * four elevations around it, as a drawing sheet lays them out. The
 * current one is tinted; its name reads under the cube, or "Free" once
 * the cube has been turned by hand. Rests while rendering.
 */
type Face = {
  id: Angle;
  /** the face's outward normal */
  n: readonly [number, number, number];
  /** its four corners, counter-clockwise seen from outside */
  corners: readonly (readonly [number, number, number])[];
};
const FACES: Face[] = [
  {
    id: "Top",
    n: [0, 1, 0],
    corners: [
      [-1, 1, -1],
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
    ],
  },
  {
    id: "Front",
    n: [0, 0, 1],
    corners: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    id: "Right",
    n: [1, 0, 0],
    corners: [
      [1, -1, 1],
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
    ],
  },
  {
    id: "Back",
    n: [0, 0, -1],
    corners: [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
  {
    id: "Left",
    n: [-1, 0, 0],
    corners: [
      [-1, -1, -1],
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
    ],
  },
];
/** the cube's half-size on the drawing, in viewBox units */
const HALF = 21;
/** how far a drag turns the camera, radians per pixel */
const TURN = 0.012;
/** the camera never quite reaches the floor or the zenith */
const PITCH = { min: 0.05, max: Math.PI / 2 - 0.02 };

/** a point of the cube as the camera at yaw and pitch sees it: x and y
    on the drawing, z towards the viewer */
const seen = (
  [x, y, z]: readonly [number, number, number],
  yaw: number,
  pitch: number,
) => {
  // the camera's azimuth brought to the drawing's front, then its height
  const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
  const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
  return [x1, y2, z2] as const;
};

export function ViewCube() {
  const view = useStudio((s) => s.view);
  const angle = useStudio((s) => s.angle);
  const mode = useStudio((s) => s.mode);
  const cam = useStudio((s) => s.cam);
  const free = useStudio((s) => s.free);
  const setAngle = useStudio((s) => s.setAngle);
  const walk = useStudio((s) => s.walk);
  const setWalk = useStudio((s) => s.setWalk);
  const { turnTo } = useStudio.getState();
  const drag = useRef<{
    x0: number;
    y0: number;
    yaw: number;
    pitch: number;
    moved: boolean;
  } | null>(null);
  if (mode === "preview") return null;
  const face = (
    id: Angle,
    extra: Record<string, unknown>,
    children: React.ReactNode,
  ) => (
    <g
      key={id}
      role="radio"
      aria-checked={!free && angle === id}
      aria-label={id}
      tabIndex={0}
      className="view-cube-face"
      onClick={() => {
        // the click that ends a drag is the drag, not a pick
        if (drag.current?.moved) return;
        setAngle(id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setAngle(id);
        }
      }}
      {...extra}
    >
      {children}
    </g>
  );
  // the cube's faces as the camera sees them
  const faces = FACES.map((f) => {
    const [, , depth] = seen(f.n, cam.yaw, cam.pitch);
    const pts = f.corners.map((c) => seen(c, cam.yaw, cam.pitch));
    const mid = pts.reduce(
      (m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4] as const,
      [0, 0] as readonly [number, number],
    );
    return {
      ...f,
      depth,
      // lit as much as it faces the camera, so the cube reads in the round
      shade: 0.45 + 0.55 * depth,
      points: pts
        .map(
          (p) =>
            `${(50 + p[0] * HALF).toFixed(1)},${(50 - p[1] * HALF).toFixed(1)}`,
        )
        .join(" "),
      label: [50 + mid[0] * HALF, 50 - mid[1] * HALF] as const,
    };
    // every face is drawn, the farthest first: the ones turned away lie
    // under the near ones, there for the keyboard and the record
  }).sort((p, q) => p.depth - q.depth);
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (view !== "3d" || e.button !== 0 || walk) return;
    drag.current = {
      x0: e.clientX,
      y0: e.clientY,
      yaw: cam.yaw,
      pitch: cam.pitch,
      moved: false,
    };
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_FROM) return;
    if (!d.moved) {
      // a drag, not a click: the pointer is held until it is let go. A
      // click is left uncaptured, so it reaches the face it is on
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer the browser no longer knows */
      }
    }
    d.moved = true;
    turnTo({
      yaw: d.yaw - dx * TURN,
      pitch: Math.max(PITCH.min, Math.min(PITCH.max, d.pitch + dy * TURN)),
    });
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    // the click fires after the pointer is up: it reads `moved` first
    window.setTimeout(() => {
      drag.current = null;
    }, 0);
  };
  return (
    <div className="glass view-cube" data-view={view}>
      <svg
        viewBox="0 0 100 100"
        className="view-cube-svg"
        role="radiogroup"
        aria-label="View angle"
        data-turns={view === "3d" && !walk}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {view === "3d" ? (
          <>
            {faces.map((f) =>
              face(
                f.id,
                {},
                <>
                  <polygon points={f.points} style={{ fillOpacity: f.shade }} />
                  <text x={f.label[0]} y={f.label[1]}>
                    {f.id[0]}
                  </text>
                </>,
              ),
            )}
            {/* the perspective: the near corner's dot, below the cube */}
            {face(
              "Perspective",
              { className: "view-cube-face view-cube-corner" },
              <>
                <circle cx="50" cy="90" r="7" />
                <circle cx="50" cy="90" r="2.5" className="view-cube-dot" />
              </>,
            )}
          </>
        ) : (
          <>
            {face(
              "Plan",
              {},
              <>
                <rect x="30" y="30" width="40" height="40" />
                <text x="50" y="52">
                  P
                </text>
              </>,
            )}
            {(
              [
                ["Back", "30,16 70,16 70,26 30,26", [50, 23]],
                ["Front", "30,74 70,74 70,84 30,84", [50, 81]],
                ["Left", "16,30 26,30 26,70 16,70", [21, 52]],
                ["Right", "74,30 84,30 84,70 74,70", [79, 52]],
              ] as const
            ).map(([id, pts, [x, y]]) =>
              face(
                id,
                {},
                <>
                  <polygon points={pts} />
                  <text x={x} y={y}>
                    {id[0]}
                  </text>
                </>,
              ),
            )}
          </>
        )}
      </svg>
      <span className="view-cube-name">
        {walk ? "Walking" : view === "3d" && free ? "Free" : angle}
      </span>
      {view === "3d" && (
        <button
          type="button"
          className="view-cube-walk"
          aria-pressed={walk}
          aria-label={walk ? "Stop walking" : "Walk the room"}
          title={
            walk
              ? "Stop walking (Esc)"
              : "Walk the room: W A S D, drag to look, click the floor to go there"
          }
          onClick={() => setWalk(!walk)}
        >
          <WalkIcon size={13} />
          {walk ? "Stop" : "Walk"}
        </button>
      )}
      {/* every angle the view has, for the record and the keyboard */}
      <span className="sr-only">{ANGLES[view].join(", ")}</span>
    </div>
  );
}
