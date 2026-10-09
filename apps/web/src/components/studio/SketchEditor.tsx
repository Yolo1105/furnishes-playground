"use client";

import {
  type Sketch,
  type SketchConstraint,
  type SketchSolve,
  freeDof,
} from "@furnishes/domain";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { solveSketchFull } from "./part-client";
import {
  addArc,
  addCircle,
  addLine,
  addRectangleHole,
  constrain,
  dimension,
  type Hit,
  hitAt,
  linesOf,
  type Pt,
  remove,
  setDimension,
  snap,
} from "./sketch-edit";

/**
 * The sketcher: a panel's profile drawn and held. The outline, the
 * holes, the free lines, arcs and circles in millimetres on a sheet
 * that pans and zooms, with tools to draw a line, a rectangle (a
 * hole), a circle, an arc, to lay a dimension and to hold things to
 * each other (level, upright, coincident, parallel, square, equal,
 * tangent, fixed, symmetric, on a line); every change solved in the
 * worker a moment later, the header saying how much freedom is left
 * (none: fully held, drawn in ink; some: blue; constraints that fight
 * or repeat: red, named), undo and redo, Done to hand the profile
 * back. Snaps to points, midpoints and to level or upright with the
 * last point, said as it does.
 */
type Tool = "select" | "line" | "rectangle" | "circle" | "arc" | "dimension";
type Hold =
  | "horizontal"
  | "vertical"
  | "coincident"
  | "parallel"
  | "perpendicular"
  | "equal"
  | "tangent"
  | "fix"
  | "symmetric"
  | "pointOnLine";
const TOOLS: [Tool, string, string][] = [
  ["select", "Select", "Pick, drag a point, pan"],
  ["line", "Line", "Click the start, then each end; Esc ends"],
  ["rectangle", "Rectangle", "Two corners of a hole"],
  ["circle", "Circle", "The centre, then the rim"],
  ["arc", "Arc", "The centre, the start, then the end"],
  ["dimension", "Dimension", "Two points, a line, a curve, or two lines"],
];
const HOLDS: [Hold, string, string][] = [
  ["horizontal", "Level", "a line, or two points"],
  ["vertical", "Upright", "a line, or two points"],
  ["coincident", "Coincident", "two points"],
  ["parallel", "Parallel", "two lines"],
  ["perpendicular", "Square", "two lines"],
  ["equal", "Equal", "two lines, or two curves"],
  ["tangent", "Tangent", "a line and a curve"],
  ["fix", "Fix", "a point"],
  ["symmetric", "Symmetric", "two points and a line"],
  ["pointOnLine", "On line", "a point and a line"],
];
/** how near the pointer must come, px */
const REACH_PX = 9;
/** the sheet's margin round the sketch when fitted, as a share */
const FIT_MARGIN = 0.12;
/** how long after a change the solver is asked, ms */
const SOLVE_MS = 120;
/** the steps the undo stack keeps */
const HISTORY = 100;

type View = { k: number; tx: number; ty: number };
const toMm = (v: View, px: number, py: number): Pt => ({
  x: (px - v.tx) / v.k,
  y: -(py - v.ty) / v.k,
});

/** the sheet scaled and placed so the sketch fills the canvas */
const fitTo = (s: Sketch, w: number, h: number): View => {
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  const x0 = Math.min(...xs, 0);
  const x1 = Math.max(...xs, 1);
  const y0 = Math.min(...ys, 0);
  const y1 = Math.max(...ys, 1);
  const k = Math.min(
    (w * (1 - 2 * FIT_MARGIN)) / (x1 - x0 || 1),
    (h * (1 - 2 * FIT_MARGIN)) / (y1 - y0 || 1),
  );
  return {
    k,
    tx: w / 2 - ((x0 + x1) / 2) * k,
    ty: h / 2 + ((y0 + y1) / 2) * k,
  };
};

/** which ids a constraint names */
const namedBy = (c: SketchConstraint) =>
  Object.entries(c)
    .filter(
      ([k, v]) =>
        k !== "id" && k !== "kind" && k !== "name" && typeof v === "string",
    )
    .map(([, v]) => v as string);

export function SketchEditor({
  sketch: given,
  name,
  onDone,
  onClose,
}: {
  sketch: Sketch;
  name: string;
  onDone: (s: Sketch) => void;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<Sketch[]>([given]);
  const [index, setIndex] = useState(0);
  const sketch = history[index]!;
  const [tool, setTool] = useState<Tool>("select");
  const [picked, setPicked] = useState<Exclude<Hit, null>[]>([]);
  const [hover, setHover] = useState<Hit>(null);
  const [stroke, setStroke] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [snapped, setSnapped] = useState<string | null>(null);
  const [solve, setSolve] = useState<SketchSolve | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [dim, setDim] = useState<{ id: string; value: string } | null>(null);
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string } | { pan: Pt; from: View } | null>(null);
  const solving = useRef(0);

  // the sheet fitted once the canvas has its size
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setView(fitTo(given, r.width, r.height));
  }, [given]);

  /** a change kept: the stack cut at the present, the new state on */
  const change = (next: Sketch) => {
    setHistory((h) => [...h.slice(0, index + 1), next].slice(-HISTORY));
    setIndex((i) => Math.min(i + 1, HISTORY - 1));
  };
  /** the solved points taken into the present state, not as a step */
  const settle = (solved: Sketch) =>
    setHistory((h) => h.map((s, i) => (i === index ? solved : s)));

  // every change solved a moment later, stale answers dropped
  useEffect(() => {
    const n = ++solving.current;
    const id = window.setTimeout(() => {
      void solveSketchFull(sketch).then((r) => {
        if (n !== solving.current) return;
        setSolve(r);
        if (r.ok && JSON.stringify(r.sketch) !== JSON.stringify(sketch))
          settle(r.sketch);
      });
    }, SOLVE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketch]);

  const reach = () => REACH_PX / view.k;
  const place = (e: ReactPointerEvent<SVGSVGElement>): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return toMm(view, e.clientX - r.left, e.clientY - r.top);
  };
  const pointAt = (id: string) => sketch.points.find((p) => p.id === id)!;
  const conflicting = new Set(solve?.conflicting ?? []);
  const redundant = new Set(solve?.redundant ?? []);
  const troubled = new Set(
    sketch.constraints
      .filter((c) => conflicting.has(c.id) || redundant.has(c.id))
      .flatMap(namedBy),
  );
  const held = (solve?.dof ?? freeDof(sketch)) === 0;
  const isPicked = (h: Exclude<Hit, null>) =>
    picked.some((p) => p.kind === h.kind && p.id === h.id);

  const pick = (h: Exclude<Hit, null>, add: boolean) =>
    setPicked((ps) =>
      isPicked(h)
        ? ps.filter((p) => !(p.kind === h.kind && p.id === h.id))
        : add
          ? [...ps, h]
          : [h],
    );

  const hold = (kind: Hold) => {
    const next = constrain(sketch, kind, picked);
    if (!next) {
      setHint(
        `${HOLDS.find((h) => h[0] === kind)![1]} needs ${HOLDS.find((h) => h[0] === kind)![2]}.`,
      );
      return;
    }
    setHint(null);
    change(next);
    setPicked([]);
  };
  const measure = (picks: Exclude<Hit, null>[]) => {
    const made = dimension(sketch, picks);
    if (!made) return false;
    change(made[0]);
    const c = made[0].constraints.find((x) => x.id === made[1])!;
    setDim({
      id: made[1],
      value: String(c.kind === "angle" ? c.deg : "mm" in c ? c.mm : 0),
    });
    setPicked([]);
    return true;
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = place(e);
    const hit = hitAt(sketch, p, reach());
    svg.current!.setPointerCapture(e.pointerId);
    setHint(null);
    if (tool === "select") {
      if (hit) {
        pick(hit, e.shiftKey);
        if (
          hit.kind === "point" &&
          !sketch.points.find((q) => q.id === hit.id)!.fixed
        )
          drag.current = { id: hit.id };
      } else {
        if (!e.shiftKey) setPicked([]);
        drag.current = { pan: { x: e.clientX, y: e.clientY }, from: view };
      }
      return;
    }
    if (tool === "dimension") {
      if (!hit) return;
      const picks = [
        ...picked.filter((q) => !(q.kind === hit.kind && q.id === hit.id)),
        hit,
      ];
      if (!measure(picks)) setPicked(picks);
      return;
    }
    const last = stroke.at(-1) ?? null;
    const s = snap(sketch, p, reach(), last);
    setSnapped(s.to);
    const at = s.at;
    if (tool === "line") {
      if (!last) return setStroke([at]);
      const [next] = addLine(sketch, lastId(last) ?? last, s.id ?? at);
      change(next);
      setStroke([at]);
      return;
    }
    if (tool === "rectangle") {
      if (!last) return setStroke([at]);
      change(addRectangleHole(sketch, last, at)[0]);
      setStroke([]);
      return;
    }
    if (tool === "circle") {
      if (!last) return setStroke([at]);
      change(addCircle(sketch, last, at)[0]);
      setStroke([]);
      return;
    }
    if (tool === "arc") {
      if (stroke.length < 2) return setStroke([...stroke, at]);
      change(addArc(sketch, stroke[0]!, stroke[1]!, at)[0]);
      setStroke([]);
    }
  };
  /** the id of the sketch's point at a place, when a stroke began on one */
  const lastId = (p: Pt) =>
    sketch.points.find((q) => q.x === p.x && q.y === p.y)?.id;

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = place(e);
    setCursor(p);
    const d = drag.current;
    if (d && "id" in d) {
      settle({
        ...sketch,
        points: sketch.points.map((q) =>
          q.id === d.id ? { ...q, x: p.x, y: p.y } : q,
        ),
      });
      return;
    }
    if (d && "pan" in d) {
      setView({
        ...d.from,
        tx: d.from.tx + (e.clientX - d.pan.x),
        ty: d.from.ty + (e.clientY - d.pan.y),
      });
      return;
    }
    setHover(hitAt(sketch, p, reach()));
    if (tool !== "select" && tool !== "dimension") {
      const s = snap(sketch, p, reach(), stroke.at(-1) ?? null);
      setSnapped(s.to);
    }
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    svg.current?.releasePointerCapture(e.pointerId);
    if (d && "id" in d) change(sketch);
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => ({
      k: v.k * f,
      tx: px - (px - v.tx) * f,
      ty: py - (py - v.ty) * f,
    }));
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Escape") {
      if (stroke.length) setStroke([]);
      else if (tool !== "select") setTool("select");
      else onClose();
      e.preventDefault();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      let next = sketch;
      for (const h of picked) next = remove(next, h);
      if (next !== sketch) change(next);
      setPicked([]);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) setIndex((i) => Math.min(history.length - 1, i + 1));
      else setIndex((i) => Math.max(0, i - 1));
      e.preventDefault();
    }
  };
  const dimValue = (id: string) => {
    const c = sketch.constraints.find((x) => x.id === id)!;
    return c.kind === "angle" ? `${c.deg}°` : "mm" in c ? `${c.mm} mm` : "";
  };
  const applyDim = () => {
    if (!dim) return;
    const v = Number(dim.value);
    if (Number.isFinite(v) && v > 0)
      change(setDimension(sketch, dim.id, Math.round(v)));
    setDim(null);
  };

  const r = reach();
  const k = view.k;
  const colour = (ids: string[], base: string) =>
    ids.some((id) => troubled.has(id)) ? "var(--color-danger)" : base;
  const inkOrFree = held ? "var(--color-ink)" : "var(--sketch-free)";
  // a distance's label sits a little off its edge, on the side away
  // from the sketch's middle, so it never straddles the line
  const middle = (() => {
    const pts = sketch.loop.map(pointAt);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  })();
  const mid = (a: string, b: string) => {
    const p = pointAt(a);
    const q = pointAt(b);
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    let nx = -(q.y - p.y) / len;
    let ny = (q.x - p.x) / len;
    if ((m.x - middle.x) * nx + (m.y - middle.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const off = 14 / k;
    return { x: m.x + nx * off, y: m.y + ny * off };
  };
  const loopPath = (loop: string[]) =>
    loop
      .map((id, i) => `${i ? "L" : "M"}${pointAt(id).x} ${pointAt(id).y}`)
      .join(" ") + " Z";
  const dofText = solve
    ? solve.dof === 0
      ? "fully held"
      : `${solve.dof} degree${solve.dof === 1 ? "" : "s"} of freedom`
    : "solving…";

  const body = (
    <div
      className="shell-dialog sketch-dialog"
      role="dialog"
      aria-label={`Sketch of ${name}`}
      onKeyDown={onKey}
    >
      <div className="shell-dialog-scrim" onClick={onClose} />
      <div className="glass sketch-card">
        <header className="sketch-head">
          <p className="sketch-title">
            Sketch · {name}
            <span
              className="sketch-dof"
              data-held={held}
              data-trouble={conflicting.size > 0}
            >
              {dofText}
              {conflicting.size > 0 &&
                ` · fighting: ${[...conflicting].join(", ")}`}
              {redundant.size > 0 &&
                ` · repeating: ${[...redundant].join(", ")}`}
            </span>
          </p>
          <div className="sketch-acts">
            <button
              type="button"
              className="main-btn"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label="Undo sketch step"
            >
              Undo
            </button>
            <button
              type="button"
              className="main-btn"
              onClick={() =>
                setIndex((i) => Math.min(history.length - 1, i + 1))
              }
              disabled={index === history.length - 1}
              aria-label="Redo sketch step"
            >
              Redo
            </button>
            <button type="button" className="main-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="main-btn main-btn-accent"
              onClick={() => onDone(sketch)}
            >
              Done
            </button>
          </div>
        </header>
        <div className="sketch-body">
          <div
            className="sketch-tools"
            role="toolbar"
            aria-label="Sketch tools"
          >
            <p className="dev-panel-title">Draw</p>
            {TOOLS.map(([id, label, tip]) => (
              <button
                key={id}
                type="button"
                className="main-btn"
                aria-pressed={tool === id}
                title={tip}
                onClick={() => {
                  setTool(id);
                  setStroke([]);
                  setHint(tip);
                }}
              >
                {label}
              </button>
            ))}
            <p className="dev-panel-title">Hold</p>
            {HOLDS.map(([id, label, tip]) => (
              <button
                key={id}
                type="button"
                className="main-btn"
                title={`${label}: ${tip}`}
                onClick={() => hold(id)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="main-btn"
              onClick={() => {
                let next = sketch;
                for (const h of picked) next = remove(next, h);
                if (next !== sketch) change(next);
                setPicked([]);
              }}
              disabled={!picked.length}
            >
              Delete
            </button>
          </div>
          <svg
            ref={svg}
            className="sketch-canvas"
            data-tool={tool}
            data-snap={snapped ?? ""}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={onWheel}
          >
            <g transform={`translate(${view.tx} ${view.ty}) scale(${k} ${-k})`}>
              <path
                d={loopPath(sketch.loop)}
                className="sketch-outline"
                style={{ stroke: inkOrFree, strokeWidth: 1.5 / k }}
              />
              {(sketch.holes ?? []).map((h, i) => (
                <path
                  key={i}
                  d={loopPath(h)}
                  className="sketch-hole"
                  style={{ stroke: colour(h, inkOrFree), strokeWidth: 1.2 / k }}
                />
              ))}
              {linesOf(sketch).map(([id, a, b]) => (
                <line
                  key={id}
                  x1={pointAt(a).x}
                  y1={pointAt(a).y}
                  x2={pointAt(b).x}
                  y2={pointAt(b).y}
                  className="sketch-line"
                  data-picked={isPicked({ kind: "line", id })}
                  data-hover={hover?.kind === "line" && hover.id === id}
                  style={{
                    stroke: colour([id, a, b], inkOrFree),
                    strokeWidth: (isPicked({ kind: "line", id }) ? 3 : 1.2) / k,
                  }}
                />
              ))}
              {(sketch.geometry ?? []).map((g) => {
                if (g.kind === "line") return null;
                const c = pointAt(g.centre);
                if (g.kind === "circle")
                  return (
                    <circle
                      key={g.id}
                      cx={c.x}
                      cy={c.y}
                      r={g.radius}
                      className="sketch-curve"
                      data-picked={isPicked({ kind: "curve", id: g.id })}
                      style={{
                        stroke: colour([g.id, g.centre], inkOrFree),
                        strokeWidth:
                          (isPicked({ kind: "curve", id: g.id }) ? 3 : 1.2) / k,
                      }}
                    />
                  );
                const s = pointAt(g.start);
                const e = pointAt(g.end);
                const rad = Math.hypot(s.x - c.x, s.y - c.y);
                const a0 = Math.atan2(s.y - c.y, s.x - c.x);
                const a1 = Math.atan2(e.y - c.y, e.x - c.x);
                const sweep =
                  (((a1 - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                return (
                  <path
                    key={g.id}
                    d={`M${s.x} ${s.y} A${rad} ${rad} 0 ${sweep > Math.PI ? 1 : 0} 1 ${e.x} ${e.y}`}
                    className="sketch-curve"
                    data-picked={isPicked({ kind: "curve", id: g.id })}
                    style={{
                      stroke: colour(
                        [g.id, g.centre, g.start, g.end],
                        inkOrFree,
                      ),
                      strokeWidth:
                        (isPicked({ kind: "curve", id: g.id }) ? 3 : 1.2) / k,
                    }}
                  />
                );
              })}
              {stroke.length > 0 && cursor && (
                <line
                  x1={stroke.at(-1)!.x}
                  y1={stroke.at(-1)!.y}
                  x2={cursor.x}
                  y2={cursor.y}
                  className="sketch-stroke"
                  style={{ strokeWidth: 1 / k }}
                />
              )}
              {sketch.points.map((p) => (
                <circle
                  key={p.id}
                  cx={p.x}
                  cy={p.y}
                  r={(isPicked({ kind: "point", id: p.id }) ? 5 : 3.5) / k}
                  className="sketch-point"
                  data-fixed={
                    p.fixed ||
                    sketch.constraints.some(
                      (c) => c.kind === "fix" && c.p === p.id,
                    )
                  }
                  data-picked={isPicked({ kind: "point", id: p.id })}
                  data-hover={hover?.kind === "point" && hover.id === p.id}
                  style={{ fill: colour([p.id], inkOrFree) }}
                />
              ))}
              {/* a figure opens its box on the click, not the press: the
                  press would focus the sheet and blur the box at once */}
              {sketch.constraints.map((c) => {
                if (c.kind === "distance") {
                  const m = mid(c.a, c.b);
                  return (
                    <text
                      key={c.id}
                      x={m.x}
                      y={m.y}
                      transform={`translate(${m.x} ${m.y}) scale(1 -1) translate(${-m.x} ${-m.y})`}
                      className="sketch-dim"
                      data-trouble={
                        troubled.has(c.a) &&
                        (conflicting.has(c.id) || redundant.has(c.id))
                      }
                      style={{ fontSize: 11 / k }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setDim({ id: c.id, value: String(c.mm) })}
                    >
                      {c.name ? `${c.name} = ` : ""}
                      {c.mm}
                    </text>
                  );
                }
                if (c.kind === "radius" || c.kind === "diameter") {
                  const g = sketch.geometry?.find((x) => x.id === c.c);
                  if (!g || g.kind === "line") return null;
                  // the figure just past the rim, up and to the right,
                  // so the centre stays free to pick
                  const at = pointAt(g.centre);
                  const rad =
                    g.kind === "circle"
                      ? g.radius
                      : Math.hypot(
                          pointAt(g.start).x - at.x,
                          pointAt(g.start).y - at.y,
                        );
                  const out = (rad + 12 / k) * Math.SQRT1_2;
                  const ctr = { x: at.x + out, y: at.y + out };
                  return (
                    <text
                      key={c.id}
                      x={ctr.x}
                      y={ctr.y}
                      transform={`translate(${ctr.x} ${ctr.y}) scale(1 -1) translate(${-ctr.x} ${-ctr.y})`}
                      className="sketch-dim"
                      style={{ fontSize: 11 / k }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => setDim({ id: c.id, value: String(c.mm) })}
                    >
                      {c.kind === "radius" ? "R" : "Ø"}
                      {c.mm}
                    </text>
                  );
                }
                return null;
              })}
            </g>
            {r > 0 && cursor && stroke.length > 0 && (
              <text x={8} y={16} className="sketch-note">
                {tool} · {Math.round(cursor.x)}, {Math.round(cursor.y)} mm
                {snapped ? ` · ${snapped}` : ""}
              </text>
            )}
          </svg>
        </div>
        <footer className="sketch-foot">
          {dim ? (
            <label className="sketch-dim-edit">
              <span>
                {sketch.constraints.find((c) => c.id === dim.id)?.name ??
                  dim.id}
              </span>
              <input
                className="dev-panel-input"
                aria-label="Dimension value"
                autoFocus
                value={dim.value}
                onChange={(e) => setDim({ id: dim.id, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyDim();
                  if (e.key === "Escape") setDim(null);
                }}
                onBlur={applyDim}
              />
              <span>{dimValue(dim.id).replace(/[\d.]+ ?/, "")}</span>
            </label>
          ) : (
            <p className="sketch-hint">
              {hint ??
                (picked.length
                  ? `${picked.length} picked`
                  : "Pick a tool, or drag a point.")}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
  return typeof document === "undefined"
    ? null
    : createPortal(body, document.body);
}
