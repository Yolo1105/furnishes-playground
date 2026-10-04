import type { ReactNode } from "react";
import type { AssetNode } from "./assets-data";
import { isRug, type PieceProps } from "./piece-detail";

/**
 * A piece's symbol on the plan, as a drawing has it: a sofa with its
 * back, arms and cushions; storage with its bays and back, crossed when
 * it stands tall; a table on its legs; a cart on castors; a lamp as the
 * lighting mark, a circle with a cross; a plant as a pot in its
 * foliage; a rug as a bordered field; a bed with its pillows and fold;
 * a screen as a folded line. Drawn in the piece's own frame (its width
 * along x, its back at y = 0) and turned with the piece into the box
 * the plan gives it. Everything in the room's millimetres; the strokes
 * stay one pixel at any zoom.
 */
type Pt = [number, number];
type Map2 = (x: number, y: number) => Pt;

/** the piece's own frame turned a quarter at a time into its plan box */
const frameOf = (turn: number, w: number, d: number): Map2 => {
  const t = ((Math.round(turn / 90) % 4) + 4) % 4;
  if (t === 1) return (x, y) => [d - y, x];
  if (t === 2) return (x, y) => [w - x, d - y];
  if (t === 3) return (x, y) => [y, w - x];
  return (x, y) => [x, y];
};

const BACK = 200; // mm, a sofa's back
const ARM = 150; // mm, a sofa's arm
const CUSHION = 650; // mm, about one seat
const PANEL = 36; // mm, a back panel as the plan reads it
const LEG = 60; // mm, a table leg

export function PlanSymbol({
  node,
  props,
  turn,
}: {
  node: AssetNode;
  props: PieceProps;
  /** the quarter turn the plan box stands at (a free turn is on the box) */
  turn: number;
}) {
  const { width: w, depth: d, height: h } = props;
  const m = frameOf(turn, w, d);
  const square = turn % 180 === 0;
  const box: Pt = square ? [w, d] : [d, w];
  const name = node.name.toLowerCase();
  const cat = node.category;
  const parts: ReactNode[] = [];
  let k = 0;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    const a = m(x1, y1);
    const b = m(x2, y2);
    parts.push(<line key={k++} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />);
  };
  const rect = (x: number, y: number, rw: number, rd: number) => {
    const pts = [m(x, y), m(x + rw, y), m(x + rw, y + rd), m(x, y + rd)];
    parts.push(
      <polygon key={k++} points={pts.map((p) => p.join(",")).join(" ")} />,
    );
  };
  const circle = (cx: number, cy: number, r: number) => {
    const c = m(cx, cy);
    parts.push(<circle key={k++} cx={c[0]} cy={c[1]} r={r} />);
  };
  const cross = () => {
    line(0, 0, w, d);
    line(w, 0, 0, d);
  };
  const legs = () => {
    const in_ = 40;
    rect(in_, in_, LEG, LEG);
    rect(w - in_ - LEG, in_, LEG, LEG);
    rect(in_, d - in_ - LEG, LEG, LEG);
    rect(w - in_ - LEG, d - in_ - LEG, LEG, LEG);
  };
  const castors = () => {
    const in_ = 70;
    circle(in_, in_, 35);
    circle(w - in_, in_, 35);
    circle(in_, d - in_, 35);
    circle(w - in_, d - in_, 35);
  };
  const bays = (n: number) => {
    for (let i = 1; i < n; i++) line((w * i) / n, 0, (w * i) / n, d);
  };

  if (isRug(node)) {
    rect(70, 70, w - 140, d - 140);
  } else if (/\bbed\b/.test(name)) {
    rect(40, 40, w - 80, d - 80);
    const pw = (w - 200) / 2;
    rect(70, 90, pw, 260);
    rect(w - 70 - pw, 90, pw, 260);
    line(40, d * 0.42, w - 40, d * 0.42);
  } else if (/screen/.test(name)) {
    const folds = 3;
    for (let i = 0; i < folds; i++) {
      const x0 = (w * i) / folds;
      const x1 = (w * (i + 1)) / folds;
      line(x0, i % 2 ? d - 20 : 20, x1, i % 2 ? 20 : d - 20);
    }
  } else if (cat === "seating" && !/bench|stool/.test(name)) {
    const arm = Math.min(ARM, w * 0.12);
    const back = Math.min(BACK, d * 0.3);
    line(arm, back, w - arm, back);
    line(arm, 0, arm, d);
    line(w - arm, 0, w - arm, d);
    const seats = /armchair/.test(name)
      ? 1
      : Math.max(1, Math.round((w - 2 * arm) / CUSHION));
    for (let i = 1; i < seats; i++) {
      const x = arm + ((w - 2 * arm) * i) / seats;
      line(x, back, x, d);
    }
  } else if (/bench/.test(name)) {
    line(0, d / 2, w, d / 2);
    bays(Math.max(1, Math.round(w / 600)));
  } else if (cat === "storage" || /wardrobe|cabinet|shelf/.test(name)) {
    line(0, PANEL, w, PANEL);
    bays(node.children?.length || Math.max(1, Math.round(w / 600)));
    if (h > 1200) cross();
  } else if (/cart|trolley/.test(name)) {
    rect(50, 50, w - 100, d - 100);
    castors();
  } else if (cat === "tables") {
    legs();
  } else if (cat === "lighting") {
    const r = Math.min(w, d) / 2 - 20;
    circle(w / 2, d / 2, r);
    line(w / 2 - r, d / 2, w / 2 + r, d / 2);
    line(w / 2, d / 2 - r, w / 2, d / 2 + r);
  } else if (/plant/.test(name)) {
    const r = Math.min(w, d) / 2 - 10;
    circle(w / 2, d / 2, r * 0.45);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      line(
        w / 2 + Math.cos(a) * r * 0.55,
        d / 2 + Math.sin(a) * r * 0.55,
        w / 2 + Math.cos(a) * r,
        d / 2 + Math.sin(a) * r,
      );
    }
  } else if (/vase|pot\b|bowl/.test(name)) {
    const r = Math.min(w, d) / 2 - 10;
    circle(w / 2, d / 2, r);
    circle(w / 2, d / 2, r * 0.6);
  } else if (cat === "components") {
    line(0, d / 2, w, d / 2);
  }

  if (parts.length === 0) return null;
  return (
    <svg
      className="stage-piece-symbol"
      viewBox={`0 0 ${box[0]} ${box[1]}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {parts}
    </svg>
  );
}
