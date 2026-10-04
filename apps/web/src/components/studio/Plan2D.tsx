"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { OPENINGS, ROOM_NAMES, type Wall } from "./room-data";
import { CLOSE_WITHIN, footprintOf, useRoom } from "./room-store";
import { useStudio } from "./studio-store";

/**
 * The plan as a drawing office draws it, a stand-in until the real plan.
 * The room's outline (drawn, or the template's shape) as a wall band,
 * poché-hatched and faced both sides; the door as an opening, its leaf
 * and swing; the window as the three lines of its frame; dimension lines
 * with ticks and millimetres outside two walls; a north arrow and a
 * title block. The pieces sit on it as symbols (the layer over this).
 * Everything scales from the Room tab's millimetres. With the Wall tool
 * on, a click sets a corner, snapped to the grid; a click back on the
 * first corner closes the room; Escape forgets the corners so far.
 */
const WALL = 150; // mm, half the band's thickness
const FACE = 14; // mm, the face line either side of the band
const MARGIN = 1100; // mm, room for the dimensions, the arrow, the title
const DOOR = OPENINGS.door.width;
const WINDOW = OPENINGS.window.width;

type Edge = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
};

/** the middle of a wall, the direction along it and the way into the room */
const edgeOf = (wall: Wall, W: number, D: number): Edge => {
  switch (wall) {
    case "north":
      return { x: W / 2, y: 0, dx: 1, dy: 0, nx: 0, ny: 1 };
    case "south":
      return { x: W / 2, y: D, dx: 1, dy: 0, nx: 0, ny: -1 };
    case "west":
      return { x: 0, y: D / 2, dx: 0, dy: 1, nx: 1, ny: 0 };
    default:
      return { x: W, y: D / 2, dx: 0, dy: 1, nx: -1, ny: 0 };
  }
};

/** a rectangle along an edge: `len` along it, `thick` across it */
const alongRect = (e: Edge, len: number, thick: number) => {
  const hx = (e.dx * len) / 2;
  const hy = (e.dy * len) / 2;
  const tx = (e.nx * thick) / 2;
  const ty = (e.ny * thick) / 2;
  return [
    [e.x - hx - tx, e.y - hy - ty],
    [e.x + hx - tx, e.y + hy - ty],
    [e.x + hx + tx, e.y + hy + ty],
    [e.x - hx + tx, e.y - hy + ty],
  ]
    .map((p) => p.join(","))
    .join(" ");
};

export function Plan2D({
  children,
  interactive = true,
}: {
  children?: ReactNode;
  /** false for the small copy in the view panel: no drawing, no sheet */
  interactive?: boolean;
}) {
  const r = useRoom();
  const tool = useStudio((s) => s.tool);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = r.width;
  const D = r.depth;
  const vw = W + 2 * MARGIN;
  const vh = D + 2 * MARGIN;
  const outline = footprintOf(r);
  const poly = outline.map((p) => p.join(",")).join(" ");
  const drawingOn = interactive && tool === "wall";

  useEffect(() => {
    if (!drawingOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useRoom.getState().drawing.length)
        useRoom.setState({ drawing: [] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawingOn]);

  // a click on the sheet, in millimetres of the room
  const onPlanClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!drawingOn || !svgRef.current) return;
    const m = svgRef.current.getScreenCTM();
    if (!m) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    r.addCorner([pt.x, pt.y]);
  };

  const door = edgeOf(r.door, W, D);
  const win = edgeOf(r.window, W, D);
  // the door: the hinge at one jamb, the leaf standing into the room, the
  // swing from the leaf's tip to the other jamb
  const hinge = {
    x: door.x - (door.dx * DOOR) / 2,
    y: door.y - (door.dy * DOOR) / 2,
  };
  const jamb = {
    x: door.x + (door.dx * DOOR) / 2,
    y: door.y + (door.dy * DOOR) / 2,
  };
  const tip = { x: hinge.x + door.nx * DOOR, y: hinge.y + door.ny * DOOR };
  const cross = door.dx * door.ny - door.dy * door.nx;
  const sweep = cross > 0 ? 1 : 0;

  const dim = (
    a: [number, number],
    b: [number, number],
    text: string,
    out: [number, number],
  ) => {
    const off = MARGIN * 0.5;
    const o: [number, number] = [out[0] * off, out[1] * off];
    const ax = a[0] + o[0],
      ay = a[1] + o[1],
      bx = b[0] + o[0],
      by = b[1] + o[1];
    const vertical = out[0] !== 0;
    const ext = 0.3;
    return (
      <g className="plan-dim">
        <line
          x1={a[0] + out[0] * 60}
          y1={a[1] + out[1] * 60}
          x2={ax + o[0] * ext}
          y2={ay + o[1] * ext}
        />
        <line
          x1={b[0] + out[0] * 60}
          y1={b[1] + out[1] * 60}
          x2={bx + o[0] * ext}
          y2={by + o[1] * ext}
        />
        <line x1={ax} y1={ay} x2={bx} y2={by} />
        <line x1={ax - 55} y1={ay + 55} x2={ax + 55} y2={ay - 55} />
        <line x1={bx - 55} y1={by + 55} x2={bx + 55} y2={by - 55} />
        <text
          x={(ax + bx) / 2}
          y={(ay + by) / 2}
          dy={vertical ? 0 : -90}
          dx={vertical ? -90 : 0}
          transform={
            vertical
              ? `rotate(-90 ${(ax + bx) / 2} ${(ay + by) / 2})`
              : undefined
          }
        >
          {text}
        </text>
      </g>
    );
  };

  return (
    <div
      className="plan"
      style={{ aspectRatio: `${vw} / ${vh}`, ["--ratio" as string]: vw / vh }}
    >
      <svg
        ref={svgRef}
        className="plan-svg"
        data-drawing={drawingOn}
        viewBox={`${-MARGIN} ${-MARGIN} ${vw} ${vh}`}
        aria-label={`Plan of the ${ROOM_NAMES[r.room]}, ${W} by ${D} millimetres`}
        onClick={onPlanClick}
      >
        <defs>
          <pattern
            id="plan-hatch"
            width="110"
            height="110"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="110" className="plan-hatch" />
          </pattern>
        </defs>

        {/* the floor; then the band along the outline: its faces as a wide
            heavy stroke, the hatch over all but the face lines */}
        <polygon points={poly} className="plan-floor" />
        <polygon
          points={poly}
          className="plan-face"
          strokeWidth={WALL * 2 + FACE * 2}
        />
        <polygon points={poly} className="plan-wall" strokeWidth={WALL * 2} />

        {/* the window: the opening in the band, then its three lines */}
        <polygon
          points={alongRect(win, WINDOW, WALL * 2 + 30)}
          className="plan-opening"
        />
        {[-WALL, 0, WALL].map((k) => (
          <line
            key={k}
            x1={win.x - (win.dx * WINDOW) / 2 + win.nx * k}
            y1={win.y - (win.dy * WINDOW) / 2 + win.ny * k}
            x2={win.x + (win.dx * WINDOW) / 2 + win.nx * k}
            y2={win.y + (win.dy * WINDOW) / 2 + win.ny * k}
            className="plan-line"
          />
        ))}

        {/* the door: the opening, the leaf, the swing */}
        <polygon
          points={alongRect(door, DOOR, WALL * 2 + 30)}
          className="plan-opening"
        />
        <line
          x1={hinge.x}
          y1={hinge.y}
          x2={tip.x}
          y2={tip.y}
          className="plan-leaf"
        />
        <path
          d={`M ${tip.x} ${tip.y} A ${DOOR} ${DOOR} 0 0 ${sweep} ${jamb.x} ${jamb.y}`}
          className="plan-swing"
        />

        {dim([0, 0], [W, 0], `${W}`, [0, -1])}
        {dim([0, D], [0, 0], `${D}`, [-1, 0])}

        {/* the north arrow, top right of the sheet */}
        <g
          className="plan-north"
          transform={`translate(${W + MARGIN * 0.55} ${-MARGIN * 0.6})`}
        >
          <circle r={180} />
          <path d="M0 -150 L75 70 L0 25 L-75 70 Z" />
          <text y={300}>N</text>
        </g>

        {/* the title block, bottom left of the sheet, as a drawing has it */}
        <g
          className="plan-title"
          transform={`translate(${-MARGIN * 0.9} ${D + MARGIN * 0.4})`}
        >
          <rect x="0" y="0" width={Math.min(W * 0.62, 3600)} height={420} />
          <text x={110} y={165}>
            {ROOM_NAMES[r.room].toUpperCase()} · {r.flat.toUpperCase()} HDB
          </text>
          <text x={110} y={335} className="plan-title-sub">
            PLAN · 1:50 · MM · CEILING {r.height} · {r.floor.toUpperCase()}
          </text>
        </g>

        {/* the corners set so far, and the line between them */}
        {r.drawing.length > 0 && (
          <g className="plan-drawing">
            <polyline
              points={r.drawing.map((p) => p.join(",")).join(" ")}
              className="plan-drawing-line"
            />
            {r.drawing.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={i === 0 && r.drawing.length >= 3 ? CLOSE_WITHIN / 2 : 70}
                className={
                  i === 0 ? "plan-corner plan-corner-first" : "plan-corner"
                }
              />
            ))}
          </g>
        )}
      </svg>
      {/* the pieces, laid over the room's own box */}
      <div
        className="plan-pieces"
        style={{
          left: `${(MARGIN / vw) * 100}%`,
          top: `${(MARGIN / vh) * 100}%`,
          width: `${(W / vw) * 100}%`,
          height: `${(D / vh) * 100}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
