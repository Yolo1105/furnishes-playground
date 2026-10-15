"use client";

import {
  checkRecipe,
  DESIGN_RULES,
  designOf,
  panelRows,
  recipeFromWords,
  SHEET,
  type DesignRecipe,
} from "@furnishes/domain";
import { useMemo, useState } from "react";
import { sgd } from "./assets-data";
import { PanelView } from "./PanelView";
import { COLOURS, colourHex } from "./piece-detail";
import { roomLabel, useRoom } from "./room-store";

/**
 * Design a piece (round 8, Part 3a): a few words become a recipe, by
 * Eva's `design_piece` tool when a model is connected (api/design-piece)
 * and by the studio's own reading of the words when not. The recipe is
 * drawn first in 2D, front, side and plan, from the very panels the 3D
 * piece is built of, with its price, its cut list and anything it
 * breaks; its size, bays, shelves, doors, drawers, plinth and finish can
 * be changed here, and Place puts it in the room as a piece of panels.
 */
type Asked = {
  recipe: DesignRecipe;
  /** who read the words: Eva (with the repairs it took), or the rules,
      and why */
  by: "eva" | "rules";
  note: string;
};

/** why the studio read the words itself, by the route's answer */
const REASONS: Record<number, string> = {
  503: "No model is connected on this server, so the studio read your words by its own rules",
  429: "That is the hour's share of designs, so the studio read your words by its own rules",
  422: "Eva's recipes kept breaking the rules, so the studio read your words by its own rules",
};

export function DesignPane({
  onPlace,
}: {
  onPlace: (recipe: DesignRecipe) => void;
}) {
  const rooms = useRoom((s) => s.rooms);
  const activeId = useRoom((s) => s.activeId);
  const room = rooms.find((r) => r.id === activeId) ?? rooms[0];
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<Asked | null>(null);

  const ask = async () => {
    const text = words.trim();
    if (!text || busy) return;
    setBusy(true);
    const byRules = (why: string): Asked => ({
      recipe: recipeFromWords(text),
      by: "rules",
      note: `${why}.`,
    });
    let next: Asked;
    try {
      const res = await fetch("/api/design-piece", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          words: text,
          ...(room
            ? {
                room: {
                  name: roomLabel(rooms, room),
                  width: room.width,
                  depth: room.depth,
                },
              }
            : {}),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          recipe: DesignRecipe;
          repairs: number;
        };
        next = {
          recipe: data.recipe,
          by: "eva",
          note:
            data.repairs > 0
              ? `Eva's recipe, put right ${data.repairs === 1 ? "once" : `${data.repairs} times`} to keep the rules.`
              : "Eva's recipe.",
        };
      } else {
        // what Eva's last recipe still broke, when it never passed
        const said =
          res.status === 422
            ? ((await res.json().catch(() => ({}))) as { problems?: string[] })
                .problems
            : undefined;
        next = byRules(
          (REASONS[res.status] ??
            "Eva did not answer, so the studio read your words by its own rules") +
            (said?.length
              ? ` (Eva's could not be made: ${said.join("; ")})`
              : ""),
        );
      }
    } catch {
      next = byRules(
        "The server could not be reached, so the studio read your words by its own rules",
      );
    }
    setAsked(next);
    setBusy(false);
  };

  return (
    <div
      className="add-gen add-design"
      data-design-state={busy ? "asking" : asked ? "ready" : "empty"}
      data-design-by={asked?.by ?? "none"}
    >
      <form
        className="add-gen-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <input
          className="room-dim-input add-gen-input"
          value={words}
          placeholder="A 1.6 m low bookcase with two doors, oak…"
          aria-label="Describe a piece to design"
          maxLength={300}
          onChange={(e) => setWords(e.target.value)}
        />
        <button
          type="submit"
          className="main-btn main-btn-primary"
          disabled={busy || words.trim().length < 2}
          aria-busy={busy}
        >
          <span>{busy ? "Designing…" : "Design"}</span>
        </button>
      </form>
      <p className="add-gen-hint" role="status">
        {asked?.note ??
          "A Furnishes piece made to measure in 18 mm birch plywood: say what it is, how big, and its doors, drawers and finish."}
      </p>
      {asked && (
        <Designed
          // a new answer starts its own adjustments
          key={JSON.stringify(asked.recipe)}
          start={asked.recipe}
          onPlace={onPlace}
        />
      )}
    </div>
  );
}

/** a recipe drawn, priced, cut and open to change */
function Designed({
  start,
  onPlace,
}: {
  start: DesignRecipe;
  onPlace: (recipe: DesignRecipe) => void;
}) {
  const [r, setR] = useState(start);
  const problems = useMemo(() => checkRecipe(r), [r]);
  // a recipe that breaks a range is not drawn: its panels may not stand
  const made = useMemo(
    () => (problems.some((p) => p.field !== "panels") ? null : designOf(r)),
    [r, problems],
  );
  // fewer bays take the doors and drawers that no longer have one
  const set = (patch: Partial<DesignRecipe>) =>
    setR((x) => {
      const next = { ...x, ...patch };
      const doors = Math.min(next.doors, next.bays);
      return {
        ...next,
        doors,
        drawers: Math.min(next.drawers, next.bays - doors),
      };
    });
  const size = (field: "width" | "height" | "depth", label: string) => (
    <label className="design-field">
      <span>{label}</span>
      <input
        className="room-dim-input f-num"
        type="number"
        inputMode="numeric"
        step={10}
        min={DESIGN_RULES[field][0]}
        max={DESIGN_RULES[field][1]}
        value={r[field]}
        aria-label={`${label}, mm`}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value));
          if (Number.isFinite(v)) set({ [field]: v });
        }}
      />
    </label>
  );
  const count = (
    field: "bays" | "shelves" | "doors" | "drawers",
    label: string,
    lo: number,
    hi: number,
  ) => (
    <div className="design-field" role="group" aria-label={label}>
      <span>{label}</span>
      <span className="design-count">
        <button
          type="button"
          className="assets-chip"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={r[field] <= lo}
          onClick={() => set({ [field]: r[field] - 1 })}
        >
          −
        </button>
        <span className="f-num" aria-live="polite">
          {r[field]}
        </span>
        <button
          type="button"
          className="assets-chip"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={r[field] >= hi}
          onClick={() => set({ [field]: r[field] + 1 })}
        >
          +
        </button>
      </span>
    </div>
  );
  return (
    <div
      className="design-made"
      data-problems={problems.length}
      aria-label={`Designed: ${r.name}`}
    >
      <div className="add-gen-head">
        <span className="add-gen-label">
          {r.name} · {r.width} × {r.height} × {r.depth} mm
        </span>
        <span className="add-tile-price f-num">
          {made ? `${sgd(made.price)} · estimate` : "—"}
        </span>
      </div>
      {made && (
        <div className="design-views" aria-label="Front, side and plan">
          <PanelView
            panels={made.panels}
            view="front"
            colour={colourHex(r.finish)}
          />
          <PanelView
            panels={made.panels}
            view="side"
            colour={colourHex(r.finish)}
          />
          <PanelView
            panels={made.panels}
            view="plan"
            colour={colourHex(r.finish)}
          />
        </div>
      )}
      <div className="design-fields">
        {size("width", "Width")}
        {size("height", "Height")}
        {size("depth", "Depth")}
        {count("bays", "Bays", DESIGN_RULES.bays[0], DESIGN_RULES.bays[1])}
        {count(
          "shelves",
          "Shelves",
          DESIGN_RULES.shelves[0],
          DESIGN_RULES.shelves[1],
        )}
        {count("doors", "Doors", 0, r.bays - r.drawers)}
        {count("drawers", "Drawers", 0, r.bays - r.doors)}
        <label className="design-field design-check">
          <input
            type="checkbox"
            checked={r.plinth}
            onChange={(e) => set({ plinth: e.target.checked })}
          />
          <span>On a plinth</span>
        </label>
      </div>
      <div className="add-strip-chips" role="radiogroup" aria-label="Finish">
        {COLOURS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            className="assets-chip"
            aria-checked={r.finish === c.id}
            onClick={() => set({ finish: c.id })}
          >
            <span
              className="design-swatch"
              style={{ background: c.hex }}
              aria-hidden="true"
            />
            {c.name}
          </button>
        ))}
      </div>
      {problems.length > 0 && (
        <ul className="design-problems" aria-label="What it breaks">
          {problems.map((p) => (
            <li key={`${p.field}:${p.message}`}>{p.message}</li>
          ))}
        </ul>
      )}
      {made && (
        <details className="design-cut">
          <summary>
            Cut list: {made.panels.length} panels from {made.cut.sheets.length}{" "}
            sheet
            {made.cut.sheets.length === 1 ? "" : "s"} of {SHEET.length} ×{" "}
            {SHEET.width} mm
          </summary>
          <ul>
            {panelRows(made.panels).map((row) => (
              <li
                key={`${row.length}x${row.width}@${row.kind}`}
                className="f-num"
              >
                {row.quantity} × {row.length} × {row.width} mm ·{" "}
                {[...new Set(row.names)].join(", ").toLowerCase()}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="detail-acts">
        <button
          type="button"
          className="main-btn main-btn-primary"
          disabled={problems.length > 0}
          onClick={() => onPlace(r)}
        >
          <span>Place in the room</span>
        </button>
      </div>
    </div>
  );
}
