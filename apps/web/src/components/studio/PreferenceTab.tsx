"use client";

import { sgd } from "./assets-data";
import {
  BUDGET,
  FURNITURE,
  PREFERENCE_BLOCKS,
  ROOMS,
  STYLES,
  SWATCHES,
  type PreferenceCategory,
} from "./eva-data";
import { useEva } from "./eva-store";
import { CompassIcon } from "./icons";

/**
 * The five preference blocks of the playground's design, as controls:
 * pick the room, slide the budget, choose styles, colours and what the
 * room needs. A block Eva filled from the chat says so ("Chat"); one you
 * set says "You". Eva reads these on every turn, unless Exploration is
 * on: then she sets them aside and stays open to anything.
 */
export function PreferenceTab() {
  const prefs = useEva((s) => s.preferences);
  const toggle = useEva((s) => s.toggleValue);
  const setBudget = useEva((s) => s.setBudget);
  const clear = useEva((s) => s.clearPreference);
  const exploration = useEva((s) => s.exploration);
  const setExploration = useEva((s) => s.setExploration);

  const chips = (
    cat: PreferenceCategory,
    options: readonly string[],
    multi: boolean,
  ) => {
    const on = prefs[cat]?.values ?? [];
    return (
      <div className="eva-chips" role={multi ? "group" : "radiogroup"}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role={multi ? "checkbox" : "radio"}
            aria-checked={on.includes(o)}
            className="assets-chip"
            onClick={() => toggle(cat, o, multi)}
          >
            {o}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="eva-prefs" data-exploring={exploration}>
      <div className="eva-explore">
        <span className="eva-explore-icon" aria-hidden="true">
          <CompassIcon size={16} />
        </span>
        <span className="eva-explore-text">
          <b>Exploration</b>
          <span>
            {exploration
              ? "On: Eva sets these aside and stays open to anything."
              : "Off: Eva keeps to what is set here."}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          className="eva-switch"
          aria-checked={exploration}
          aria-label="Exploration"
          onClick={() => setExploration(!exploration)}
        >
          <span className="eva-switch-knob" aria-hidden="true" />
        </button>
      </div>
      {PREFERENCE_BLOCKS.map((b) => {
        const p = prefs[b.id];
        const set = p !== undefined;
        return (
          <section
            key={b.id}
            className="eva-pref"
            data-set={set}
            aria-labelledby={`pref-${b.id}`}
          >
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{b.index}</span>
              <span id={`pref-${b.id}`} className="eva-pref-title">
                {b.label}
              </span>
              {set && (
                <span
                  className="eva-pref-origin"
                  data-origin={p.origin}
                  title={
                    p.origin === "chat"
                      ? "Eva heard this in the chat and you confirmed it"
                      : "You set this"
                  }
                >
                  {p.origin === "chat" ? "Chat" : "You"}
                </span>
              )}
              {set && (
                <button
                  type="button"
                  className="eva-pref-clear"
                  onClick={() => clear(b.id)}
                >
                  Remove
                </button>
              )}
            </div>
            <p className="eva-pref-hint">
              {set && b.id === "budget" && p.budget !== undefined
                ? `${sgd(p.budget[0])} to ${sgd(p.budget[1])}`
                : set && b.id !== "budget"
                  ? p.values.join(" · ")
                  : b.hint}
            </p>

            {b.id === "room" && chips("room", ROOMS, false)}
            {b.id === "budget" && (
              <div className="eva-budget">
                {(
                  [
                    ["From", 0, p?.budget?.[0] ?? BUDGET.min],
                    ["To", 1, p?.budget?.[1] ?? BUDGET.max],
                  ] as const
                ).map(([label, i, value]) => (
                  <label key={label} className="eva-budget-field">
                    <span className="room-dim-label">{label}</span>
                    <span className="eva-budget-input">
                      <span className="eva-budget-unit">S$</span>
                      <input
                        type="number"
                        className="room-dim-input f-num"
                        inputMode="numeric"
                        min={0}
                        step={BUDGET.step}
                        value={value}
                        aria-label={`Budget ${label.toLowerCase()}, Singapore dollars`}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          const cur: [number, number] = p?.budget ?? [
                            BUDGET.min,
                            BUDGET.max,
                          ];
                          setBudget(i === 0 ? n : cur[0], i === 1 ? n : cur[1]);
                        }}
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
            {b.id === "style" && chips("style", STYLES, true)}
            {b.id === "color" && (
              <div className="eva-swatches" role="group">
                {SWATCHES.map((s) => {
                  const on = (p?.values ?? []).includes(s.name);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className="eva-swatch"
                      title={s.name}
                      aria-label={s.name}
                      onClick={() => toggle("color", s.name, true)}
                    >
                      <span
                        className="eva-swatch-dot"
                        style={{ background: s.hex }}
                        aria-hidden="true"
                      />
                      <span className="eva-swatch-name">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {b.id === "furniture" && chips("furniture", FURNITURE, true)}
          </section>
        );
      })}
    </div>
  );
}
