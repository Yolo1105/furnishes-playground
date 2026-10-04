"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { useEva } from "./eva-store";
import { FLOW_NAMES, QUIZZES, type Flow } from "./quiz-data";
import { resultOf } from "./quiz-engine";
import { useStudio } from "./studio-store";

/**
 * A quiz, one question at a time: its options as chips (a single choice
 * moves on by itself; several need Next), a line that counts the steps,
 * Back, and at the end the result with one button that hands it to Eva
 * as proposals, where Keep confirms each.
 */
export function QuizDialog({
  flow,
  onClose,
}: {
  flow: Flow;
  onClose: () => void;
}) {
  const questions = QUIZZES[flow];
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const q = questions[step];
  const done = step >= questions.length;
  const picked = q ? (answers[q.id] ?? []) : [];
  const choose = (id: string) => {
    if (!q) return;
    if (q.max === 1) {
      setAnswers({ ...answers, [q.id]: [id] });
      setStep(step + 1);
      return;
    }
    const next = picked.includes(id)
      ? picked.filter((x) => x !== id)
      : picked.length >= q.max
        ? picked
        : [...picked, id];
    setAnswers({ ...answers, [q.id]: next });
  };
  const result = done ? resultOf(flow, answers) : null;
  const hand = () => {
    if (!result) return;
    useEva.getState().fromQuiz(flow, result);
    useStudio.getState().setEvaTab("agent");
    onClose();
  };
  return (
    <Dialog title={FLOW_NAMES[flow]} onClose={onClose} wide>
      {q && (
        <div className="quiz" data-flow={flow}>
          <p className="quiz-step f-num">
            {step + 1} of {questions.length}
          </p>
          <h3 className="quiz-q">{q.question}</h3>
          {q.subtext && <p className="quiz-sub">{q.subtext}</p>}
          <div
            className="quiz-options"
            role={q.max === 1 ? "radiogroup" : "group"}
            aria-label={q.question}
          >
            {q.options.map((o) => (
              <button
                key={o.id}
                type="button"
                role={q.max === 1 ? "radio" : "checkbox"}
                aria-checked={picked.includes(o.id)}
                className="assets-chip quiz-option"
                data-sub={o.sublabel !== undefined}
                onClick={() => choose(o.id)}
              >
                <span>{o.label}</span>
                {o.sublabel && <small>{o.sublabel}</small>}
              </button>
            ))}
          </div>
          <div className="shell-dialog-acts quiz-acts">
            <span className="quiz-hint">
              {q.max > 1
                ? picked.length < q.min
                  ? `Pick ${q.min === q.max ? q.min : `${q.min} to ${q.max}`}`
                  : `${picked.length} picked`
                : "Pick one"}
            </span>
            <span className="quiz-acts-main">
              <button
                type="button"
                className="main-btn"
                disabled={step === 0}
                onClick={() => setStep(step - 1)}
              >
                <span>Back</span>
              </button>
              {q.max > 1 && (
                <button
                  type="button"
                  className="main-btn main-btn-primary"
                  disabled={picked.length < q.min}
                  onClick={() => setStep(step + 1)}
                >
                  <span>
                    {step === questions.length - 1 ? "See the result" : "Next"}
                  </span>
                </button>
              )}
            </span>
          </div>
        </div>
      )}
      {result && (
        <div className="quiz quiz-result" data-flow={flow}>
          <p className="quiz-step">Your result</p>
          <h3 className="quiz-q">{result.title}</h3>
          <p className="quiz-lead">{result.lead}</p>
          {result.palette && (
            <div className="quiz-palette" aria-hidden="true">
              {result.palette.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
          )}
          <p className="quiz-sub">{result.body}</p>
          <ul className="shell-dialog-list quiz-proposals">
            {result.proposals.map((p) => (
              <li key={p.cat}>
                <span className="quiz-cat">
                  {p.cat === "color"
                    ? "Colours"
                    : p.cat === "furniture"
                      ? "Needs"
                      : p.cat[0]!.toUpperCase() + p.cat.slice(1)}
                </span>
                <span>{p.values.join(", ")}</span>
              </li>
            ))}
          </ul>
          <div className="shell-dialog-acts quiz-acts">
            <button
              type="button"
              className="main-btn"
              onClick={() => setStep(questions.length - 1)}
            >
              <span>Back</span>
            </button>
            <button
              type="button"
              className="main-btn main-btn-primary"
              onClick={hand}
            >
              <span>Hand to Eva</span>
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
