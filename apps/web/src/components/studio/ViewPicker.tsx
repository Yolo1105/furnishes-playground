"use client";

import { useRef, useState } from "react";
import { ChevronDownIcon } from "./icons";
import { RadioMenu } from "./RadioMenu";
import { ANGLES, useStudio } from "./studio-store";
import { useDismiss } from "./useDismiss";

/**
 * How the view is looked at: in 3D a perspective or a side straight on,
 * in 2D the plan or an elevation, the way a CAD drawing is turned. The
 * chip names the current one; its menu lists the rest for the view on
 * the main surface. Rests while previewing.
 */
export function ViewPicker() {
  const view = useStudio((s) => s.view);
  const angle = useStudio((s) => s.angle);
  const mode = useStudio((s) => s.mode);
  const setAngle = useStudio((s) => s.setAngle);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useDismiss(wrap, open, () => setOpen(false));
  return (
    <div ref={wrap} className="view-picker">
      <button
        type="button"
        className="main-btn view-picker-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`View angle, ${angle}`}
        disabled={mode === "preview"}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{angle}</span>
        <ChevronDownIcon size={11} />
      </button>
      {open && (
        <RadioMenu
          className="view-picker-menu"
          options={ANGLES[view]}
          value={angle}
          onChange={(a) => {
            setAngle(a);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
