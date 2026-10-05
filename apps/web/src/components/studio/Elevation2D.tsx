"use client";

import { isWindow, OPENINGS, ROOM_NAMES, type Wall } from "./room-data";
import { openingCentre } from "./room-health";
import { footprintOf, useRoom } from "./room-store";
import { usePieceActions } from "./piece-actions";
import { footprint } from "./piece-detail";
import type { Angle } from "./studio-store";

/**
 * An interior elevation: one wall seen straight on from inside the room,
 * as the drawing set has it beside the plan. The wall's face with the
 * floor and ceiling lines, the side walls and floor slab as poché, the
 * door or window if it is on this wall, and every piece standing before
 * it as its outline, width by height, the nearer ones over the farther.
 * Front is the north wall, Back the south, Left the west, Right the east.
 * A click on a piece picks it, as on the plan.
 */
const MARGIN = 900; // mm, room for the dimensions and the title
const BAND = 150; // mm, the walls and the slab in section
const ELEVATION_OF: Record<string, Wall> = {
  Front: "north",
  Back: "south",
  Left: "west",
  Right: "east",
};

export function Elevation2D({ angle }: { angle: Angle }) {
  const r = useRoom();
  const a = usePieceActions();
  const select = (id: string) => a.onPick(a.pieces.find((n) => n.id === id)!);
  const wall = ELEVATION_OF[angle] ?? "north";
  const { W, D } = a.room;
  const H = r.height;
  // the wall's length, and how a point of the room maps onto it: `along`
  // runs left to right as seen from inside, `away` is the distance from
  // the wall (nearer pieces are drawn last)
  const L = wall === "north" || wall === "south" ? W : D;
  const map = (x: number, y: number, w: number, d: number) => {
    switch (wall) {
      case "north":
        return { from: x, span: w, away: y };
      case "south":
        return { from: W - x - w, span: w, away: D - y - d };
      case "west":
        return { from: D - y - d, span: d, away: x };
      default:
        return { from: y, span: d, away: W - x - w };
    }
  };
  const vw = L + 2 * MARGIN;
  const vh = H + 2 * MARGIN;
  // the openings on this wall, seen from inside: the south and west
  // walls read mirrored, so a place along the wall is turned round
  const shell = { W, D, outline: footprintOf(r), openings: r.openings };
  const openings = r.openings
    .filter((o) => o.wall === wall)
    .map((o) => {
      const from = openingCentre(shell, o).centre - o.width / 2;
      return {
        o,
        from: wall === "south" || wall === "west" ? L - from - o.width : from,
      };
    });
  const pieces = a.shown
    .map((n) => {
      const p = a.props.get(n.id)!;
      const f = footprint(p);
      const at = a.spots.get(n.id)!;
      return { n, p, ...map(at.x, at.y, f.w, f.d) };
    })
    .sort((p, q) => q.away - p.away);
  // the drawing's y runs down; the room's height runs up from the floor
  const up = (h: number) => H - h;

  return (
    <div className="plan" style={{ aspectRatio: `${vw} / ${vh}` }}>
      <svg
        className="plan-svg elev-svg"
        viewBox={`${-MARGIN} ${-MARGIN} ${vw} ${vh}`}
        aria-label={`${wall} wall of the ${ROOM_NAMES[r.room]}, ${L} by ${H} millimetres`}
      >
        <defs>
          <pattern
            id="elev-hatch"
            width="110"
            height="110"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="110" className="plan-hatch" />
          </pattern>
        </defs>
        {/* the wall's face, then the side walls and the floor in section */}
        <rect x={0} y={0} width={L} height={H} className="elev-face" />
        <rect
          x={-BAND}
          y={-BAND}
          width={BAND}
          height={H + 2 * BAND}
          className="elev-cut"
        />
        <rect
          x={L}
          y={-BAND}
          width={BAND}
          height={H + 2 * BAND}
          className="elev-cut"
        />
        <rect
          x={-BAND}
          y={H}
          width={L + 2 * BAND}
          height={BAND}
          className="elev-cut"
        />
        <rect
          x={-BAND}
          y={-BAND}
          width={L + 2 * BAND}
          height={BAND}
          className="elev-cut"
        />
        <line x1={0} y1={H} x2={L} y2={H} className="plan-line" />
        <line x1={0} y1={0} x2={L} y2={0} className="plan-line" />

        {/* the doors from the floor, with a leaf's knob, a double's
            meeting line or a sliding pair's overlap; the windows from
            their sills */}
        {openings.map(({ o, from }) =>
          isWindow(o) ? (
            <g key={o.id} className="elev-opening" data-kind={o.kind}>
              <rect
                x={from}
                y={up(o.head ?? OPENINGS.window.head)}
                width={o.width}
                height={
                  (o.head ?? OPENINGS.window.head) -
                  (o.sill ?? OPENINGS.window.sill)
                }
              />
              <line
                x1={from + o.width / 2}
                y1={up(o.head ?? OPENINGS.window.head)}
                x2={from + o.width / 2}
                y2={up(o.sill ?? OPENINGS.window.sill)}
              />
            </g>
          ) : (
            <g key={o.id} className="elev-opening" data-kind={o.kind}>
              <rect
                x={from}
                y={up(OPENINGS.door.height)}
                width={o.width}
                height={OPENINGS.door.height}
              />
              {(o.kind === "double" || o.kind === "sliding") && (
                <line
                  x1={from + o.width / 2}
                  y1={up(OPENINGS.door.height)}
                  x2={from + o.width / 2}
                  y2={up(0)}
                />
              )}
              {o.kind === "door" && (
                <circle
                  cx={from + o.width - 90}
                  cy={up(OPENINGS.door.height / 2)}
                  r={28}
                  className="elev-knob"
                />
              )}
              {o.kind === "double" &&
                [-60, 60].map((k) => (
                  <circle
                    key={k}
                    cx={from + o.width / 2 + k}
                    cy={up(OPENINGS.door.height / 2)}
                    r={28}
                    className="elev-knob"
                  />
                ))}
            </g>
          ),
        )}
        {/* the pieces before the wall, far to near */}
        {pieces.map(({ n, p, from, span }) => (
          <g
            key={n.id}
            className="elev-piece"
            data-kind={n.kind}
            data-selected={a.selectedId === n.id}
            role="button"
            tabIndex={0}
            aria-label={n.name}
            aria-pressed={a.selectedId === n.id}
            onClick={() => select(n.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(n.id);
              }
            }}
          >
            <rect x={from} y={up(p.height)} width={span} height={p.height} />
            {span > 500 && (
              <text
                x={from + span / 2}
                y={up(p.height) + Math.min(p.height, 400) / 2 + 60}
              >
                {n.name.toUpperCase()}
              </text>
            )}
          </g>
        ))}

        {/* the wall's length below, the ceiling height at the side */}
        <g className="plan-dim">
          <line x1={0} y1={H + BAND + 60} x2={0} y2={H + MARGIN * 0.55 + 100} />
          <line x1={L} y1={H + BAND + 60} x2={L} y2={H + MARGIN * 0.55 + 100} />
          <line x1={0} y1={H + MARGIN * 0.55} x2={L} y2={H + MARGIN * 0.55} />
          <text x={L / 2} y={H + MARGIN * 0.55 - 70}>
            {L}
          </text>
        </g>
        <g className="plan-dim">
          <line x1={L + BAND + 60} y1={0} x2={L + MARGIN * 0.55 + 100} y2={0} />
          <line x1={L + BAND + 60} y1={H} x2={L + MARGIN * 0.55 + 100} y2={H} />
          <line x1={L + MARGIN * 0.55} y1={0} x2={L + MARGIN * 0.55} y2={H} />
          <text
            x={L + MARGIN * 0.55 - 70}
            y={H / 2}
            transform={`rotate(-90 ${L + MARGIN * 0.55 - 70} ${H / 2})`}
          >
            {H}
          </text>
        </g>

        {/* the title block, top left of the sheet */}
        <g
          className="plan-title"
          transform={`translate(${-BAND} ${-MARGIN * 0.9})`}
        >
          <rect x="0" y="0" width={Math.min(L * 0.7, 3600)} height={420} />
          <text x={110} y={165}>
            {ROOM_NAMES[r.room].toUpperCase()} · {wall.toUpperCase()} WALL
          </text>
          <text x={110} y={335} className="plan-title-sub">
            ELEVATION · 1:50 · MM · CEILING {H}
          </text>
        </g>
      </svg>
    </div>
  );
}
