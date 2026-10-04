"use client";

import { ANGLES, useStudio, type Angle } from "./studio-store";

/**
 * How the view is looked at, shown as the thing itself. In 3D a small
 * cube: its three visible faces are Top, Front and Right, two tabs
 * behind it are Back and Left, and the near corner is the perspective.
 * In 2D a plan square with the four elevations around it, as a drawing
 * sheet lays them out. The current one is tinted; its name reads under
 * the cube. Rests while previewing.
 */
const FACES_3D: { id: Angle; points: string; label: [number, number] }[] = [
  { id: "Top", points: "50,20 74,33 50,46 26,33", label: [50, 35] },
  { id: "Front", points: "26,33 50,46 50,74 26,61", label: [38, 56] },
  { id: "Right", points: "50,46 74,33 74,61 50,74", label: [62, 56] },
];

export function ViewCube() {
  const view = useStudio((s) => s.view);
  const angle = useStudio((s) => s.angle);
  const mode = useStudio((s) => s.mode);
  const setAngle = useStudio((s) => s.setAngle);
  if (mode === "preview") return null;
  const face = (
    id: Angle,
    extra: Record<string, unknown>,
    children: React.ReactNode,
  ) => (
    <g
      key={id}
      role="radio"
      aria-checked={angle === id}
      aria-label={id}
      tabIndex={0}
      className="view-cube-face"
      onClick={() => setAngle(id)}
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
  return (
    <div className="glass view-cube" data-view={view}>
      <svg
        viewBox="0 0 100 100"
        className="view-cube-svg"
        role="radiogroup"
        aria-label="View angle"
      >
        {view === "3d" ? (
          <>
            {/* the two faces one cannot see, as tabs behind the cube */}
            {face(
              "Back",
              {},
              <>
                <polygon points="50,8 74,21 74,33 50,20" />
                <text x="62" y="23">
                  B
                </text>
              </>,
            )}
            {face(
              "Left",
              {},
              <>
                <polygon points="14,40 26,33 26,61 14,68" />
                <text x="20" y="53">
                  L
                </text>
              </>,
            )}
            {FACES_3D.map((f) =>
              face(
                f.id,
                {},
                <>
                  <polygon points={f.points} />
                  <text x={f.label[0]} y={f.label[1]}>
                    {f.id[0]}
                  </text>
                </>,
              ),
            )}
            {/* the near corner: the perspective */}
            {face(
              "Perspective",
              { className: "view-cube-face view-cube-corner" },
              <>
                <circle cx="50" cy="74" r="9" />
                <circle cx="50" cy="74" r="3" className="view-cube-dot" />
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
      <span className="view-cube-name">{angle}</span>
      {/* every angle the view has, for the record and the keyboard */}
      <span className="sr-only">{ANGLES[view].join(", ")}</span>
    </div>
  );
}
