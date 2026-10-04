"use client";

import type { ReactNode } from "react";
import { ROOM_NAMES, type Wall } from "./room-data";
import { useRoom } from "./room-store";

/**
 * The plan as a drawing office draws it, a stand-in until the real plan:
 * walls as a hatched band, the door with its swing on its wall, the
 * window as its three lines, dimension lines with ticks and millimetres
 * outside each wall, a north arrow and a title block. The pieces sit on
 * it as named symbols (the layer over this one). Everything scales from
 * the Room tab's millimetres.
 */
const WALL = 150; // mm
const MARGIN = 900; // mm, room for the dimension lines
const DOOR = 900;
const WINDOW = 1500;

export function Plan2D({ children }: { children?: ReactNode }) {
  const r = useRoom();
  const W = r.width;
  const D = r.depth;
  const vw = W + 2 * MARGIN;
  const vh = D + 2 * MARGIN;
  const ink = "rgb(from var(--color-ink) r g b / 0.75)";
  const faint = "rgb(from var(--color-ink) r g b / 0.4)";

  // the middle of a wall, as a point and the direction along it
  const along = (
    wall: Wall,
  ): { x: number; y: number; dx: number; dy: number } => {
    switch (wall) {
      case "north":
        return { x: W / 2, y: 0, dx: 1, dy: 0 };
      case "south":
        return { x: W / 2, y: D, dx: 1, dy: 0 };
      case "west":
        return { x: 0, y: D / 2, dx: 0, dy: 1 };
      default:
        return { x: W, y: D / 2, dx: 0, dy: 1 };
    }
  };
  const door = along(r.door);
  const win = along(r.window);
  // the door leaf opens into the room: a quarter circle from the hinge
  const inward = (wall: Wall) =>
    wall === "north"
      ? [0, 1]
      : wall === "south"
        ? [0, -1]
        : wall === "west"
          ? [1, 0]
          : [-1, 0];
  const [ix, iy] = inward(r.door);
  const hinge = {
    x: door.x - (door.dx * DOOR) / 2,
    y: door.y - (door.dy * DOOR) / 2,
  };
  const leafEnd = { x: hinge.x + ix! * DOOR, y: hinge.y + iy! * DOOR };
  const arcEnd = { x: hinge.x + door.dx * DOOR, y: hinge.y + door.dy * DOOR };
  const sweep = r.door === "north" || r.door === "east" ? 0 : 1;

  const dim = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    text: string,
    side: Wall,
  ) => {
    const off = MARGIN * 0.55;
    const o =
      side === "north"
        ? [0, -off]
        : side === "south"
          ? [0, off]
          : side === "west"
            ? [-off, 0]
            : [off, 0];
    const ax = x1 + o[0]!,
      ay = y1 + o[1]!,
      bx = x2 + o[0]!,
      by = y2 + o[1]!;
    const vertical = side === "west" || side === "east";
    return (
      <g className="plan-dim" key={side}>
        <line
          x1={x1}
          y1={y1}
          x2={ax + (vertical ? o[0]! * 0.25 : 0)}
          y2={ay + (vertical ? 0 : o[1]! * 0.25)}
        />
        <line
          x1={x2}
          y1={y2}
          x2={bx + (vertical ? o[0]! * 0.25 : 0)}
          y2={by + (vertical ? 0 : o[1]! * 0.25)}
        />
        <line x1={ax} y1={ay} x2={bx} y2={by} />
        <line x1={ax - 60} y1={ay - 60} x2={ax + 60} y2={ay + 60} />
        <line x1={bx - 60} y1={by - 60} x2={bx + 60} y2={by + 60} />
        <text
          x={(ax + bx) / 2}
          y={(ay + by) / 2}
          transform={
            vertical
              ? `rotate(-90 ${(ax + bx) / 2} ${(ay + by) / 2})`
              : undefined
          }
          dy={
            vertical
              ? side === "west"
                ? -90
                : 220
              : side === "north"
                ? -90
                : 220
          }
        >
          {text}
        </text>
      </g>
    );
  };

  return (
    <div className="plan" style={{ aspectRatio: `${vw} / ${vh}` }}>
      <svg
        className="plan-svg"
        viewBox={`${-MARGIN} ${-MARGIN} ${vw} ${vh}`}
        aria-label={`Plan of the ${ROOM_NAMES[r.room]}, ${W} by ${D} millimetres`}
      >
        <defs>
          <pattern
            id="plan-hatch"
            width="120"
            height="120"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="120" stroke={ink} strokeWidth="18" />
          </pattern>
        </defs>
        {/* the walls: outer face, hatched band, inner face */}
        <rect
          x={-WALL}
          y={-WALL}
          width={W + 2 * WALL}
          height={D + 2 * WALL}
          fill="url(#plan-hatch)"
          stroke={ink}
          strokeWidth={24}
        />
        <rect
          x={0}
          y={0}
          width={W}
          height={D}
          fill="var(--color-paper)"
          stroke={ink}
          strokeWidth={24}
        />
        {/* the door: the opening, the leaf and its swing */}
        <line
          x1={door.x - (door.dx * DOOR) / 2 - door.dy * WALL * 1.3}
          y1={door.y - (door.dy * DOOR) / 2 - door.dx * WALL * 1.3}
          x2={door.x + (door.dx * DOOR) / 2 + door.dy * WALL * 1.3}
          y2={door.y + (door.dy * DOOR) / 2 + door.dx * WALL * 1.3}
          stroke="var(--color-paper)"
          strokeWidth={WALL * 2.6}
        />
        <line
          x1={hinge.x}
          y1={hinge.y}
          x2={leafEnd.x}
          y2={leafEnd.y}
          stroke={ink}
          strokeWidth={30}
        />
        <path
          d={`M ${leafEnd.x} ${leafEnd.y} A ${DOOR} ${DOOR} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={faint}
          strokeWidth={14}
          strokeDasharray="60 50"
        />
        {/* the window: the sill and two panes as three lines */}
        {[-WALL / 2, 0, WALL / 2].map((k) => (
          <line
            key={k}
            x1={win.x - (win.dx * WINDOW) / 2 + win.dy * k}
            y1={win.y - (win.dy * WINDOW) / 2 + win.dx * k}
            x2={win.x + (win.dx * WINDOW) / 2 + win.dy * k}
            y2={win.y + (win.dy * WINDOW) / 2 + win.dx * k}
            stroke={k === 0 ? "var(--color-paper)" : ink}
            strokeWidth={k === 0 ? WALL - 40 : 20}
          />
        ))}
        {dim(0, 0, W, 0, `${W}`, "north")}
        {dim(0, D, 0, 0, `${D}`, "west")}
        {/* north arrow */}
        <g
          className="plan-north"
          transform={`translate(${W + MARGIN * 0.55} ${-MARGIN * 0.55})`}
        >
          <circle r={170} fill="none" stroke={faint} strokeWidth={16} />
          <path d="M0 -140 L70 60 L0 20 L-70 60 Z" fill={ink} />
          <text y={290}>N</text>
        </g>
        {/* title block */}
        <g
          className="plan-title"
          transform={`translate(${W + MARGIN * 0.15} ${D + MARGIN * 0.35})`}
        >
          <text textAnchor="end">
            {ROOM_NAMES[r.room].toUpperCase()} · {r.flat.toUpperCase()} HDB
          </text>
          <text y={200} textAnchor="end">
            PLAN · 1:50 · MM · CEILING {r.height}
          </text>
        </g>
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
