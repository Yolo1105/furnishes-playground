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
import { useState } from "react";
import { CUSTOM_MAX, useEva } from "./eva-store";
import { CompassIcon, LightbulbIcon } from "./icons";
import { QuizDialog } from "./QuizDialog";
import { FLOW_NAMES, type Flow } from "./quiz-data";

/**
 * The five preference blocks of the playground's design, as controls:
 * pick the room, slide the budget, choose styles, colours and what the
 * room needs. Everything here is what Eva keeps to, however it got here.
 * Room type and Design style also take options of one's own, typed in,
 * three at most per block. Eva reads these on every turn, unless
 * Exploration is on: then she sets them aside and stays open to anything.
 */
export function PreferenceTab() {
  const prefs = useEva((s) => s.preferences);
  const toggle = useEva((s) => s.toggleValue);
  const setBudget = useEva((s) => s.setBudget);
  const clear = useEva((s) => s.clearPreference);
  const exploration = useEva((s) => s.exploration);
  const setExploration = useEva((s) => s.setExploration);
  const custom = useEva((s) => s.custom);
  const addCustom = useEva((s) => s.addCustom);
  const removeCustom = useEva((s) => s.removeCustom);
  const [typing, setTyping] = useState<{
    cat: PreferenceCategory;
    draft: string;
  } | null>(null);
  const [quiz, setQuiz] = useState<Flow | null>(null);

  const chips = (
    cat: PreferenceCategory,
    options: readonly string[],
    multi: boolean,
    own = false,
  ) => {
    const on = prefs[cat]?.values ?? [];
    const mine = custom[cat] ?? [];
    const isTyping = typing?.cat === cat;
    const commit = () => {
      if (typing) addCustom(cat, typing.draft, multi);
      setTyping(null);
    };
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
        {mine.map((o) => (
          <span key={o} className="eva-own">
            <button
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on.includes(o)}
              className="assets-chip eva-own-chip"
              onClick={() => toggle(cat, o, multi)}
            >
              {o}
            </button>
            <button
              type="button"
              className="eva-own-x"
              aria-label={`Remove ${o}`}
              onClick={() => removeCustom(cat, o)}
            >
              ×
            </button>
          </span>
        ))}
        {own && mine.length < CUSTOM_MAX && !isTyping && (
          <button
            type="button"
            className="assets-chip eva-own-add"
            onClick={() => setTyping({ cat, draft: "" })}
          >
            + Your own
          </button>
        )}
        {own && isTyping && (
          <input
            className="assets-chip eva-own-input"
            autoFocus
            value={typing.draft}
            placeholder="Type and press Enter"
            aria-label={`Your own ${cat === "room" ? "room type" : "design style"}`}
            maxLength={24}
            onChange={(e) => setTyping({ cat, draft: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setTyping(null);
            }}
            onBlur={commit}
          />
        )}
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
      {/* not sure what to pick: a short quiz works it out and hands it to Eva */}
      <div className="eva-quizzes">
        <span className="eva-quizzes-lead">
          <LightbulbIcon size={14} />
          Not sure? Take a short quiz
        </span>
        <div className="eva-chips" role="group" aria-label="Quizzes">
          {(Object.keys(FLOW_NAMES) as Flow[]).map((f) => (
            <button
              key={f}
              type="button"
              className="assets-chip"
              onClick={() => setQuiz(f)}
            >
              {FLOW_NAMES[f].replace(" quiz", "")}
            </button>
          ))}
        </div>
      </div>
      {quiz && <QuizDialog flow={quiz} onClose={() => setQuiz(null)} />}
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

            {b.id === "room" && chips("room", ROOMS, false, true)}
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
            {b.id === "style" && chips("style", STYLES, true, true)}
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
