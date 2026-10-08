"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  OPENING_WIDTH,
  ROOM_NAMES,
  ROOM_SIZE,
  type Opening,
  type Wall,
} from "./room-data";
import {
  boxOf,
  edgeFrame,
  edgesOf,
  isSimple,
  magnetRoom,
  moveCorner,
  outerOutline,
  pushEdge,
  splitEdge,
} from "./room-geometry";
import { usePieceActions } from "./piece-actions";
import { openingCentre, zonesOf } from "./room-health";
import {
  activeOf,
  CLOSE_WITHIN,
  footprintOf,
  openingsOf,
  roomLabel,
  type RoomSpec,
  sheetBox,
  sheetOutline,
  useRoom,
} from "./room-store";
import { StagePieces } from "./StagePieces";
import type { Point } from "./room-templates";
import { useStudio } from "./studio-store";
import { PLACE_SNAP } from "./piece-detail";
import {
  DRAG_FROM,
  pinchOf,
  readWheel,
  useCoarse,
  type GestureEvent,
} from "./input";

/**
 * The plan as a drawing office draws it.
 * The room's outline (drawn, or the template's shape) as a wall band,
 * poché-hatched and faced both sides; the door as an opening, its leaf
 * and swing; the window as the three lines of its frame; dimension lines
 * with ticks and millimetres outside two walls; a north arrow and a
 * title block. The pieces sit on it as symbols (the layer over this).
 * Everything scales from the Room tab's millimetres. With the Wall tool
 * on, a click sets a corner, snapped to the grid; a click back on the
 * first corner closes the room; Escape forgets the corners so far. With
 * Measure on, a click sets one end and a click the other, the distance
 * in millimetres between them (and the run and rise when it is on the
 * slant); Escape clears it. With Tour on, a click sets a stop of the
 * tour, numbered in order and joined by a dashed line; a click on a stop
 * takes it away. The wheel zooms the sheet about the pointer
 * (a mouse) or scrolls it (a trackpad), a pinch zooms it on a trackpad
 * and under two fingers, dragging the sheet pans it, and Fit brings it
 * back. Under a finger the measure snaps to 100 mm.
 */
const FACE = 14; // mm, the face line either side of the band
const BAND_PAD = 15; // mm, an opening's gap past the band's faces
const GRIP_PAD = 60; // mm, a grip past the band's faces
const LABEL_IN = 260; // mm, an opening's label inside the band
const MARGIN = 1100; // mm, room for the dimensions, the arrow, the title
/** the room's handles with the Wall tool, mm: the bar on a wall takes a
    share of the wall's free run, between a shortest and a longest, and
    carries the wall's length once it is long enough; the corner is a
    square */
const BAR = { min: 300, max: 1200, share: 0.6, labelled: 700 };
const CORNER = 260;

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

/** a rectangle on an edge's band: `len` along it, across the wall's
    thickness `t` outside the outline and `pad` past both faces */
const bandRect = (e: Edge, len: number, t: number, pad: number) => {
  const hx = (e.dx * len) / 2;
  const hy = (e.dy * len) / 2;
  // the band's middle stands half a thickness outside the outline
  const cx = e.x - (e.nx * t) / 2;
  const cy = e.y - (e.ny * t) / 2;
  const tx = (e.nx * (t + 2 * pad)) / 2;
  const ty = (e.ny * (t + 2 * pad)) / 2;
  return [
    [cx - hx - tx, cy - hy - ty],
    [cx + hx - tx, cy + hy - ty],
    [cx + hx + tx, cy + hy + ty],
    [cx - hx + tx, cy - hy + ty],
  ]
    .map((p) => p.join(","))
    .join(" ");
};

/** the walls as the band between the outline and its outer face, the
    hatch within and a face line on each side */
const Band = ({ outline, t }: { outline: readonly Point[]; t: number }) => {
  const inner = outline.map((p) => p.join(",")).join(" ");
  const outer = outerOutline(outline, t)
    .map((p) => p.join(","))
    .join(" ");
  const ring = `M${inner.split(" ").join("L")}Z M${outer.split(" ").join("L")}Z`;
  return (
    <>
      <path d={ring} className="plan-wall" fillRule="evenodd" />
      <polygon points={inner} className="plan-face" strokeWidth={FACE} />
      <polygon points={outer} className="plan-face" strokeWidth={FACE} />
    </>
  );
};

export function Plan2D({
  interactive = true,
}: {
  /** false for the small copy in the view panel: no drawing, no sheet */
  interactive?: boolean;
}) {
  const st = useRoom();
  const rooms = st.rooms;
  const active = activeOf(st);
  /** the active room's fields with the actions, as one */
  const r = { ...st, ...active };
  const tool = useStudio((s) => s.tool);
  const planZoom = useStudio((s) => s.planZoom);
  const planPan = useStudio((s) => s.planPan);
  const wheelMode = useStudio((s) => s.wheelMode);
  const { zoomPlan, panPlan } = useStudio.getState();
  const coarse = useCoarse();
  const snap = coarse ? 100 : PLACE_SNAP;
  const svgRef = useRef<SVGSVGElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<{
    from: [number, number] | null;
    to: [number, number] | null;
    /** the pointer, while the other end is not yet set */
    at: [number, number] | null;
  }>({ from: null, to: null, at: null });
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number } | null>(null);
  /** the pointers down on the sheet, for a two-finger pinch */
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ span: number; mid: { x: number; y: number } } | null>(
    null,
  );
  const W = r.width;
  const D = r.depth;
  // the sheet holds every room: its box, with a margin round it
  const box = sheetBox(rooms);
  const vw = box.w + 2 * MARGIN;
  const vh = box.h + 2 * MARGIN;
  const outline = footprintOf(r);
  const pos = active.pos;
  /** a point of the sheet in the active room's own frame */
  const local = (p: Point): Point => [p[0] - pos[0], p[1] - pos[1]];
  /** a room's shell, for its openings and zones */
  const shellOf = (rm: RoomSpec) => ({
    W: rm.width,
    D: rm.depth,
    outline: footprintOf(rm),
    openings: openingsOf(st, rm),
  });
  const edges = edgesOf(outline);
  const poly = outline.map((p) => p.join(",")).join(" ");
  const drawingOn = interactive && tool === "wall";
  // with the Wall tool the openings take the hand: a drag along the wall
  // moves one, a drag at an end pulls its width
  const grips = drawingOn;
  const grip = useRef<{
    id: string;
    mode: "move" | "a" | "b";
    /** the end that stays, mm along the wall, while the other is pulled */
    keep: number;
  } | null>(null);
  // and the room itself: a bar on each wall pushes it in or out, a square
  // on each corner moves it, a double-click on a wall splits it in two
  const handles = drawingOn && r.drawing.length === 0;
  const shape = useRef<{
    kind: "edge" | "corner";
    i: number;
    /** the outline when the drag began, in the frame it began in */
    from: Point[];
    /** where the pointer began, in that frame */
    at: Point;
    /** how far the frame has moved since, as walls were pushed */
    acc: { x: number; y: number };
  } | null>(null);
  // and the whole room: with the Wall tool, its floor drags it about the
  // sheet; the magnet stands it against a neighbour, a wall apart
  const magnet = useStudio((s) => s.magnet);
  const carry = useRef<{
    from: Point;
    /** the pointer at the press, px, and the sheet's scale then: the
        sheet grows as the room moves, so the drag keeps the first scale */
    x0: number;
    y0: number;
    mmPerPx: number;
    moved: boolean;
  } | null>(null);
  /** a drag of the room just ended: the click that follows is not a corner */
  const carried = useRef(false);
  const measuring = interactive && tool === "measure";
  const touring = interactive && tool === "tour";
  const stops = useRoom((s) => s.stops);
  // the planner's zones show on the sheet while something stands in them
  const { issues } = usePieceActions();
  const opening = shellOf(active);
  const zones = zonesOf(opening);
  const doorBlocked = issues.some((i) => i.kind === "door");
  const windowBlocked = issues.some((i) => i.kind === "window");

  useEffect(() => {
    if (!drawingOn && !measuring) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawingOn && useRoom.getState().drawing.length)
        useRoom.setState({ drawing: [] });
      if (measuring) setMeasure({ from: null, to: null, at: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawingOn, measuring]);

  // the wheel, over the sheet and the pieces alike: a zoom about the
  // pointer or a scroll, as the device and the setting say; listeners of
  // their own, since the page must not scroll or zoom with them
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!interactive || !sheet) return;
    const about = (x: number, y: number) => {
      const r = sheet.getBoundingClientRect();
      return { x: x - (r.left + r.width / 2), y: y - (r.top + r.height / 2) };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const read = readWheel(e, wheelMode);
      if (read.kind === "zoom")
        zoomPlan(read.factor, about(e.clientX, e.clientY));
      else panPlan(read.dx, read.dy);
    };
    // Safari's trackpad pinch
    let scale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      scale = 1;
    };
    const onGesture = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      zoomPlan(g.scale / scale, about(g.clientX, g.clientY));
      scale = g.scale;
    };
    sheet.addEventListener("wheel", onWheel, { passive: false });
    sheet.addEventListener("gesturestart", onGestureStart);
    sheet.addEventListener("gesturechange", onGesture);
    return () => {
      sheet.removeEventListener("wheel", onWheel);
      sheet.removeEventListener("gesturestart", onGestureStart);
      sheet.removeEventListener("gesturechange", onGesture);
    };
  }, [interactive, wheelMode, zoomPlan, panPlan]);

  // a point on the sheet, in millimetres of the room
  const mmOf = (e: { clientX: number; clientY: number }) => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [pt.x, pt.y] as [number, number];
  };
  const snapped = (p: Point): [number, number] => [
    Math.round(p[0] / snap) * snap,
    Math.round(p[1] / snap) * snap,
  ];
  // a click on the sheet: a corner while drawing, an end while measuring
  const onPlanClick = (e: MouseEvent<SVGSVGElement>) => {
    if (carried.current) {
      carried.current = false;
      return;
    }
    const pt = mmOf(e);
    if (!pt) return;
    if (drawingOn) r.addCorner(pt);
    else if (touring) r.addStop(pt);
    else if (measuring)
      setMeasure((m) =>
        !m.from || m.to
          ? { from: snapped(pt), to: null, at: null }
          : { ...m, to: snapped(pt), at: null },
      );
  };
  const onPlanMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!measuring || !measure.from || measure.to) return;
    const pt = mmOf(e);
    if (pt) setMeasure((m) => ({ ...m, at: snapped(pt) }));
  };
  // dragging the sheet pans it, from anywhere but a piece (those have
  // their own drags); two fingers pinch it and move it together
  const canPan = interactive && !drawingOn && !measuring && !touring;
  const capture = (e: PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.pointerType === "touch") {
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.current.size === 2) {
        const [a, b] = [...fingers.current.values()];
        pinch.current = pinchOf(a!, b!);
        pan.current = null;
        setPanning(false);
        capture(e);
        return;
      }
    }
    if (!canPan || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".stage-piece, button, a, input"))
      return;
    pan.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (fingers.current.has(e.pointerId)) {
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const z = pinch.current;
      if (z && fingers.current.size >= 2) {
        const [a, b] = [...fingers.current.values()];
        const now = pinchOf(a!, b!);
        const r = e.currentTarget.getBoundingClientRect();
        zoomPlan(now.span / z.span, {
          x: now.mid.x - (r.left + r.width / 2),
          y: now.mid.y - (r.top + r.height / 2),
        });
        panPlan(now.mid.x - z.mid.x, now.mid.y - z.mid.y);
        pinch.current = now;
        return;
      }
    }
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!panning && Math.hypot(dx, dy) < DRAG_FROM) return;
    if (!panning) {
      setPanning(true);
      capture(e);
    }
    panPlan(dx, dy);
    pan.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    if (fingers.current.size < 2) pinch.current = null;
    pan.current = null;
    setPanning(false);
  };
  // the measurement: one end set, the other following the pointer or set
  const a = measure.from;
  const b = measure.to ?? measure.at;
  const slant = a && b && a[0] !== b[0] && a[1] !== b[1];
  const length = a && b ? Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])) : 0;

  // each opening on its wall: its centre and the edge's run, so it is
  // drawn along the wall whichever way the wall faces
  const onEdge = (shell: ReturnType<typeof shellOf>, o: Opening): Edge => {
    const e = edgeOf(o.wall, shell.W, shell.D);
    const { centre, at } = openingCentre(shell, o);
    const horizontal = o.wall === "north" || o.wall === "south";
    return {
      ...e,
      x: horizontal ? centre : at,
      y: horizontal ? at : centre,
    };
  };
  /** where the pointer is along an opening's wall, mm, snapped */
  const alongWall = (o: Opening, e: { clientX: number; clientY: number }) => {
    const at = mmOf(e);
    if (!at) return null;
    const pt = local(at);
    const horizontal = o.wall === "north" || o.wall === "south";
    return Math.round((horizontal ? pt[0] : pt[1]) / snap) * snap;
  };
  const onGripDown = (
    e: PointerEvent<SVGElement>,
    o: Opening,
    mode: "move" | "a" | "b",
  ) => {
    if (!grips || e.button !== 0) return;
    e.stopPropagation();
    const c = openingCentre(opening, o).centre;
    grip.current = {
      id: o.id,
      mode,
      keep: mode === "a" ? c + o.width / 2 : c - o.width / 2,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onGripMove = (e: PointerEvent<SVGElement>, o: Opening) => {
    const g = grip.current;
    if (!g || g.id !== o.id) return;
    const v = alongWall(o, e);
    if (v === null) return;
    const { setOpening } = useRoom.getState();
    if (g.mode === "move") setOpening(o.id, { at: v });
    else {
      const width = Math.min(
        OPENING_WIDTH.max,
        Math.max(OPENING_WIDTH.min, Math.abs(v - g.keep)),
      );
      const at = g.mode === "a" ? g.keep - width / 2 : g.keep + width / 2;
      setOpening(o.id, { at, width });
    }
  };
  const onGripUp = (o: Opening) => {
    if (grip.current?.id === o.id) grip.current = null;
  };
  /** the outline put to the store if it still makes a room, in the frame
      the drag began in; the frame's own move is kept to carry on from */
  const reshape = (g: NonNullable<typeof shape.current>, next: Point[]) => {
    if (!isSimple(next)) return;
    const { w, h: d } = boxOf(next);
    if (
      w < ROOM_SIZE.min ||
      d < ROOM_SIZE.min ||
      w > ROOM_SIZE.max ||
      d > ROOM_SIZE.max
    )
      return;
    const moved = r.setOutline(
      next.map(([x, y]): Point => [x - g.acc.x, y - g.acc.y]),
    );
    g.acc = { x: g.acc.x - moved.dx, y: g.acc.y - moved.dy };
  };
  const onShapeDown = (
    e: PointerEvent<SVGElement>,
    kind: "edge" | "corner",
    i: number,
  ) => {
    if (!handles || e.button !== 0) return;
    e.stopPropagation();
    const at = mmOf(e);
    if (!at) return;
    shape.current = {
      kind,
      i,
      from: outline,
      at: local(at),
      acc: { x: 0, y: 0 },
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onShapeMove = (e: PointerEvent<SVGElement>) => {
    const g = shape.current;
    if (!g) return;
    const at = mmOf(e);
    if (!at) return;
    // the pointer, in the frame the drag began in
    const here = local(at);
    const pt: Point = [here[0] + g.acc.x, here[1] + g.acc.y];
    if (g.kind === "edge") {
      const f = edgeFrame(g.from, g.i);
      const d =
        Math.round(
          ((pt[0] - g.at[0]) * f.nx + (pt[1] - g.at[1]) * f.ny) / snap,
        ) * snap;
      reshape(g, pushEdge(g.from, g.i, d));
    } else reshape(g, moveCorner(g.from, g.i, snapped(pt)));
  };
  const onShapeUp = () => {
    shape.current = null;
  };
  const onRoomDown = (e: PointerEvent<SVGElement>) => {
    if (!handles || e.button !== 0) return;
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    carry.current = {
      from: pos,
      x0: e.clientX,
      y0: e.clientY,
      mmPerPx: 1 / ctm.a,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows */
    }
  };
  const onRoomMove = (e: PointerEvent<SVGElement>) => {
    const c = carry.current;
    if (!c) return;
    const dx = (e.clientX - c.x0) * c.mmPerPx;
    const dy = (e.clientY - c.y0) * c.mmPerPx;
    if (!c.moved && Math.hypot(dx, dy) < snap) return;
    c.moved = true;
    let next: Point = [
      Math.round((c.from[0] + dx) / snap) * snap,
      Math.round((c.from[1] + dy) / snap) * snap,
    ];
    if (magnet) {
      const moving = outline.map(([x, y]): Point => [x + next[0], y + next[1]]);
      const pull = magnetRoom(
        moving,
        rooms.filter((rm) => rm.id !== active.id).map(sheetOutline),
        active.thickness,
      );
      next = [next[0] + pull.dx, next[1] + pull.dy];
    }
    st.moveRoom(active.id, next);
  };
  const onRoomUp = () => {
    const c = carry.current;
    if (!c) return;
    carry.current = null;
    if (!c.moved) return;
    carried.current = true;
    st.moveRoom(active.id, activeOf(useRoom.getState()).pos, true);
  };
  const onEdgeSplit = (e: MouseEvent<SVGElement>, i: number) => {
    e.stopPropagation();
    const at = mmOf(e);
    if (at) r.setOutline(splitEdge(outline, i, snapped(local(at))));
  };
  /** a hinged leaf: the hinge at one jamb, the leaf standing into the
      room, the swing from its tip to the other jamb; a double door is
      two of these, hinged at each jamb */
  const leafOf = (e: Edge, hingeAt: number, leaf: number, into: 1 | -1) => {
    const hinge = { x: e.x + e.dx * hingeAt, y: e.y + e.dy * hingeAt };
    const tip = { x: hinge.x + e.nx * leaf, y: hinge.y + e.ny * leaf };
    const jamb = {
      x: hinge.x + e.dx * leaf * into,
      y: hinge.y + e.dy * leaf * into,
    };
    const cross = e.dx * e.ny - e.dy * e.nx;
    const sweep = (cross > 0 ? 1 : 0) ^ (into < 0 ? 1 : 0);
    return { hinge, tip, jamb, sweep, leaf };
  };
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

  /** a room's openings drawn on its walls: a window as the gap and its
      three lines; a door as the gap, its leaf and its swing (two for a
      double door); a sliding door as two panels past each other; a
      passage as the gap alone. With `grips`, each has its handles */
  const drawOpenings = (
    shell: ReturnType<typeof shellOf>,
    t: number,
    grips: boolean,
  ) =>
    shell.openings.map((o) => {
      const e = onEdge(shell, o);
      const half = o.width / 2;
      return (
        <g
          key={o.id}
          className="plan-opening-group"
          data-kind={o.kind}
          data-wall={o.wall}
        >
          <polygon
            points={bandRect(e, o.width, t, BAND_PAD)}
            className="plan-opening"
          />
          {o.kind === "window" &&
            [0, 0.5, 1].map((k) => (
              <line
                key={k}
                x1={e.x - e.dx * half - e.nx * k * t}
                y1={e.y - e.dy * half - e.ny * k * t}
                x2={e.x + e.dx * half - e.nx * k * t}
                y2={e.y + e.dy * half - e.ny * k * t}
                className="plan-line"
              />
            ))}
          {(o.kind === "door"
            ? [leafOf(e, -half, o.width, 1)]
            : o.kind === "double"
              ? [leafOf(e, -half, half, 1), leafOf(e, half, half, -1)]
              : []
          ).map((l, i) => (
            <g key={i}>
              <line
                x1={l.hinge.x}
                y1={l.hinge.y}
                x2={l.tip.x}
                y2={l.tip.y}
                className="plan-leaf"
              />
              <path
                d={`M ${l.tip.x} ${l.tip.y} A ${l.leaf} ${l.leaf} 0 0 ${l.sweep} ${l.jamb.x} ${l.jamb.y}`}
                className="plan-swing"
              />
            </g>
          ))}
          {o.kind === "sliding" &&
            [-1, 1].map((k) => (
              <line
                key={k}
                x1={e.x + e.dx * (k === -1 ? -half : 0) + e.nx * k * 40}
                y1={e.y + e.dy * (k === -1 ? -half : 0) + e.ny * k * 40}
                x2={e.x + e.dx * (k === -1 ? 0 : half) + e.nx * k * 40}
                y2={e.y + e.dy * (k === -1 ? 0 : half) + e.ny * k * 40}
                className="plan-leaf"
              />
            ))}
          {grips && (
            <g className="plan-grips">
              <polygon
                points={bandRect(e, o.width, t, GRIP_PAD)}
                className="plan-grip"
                role="button"
                aria-label={`Move the ${o.kind} along its wall`}
                onPointerDown={(ev) => onGripDown(ev, o, "move")}
                onPointerMove={(ev) => onGripMove(ev, o)}
                onPointerUp={() => onGripUp(o)}
                onPointerCancel={() => onGripUp(o)}
                onClick={(ev) => ev.stopPropagation()}
              />
              {(["a", "b"] as const).map((end) => {
                const k = end === "a" ? -1 : 1;
                return (
                  <circle
                    key={end}
                    cx={e.x + e.dx * k * half}
                    cy={e.y + e.dy * k * half}
                    r={110}
                    className="plan-grip-end"
                    role="button"
                    aria-label={`Pull the ${o.kind}'s ${end === "a" ? "first" : "second"} end`}
                    onPointerDown={(ev) => onGripDown(ev, o, end)}
                    onPointerMove={(ev) => onGripMove(ev, o)}
                    onPointerUp={() => onGripUp(o)}
                    onPointerCancel={() => onGripUp(o)}
                    onClick={(ev) => ev.stopPropagation()}
                  />
                );
              })}
              <text
                x={e.x + e.nx * LABEL_IN}
                y={e.y + e.ny * LABEL_IN}
                className="plan-grip-label f-num"
              >
                {o.width}
              </text>
            </g>
          )}
        </g>
      );
    });

  return (
    <div
      ref={sheetRef}
      className="plan"
      data-zoomed={planZoom !== 1 || planPan.x !== 0 || planPan.y !== 0}
      data-pan={canPan ? (panning ? "moving" : "ready") : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        aspectRatio: `${vw} / ${vh}`,
        ["--ratio" as string]: vw / vh,
        ...(interactive
          ? {
              transform: `translate(${planPan.x}px, ${planPan.y}px) scale(${planZoom})`,
            }
          : {}),
      }}
    >
      <svg
        ref={svgRef}
        className="plan-svg"
        data-drawing={drawingOn}
        data-measuring={measuring}
        data-touring={touring}
        viewBox={`${box.x - MARGIN} ${box.y - MARGIN} ${vw} ${vh}`}
        aria-label={`Plan of the ${ROOM_NAMES[r.room]}, ${W} by ${D} millimetres`}
        onClick={onPlanClick}
        onMouseMove={onPlanMove}
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

        {/* the other rooms of the flat, faint, each a click away from
            being the active one; its name sits on its floor */}
        {rooms
          .filter((rm) => rm.id !== active.id)
          .map((rm) => {
            const shell = shellOf(rm);
            const pts = shell.outline.map((p) => p.join(",")).join(" ");
            return (
              <g
                key={rm.id}
                className="plan-room"
                data-active="false"
                data-room={rm.id}
                transform={`translate(${rm.pos[0]} ${rm.pos[1]})`}
              >
                <polygon
                  points={pts}
                  className="plan-floor"
                  role={interactive ? "button" : undefined}
                  aria-label={
                    interactive
                      ? `Work on the ${roomLabel(rooms, rm)}`
                      : undefined
                  }
                  onClick={(ev) => {
                    if (!interactive || drawingOn || measuring || touring)
                      return;
                    ev.stopPropagation();
                    st.setActive(rm.id);
                  }}
                />
                <Band outline={shell.outline} t={rm.thickness} />
                {drawOpenings(shell, rm.thickness, false)}
                <text
                  className="plan-room-name"
                  x={rm.width / 2}
                  y={rm.depth / 2}
                >
                  {roomLabel(rooms, rm).toUpperCase()}
                </text>
              </g>
            );
          })}
        <g
          className="plan-room"
          data-active="true"
          data-room={active.id}
          transform={`translate(${pos[0]} ${pos[1]})`}
        >
          {/* the floor; then the band along the outline: its faces as a wide
            heavy stroke, the hatch over all but the face lines */}
          <polygon
            points={poly}
            className="plan-floor"
            data-carries={handles}
            role={handles ? "button" : undefined}
            aria-label={handles ? "Move the room" : undefined}
            onPointerDown={onRoomDown}
            onPointerMove={onRoomMove}
            onPointerUp={onRoomUp}
            onPointerCancel={onRoomUp}
          />
          <Band outline={outline} t={active.thickness} />

          {/* the room's own handles, with the Wall tool, under the openings so
            their grips stay in reach: a bar on each wall
            and a square on each corner, the wall's length beside it */}
          {handles && (
            <g className="plan-shape">
              {outline.map((_, i) => {
                const f = edgeFrame(outline, i);
                const wall = edges[i]!.wall;
                const horizontal = wall === "north" || wall === "south";
                // the bar sits in the longest run of the wall with no
                // opening in it, so the openings' own grips stay in reach
                const lo = Math.min(
                  horizontal ? f.a[0] : f.a[1],
                  horizontal ? f.b[0] : f.b[1],
                );
                const hi = lo + f.len;
                const across = horizontal ? f.a[1] : f.a[0];
                const taken = opening.openings
                  .map((o) => ({ o, c: openingCentre(opening, o) }))
                  .filter(({ c }) => c.at === across)
                  .map(
                    ({ o, c }) =>
                      [c.centre - o.width / 2, c.centre + o.width / 2] as const,
                  )
                  .sort((p, q) => p[0] - q[0]);
                let run: readonly [number, number] = [lo, lo];
                let from = lo;
                for (const [p, q] of [...taken, [hi, hi] as const]) {
                  if (p - from > run[1] - run[0]) run = [from, p];
                  from = Math.max(from, q);
                }
                const len = Math.max(
                  BAR.min,
                  Math.min(BAR.max, (run[1] - run[0]) * BAR.share),
                );
                const mid = (run[0] + run[1]) / 2;
                const mx = horizontal ? mid : across;
                const my = horizontal ? across : mid;
                const angle = (Math.atan2(f.uy, f.ux) * 180) / Math.PI;
                return (
                  <g
                    key={`e${i}`}
                    transform={`translate(${mx} ${my}) rotate(${angle})`}
                  >
                    <rect
                      x={-len / 2}
                      // on the band: its local y runs inward or outward
                      // with the outline's turn
                      y={f.nx * -f.uy + f.ny * f.ux > 0 ? -active.thickness : 0}
                      width={len}
                      height={active.thickness}
                      rx={60}
                      className="plan-shape-edge"
                      data-across={horizontal ? "ns" : "ew"}
                      role="button"
                      aria-label={`Move wall ${i + 1}`}
                      onPointerDown={(ev) => onShapeDown(ev, "edge", i)}
                      onPointerMove={onShapeMove}
                      onPointerUp={onShapeUp}
                      onPointerCancel={onShapeUp}
                      onClick={(ev) => ev.stopPropagation()}
                      onDoubleClick={(ev) => onEdgeSplit(ev, i)}
                    />
                    {len >= BAR.labelled && (
                      <text
                        className="plan-shape-len f-num"
                        // read from below or from the right, as a drawing has it
                        transform={
                          angle >= 90 || angle < -90 ? "rotate(180)" : undefined
                        }
                      >
                        {Math.round(f.len)}
                      </text>
                    )}
                  </g>
                );
              })}
              {outline.map(([x, y], i) => (
                <rect
                  key={`c${i}`}
                  x={x - CORNER / 2}
                  y={y - CORNER / 2}
                  width={CORNER}
                  height={CORNER}
                  className="plan-shape-corner"
                  role="button"
                  aria-label={`Move corner ${i + 1}`}
                  onPointerDown={(ev) => onShapeDown(ev, "corner", i)}
                  onPointerMove={onShapeMove}
                  onPointerUp={onShapeUp}
                  onPointerCancel={onShapeUp}
                  onClick={(ev) => ev.stopPropagation()}
                />
              ))}
            </g>
          )}
          {drawOpenings(opening, active.thickness, grips)}

          {dim([0, 0], [W, 0], `${W}`, [0, -1])}
          {dim([0, D], [0, 0], `${D}`, [-1, 0])}

          {/* the north arrow, top right of the sheet */}
          <g
            className="plan-north"
            transform={`translate(${box.x + box.w - pos[0] + MARGIN * 0.55} ${box.y - pos[1] - MARGIN * 0.6})`}
          >
            <circle r={180} />
            <path d="M0 -150 L75 70 L0 25 L-75 70 Z" />
            <text y={300}>N</text>
          </g>

          {/* the title block, bottom left of the sheet, as a drawing has it */}
          <g
            className="plan-title"
            transform={`translate(${box.x - pos[0] - MARGIN * 0.9} ${box.y + box.h - pos[1] + MARGIN * 0.4})`}
          >
            <rect x="0" y="0" width={Math.min(W * 0.62, 3600)} height={420} />
            <text x={110} y={165}>
              {ROOM_NAMES[r.room].toUpperCase()} · {r.flat.toUpperCase()} HDB
            </text>
            <text x={110} y={335} className="plan-title-sub">
              PLAN · 1:50 · MM · CEILING {r.height} · {r.floor.toUpperCase()}
            </text>
          </g>

          {/* the door's swing and the window's light, while something stands in them */}
          {doorBlocked &&
            zones.doors.map((d, i) => (
              <rect
                key={`d${i}`}
                className="plan-zone"
                x={d.zone.x}
                y={d.zone.y}
                width={d.zone.w}
                height={d.zone.d}
              />
            ))}
          {windowBlocked &&
            zones.windows.map((w, i) => (
              <rect
                key={`w${i}`}
                className="plan-zone"
                x={w.zone.x}
                y={w.zone.y}
                width={w.zone.w}
                height={w.zone.d}
              />
            ))}
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
        {(touring || stops.length > 0) && (
          <g className="plan-tour" data-on={touring}>
            <polyline
              points={stops.map((p) => p.join(",")).join(" ")}
              className="plan-tour-line"
            />
            {stops.map(([x, y], i) => (
              <g
                key={i}
                className="plan-stop"
                role={touring ? "button" : undefined}
                aria-label={touring ? `Take away stop ${i + 1}` : undefined}
                tabIndex={touring ? 0 : undefined}
                onClick={(e) => {
                  if (!touring) return;
                  e.stopPropagation();
                  r.removeStop(i);
                }}
                onKeyDown={(e) => {
                  if (touring && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    r.removeStop(i);
                  }
                }}
              >
                <circle cx={x} cy={y} r={130} />
                <text x={x} y={y} dy={55}>
                  {i + 1}
                </text>
              </g>
            ))}
          </g>
        )}
        {measuring && a && (
          <g className="plan-measure" data-set={measure.to !== null}>
            <circle cx={a[0]} cy={a[1]} r={45} />
            {b && (
              <>
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
                <circle cx={b[0]} cy={b[1]} r={45} />
                <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2} dy={-110}>
                  {length} mm
                  {slant
                    ? ` · ${Math.abs(b[0] - a[0])} × ${Math.abs(b[1] - a[1])}`
                    : ""}
                </text>
              </>
            )}
          </g>
        )}
      </svg>
      {/* the pieces of each room, laid over the room's own box */}
      {rooms.map((rm) => (
        <div
          key={rm.id}
          className="plan-pieces"
          data-room={rm.id}
          data-active={rm.id === active.id}
          style={{
            left: `${((rm.pos[0] - box.x + MARGIN) / vw) * 100}%`,
            top: `${((rm.pos[1] - box.y + MARGIN) / vh) * 100}%`,
            width: `${(rm.width / vw) * 100}%`,
            height: `${(rm.depth / vh) * 100}%`,
          }}
        >
          <StagePieces roomId={rm.id} compact={!interactive} />
        </div>
      ))}
    </div>
  );
}
