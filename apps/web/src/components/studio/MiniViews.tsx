"use client";

import { usePieceActions } from "./piece-actions";
import { colourHex, footprint, ROOM_ITEM_HEX } from "./piece-detail";
import { footprintOf, useActiveRoom } from "./room-store";
import { isoBoxes, isoFaces, isoProjector } from "./room-templates";

/**
 * The view panel's small copy of the 3D view: the room as a little
 * isometric box with each piece standing in it, the way the Room tab
 * shows its templates (the small plan is the plan itself, with the
 * stage's own pieces on it).
 */
const BOX = { w: 160, h: 120 };

export function MiniIso() {
  const r = useActiveRoom();
  const a = usePieceActions();
  const outline = footprintOf(r);
  const { P } = isoProjector(outline, BOX, r.height);
  const room = isoFaces(outline, BOX, r.height);
  const pieces = isoBoxes(
    P,
    a.shown.map((n) => {
      const p = a.props.get(n.id)!;
      const f = footprint(p);
      const at = a.spots.get(n.id)!;
      return {
        x: at.x,
        y: at.y,
        w: f.w,
        d: f.d,
        h: p.height,
        fill: n.kind === "piece" ? colourHex(p.colour) : ROOM_ITEM_HEX,
      };
    }),
  );
  // the floor and the far walls first, the pieces on the floor, then the
  // near walls (seen from outside) over them
  const far = room.filter((f) => f.kind !== "out");
  const near = room.filter((f) => f.kind === "out");
  return (
    <svg
      className="view-mini-iso room-template-iso"
      viewBox={`0 0 ${BOX.w} ${BOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {[...far, ...pieces, ...near].map((f, i) => (
        <polygon
          key={i}
          points={f.points}
          data-face={f.kind}
          style={f.fill ? { fill: f.fill } : undefined}
        />
      ))}
    </svg>
  );
}
