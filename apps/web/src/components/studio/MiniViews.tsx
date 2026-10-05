"use client";

import { usePieceActions } from "./piece-actions";
import { colourHex, footprint, ROOM_ITEM_HEX } from "./piece-detail";
import {
  footprintOf,
  type RoomSpec,
  sheetBox,
  useActiveRoom,
  useRoom,
} from "./room-store";
import {
  isoBoxes,
  isoFacesIn,
  isoProjector,
  type Point,
} from "./room-templates";

/**
 * The view panel's small copy of the 3D view: the flat as little
 * isometric boxes, one a room, each piece standing in its room, the way
 * the Room tab shows its templates (the small plan is the plan itself,
 * with the stage's own pieces on it). Rooms are painted far to near.
 */
const BOX = { w: 160, h: 120 };

export function MiniIso() {
  const rooms = useRoom((s) => s.rooms);
  const active = useActiveRoom();
  // one projection for the whole flat: the box round every room
  const box = sheetBox(rooms);
  const frame: Point[] = [
    [0, 0],
    [box.w, 0],
    [box.w, box.h],
    [0, box.h],
  ];
  const proj = isoProjector(frame, BOX, active.height);
  const far = [...rooms].sort(
    (a, b) => a.pos[0] + a.pos[1] - (b.pos[0] + b.pos[1]),
  );
  return (
    <svg
      className="view-mini-iso room-template-iso"
      viewBox={`0 0 ${BOX.w} ${BOX.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {far.map((rm) => (
        <RoomIso
          key={rm.id}
          rm={rm}
          proj={proj}
          origin={[box.x, box.y]}
          active={rm.id === active.id}
        />
      ))}
    </svg>
  );
}

/** one room's box and the pieces in it, in the flat's projection */
function RoomIso({
  rm,
  proj,
  origin,
  active,
}: {
  rm: RoomSpec;
  proj: ReturnType<typeof isoProjector>;
  /** the flat's box's corner on the sheet, mm */
  origin: Point;
  active: boolean;
}) {
  const a = usePieceActions(rm.id);
  const dx = rm.pos[0] - origin[0];
  const dy = rm.pos[1] - origin[1];
  const outline = footprintOf(rm).map(([x, y]): Point => [x + dx, y + dy]);
  const room = isoFacesIn(proj, outline);
  const pieces = isoBoxes(
    proj.P,
    a.shown.map((n) => {
      const p = a.props.get(n.id)!;
      const f = footprint(p);
      const at = a.spots.get(n.id)!;
      return {
        x: at.x + dx,
        y: at.y + dy,
        w: f.w,
        d: f.d,
        h: p.height,
        fill: n.kind === "piece" ? colourHex(p.colour) : ROOM_ITEM_HEX,
      };
    }),
  );
  // the floor and the far walls first, the pieces on the floor, then the
  // near walls (seen from outside) over them
  const farFaces = room.filter((f) => f.kind !== "out");
  const near = room.filter((f) => f.kind === "out");
  return (
    <g data-active={active}>
      {[...farFaces, ...pieces, ...near].map((f, i) => (
        <polygon
          key={i}
          points={f.points}
          data-face={f.kind}
          style={f.fill ? { fill: f.fill } : undefined}
        />
      ))}
    </g>
  );
}
