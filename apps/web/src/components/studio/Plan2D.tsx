"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { OPENINGS, ROOM_NAMES, type Wall } from "./room-data";
import { WALL_MM } from "./room-geometry";
import { usePieceActions } from "./piece-actions";
import { openingAt, zonesOf } from "./room-health";
import { CLOSE_WITHIN, footprintOf, useRoom } from "./room-store";
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
const WALL = WALL_MM / 2; // mm, half the band's thickness
const FACE = 14; // mm, the face line either side of the band
const MARGIN = 1100; // mm, room for the dimensions, the arrow, the title
const DOOR = OPENINGS.door.width;

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
  const vw = W + 2 * MARGIN;
  const vh = D + 2 * MARGIN;
  const outline = footprintOf(r);
  const poly = outline.map((p) => p.join(",")).join(" ");
  const drawingOn = interactive && tool === "wall";
  const measuring = interactive && tool === "measure";
  const touring = interactive && tool === "tour";
  const stops = useRoom((s) => s.stops);
  // the planner's zones show on the sheet while something stands in them
  const { issues } = usePieceActions();
  const opening = {
    W,
    D,
    outline,
    door: r.door,
    doorOffset: r.doorOffset,
    window: r.window,
    windowWidth: r.windowWidth,
  };
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
  const snapped = (p: [number, number]): [number, number] => [
    Math.round(p[0] / snap) * snap,
    Math.round(p[1] / snap) * snap,
  ];
  // a click on the sheet: a corner while drawing, an end while measuring
  const onPlanClick = (e: MouseEvent<SVGSVGElement>) => {
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

  const WINDOW = r.windowWidth;
  // the door sits along its wall by the HDB convention, the window in
  // the middle of its own
  const onEdge = (wall: Wall, width: number, offset: number | null): Edge => {
    const e = edgeOf(wall, W, D);
    const { centre, at } = openingAt(opening, wall, width, offset);
    const horizontal = wall === "north" || wall === "south";
    return {
      ...e,
      x: horizontal ? centre : at,
      y: horizontal ? at : centre,
    };
  };
  const door = onEdge(r.door, DOOR, r.doorOffset);
  const win = r.window ? onEdge(r.window, WINDOW, null) : null;
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
        viewBox={`${-MARGIN} ${-MARGIN} ${vw} ${vh}`}
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
        {win && (
          <>
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
          </>
        )}

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

        {/* the door's swing and the window's light, while something stands in them */}
        {doorBlocked && (
          <rect
            className="plan-zone"
            x={zones.door.x}
            y={zones.door.y}
            width={zones.door.w}
            height={zones.door.d}
          />
        )}
        {windowBlocked && zones.window && (
          <rect
            className="plan-zone"
            x={zones.window.x}
            y={zones.window.y}
            width={zones.window.w}
            height={zones.window.d}
          />
        )}
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
