"use client";

import { CATEGORY_NAMES, pieceTotals, sgd } from "./assets-data";
import { planOf, stageOf, type Chip } from "./eva-brain";
import {
  personaOf,
  PREF_REVIEW,
  PREFERENCE_BLOCKS,
  PROMPTS,
  proposalLabel,
} from "./eva-data";
import { useEva } from "./eva-store";
import {
  CheckIcon,
  CopyIcon,
  LightbulbIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  TagIcon,
  ThumbIcon,
} from "./icons";
import { useEffect, useRef, useState } from "react";
import { usePieceActions } from "./piece-actions";
import { metresOf, whyLines } from "./plan-explain";
import { LABEL_MAX } from "./piece-detail";
import { metres, ROOM_NAMES } from "./room-data";
import { useActiveRoom, useRoom } from "./room-store";
import { inRoom as standsIn, useScene, useTopLevel } from "./scene-store";

/**
 * The Agent tab: Eva, what she has read from the room in one line, and
 * two things to ask her straight away (Brainstorm for me, Review my
 * preferences). Under that the room plan, folded to one line that says
 * the most urgent of it: what is still to decide, the room's health
 * with a Fix for each finding, three layouts to inspect and apply, and
 * where the budget should go once one is kept. Then the thread of the
 * open conversation, you on the right and Eva on the left: her messages
 * carry the preferences she heard (to take up or set aside), the pieces
 * she picked with why each fits (and a way to add them), and what to say
 * next. Any answer can be pinned to the project (the pinned stand above
 * the thread). Before the first message, prompts to start from.
 */
export function AgentTab() {
  const room = useActiveRoom();
  const flat = useRoom((s) => s.flat);
  const all = useTopLevel();
  const overrides = useScene((s) => s.overrides);
  const firstId = useRoom((s) => s.rooms[0]!.id);
  // what stands in the active room: the line counts it, the labels
  // reach it
  const items = all.filter((n) =>
    standsIn(overrides[n.id] ?? {}, room.id, firstId),
  );
  const labels = useScene((s) => s.labels);
  const setDraft = useEva((s) => s.setDraft);
  const exploration = useEva((s) => s.exploration);
  const prefs = useEva((s) => s.preferences);
  const activeId = useEva((s) => s.activeId);
  const thread = useEva((s) => (activeId ? s.messages[activeId] : undefined));
  const title = useEva(
    (s) => s.conversations.find((c) => c.id === activeId)?.title,
  );
  const thinking = useEva((s) => s.thinking);
  const offline = useEva((s) => s.offline);
  const persona = personaOf(useEva((s) => s.persona));
  const { send, settleProposal, pickChip, rate, pin, brainstorm, context } =
    useEva.getState();
  // the layout opened to see what it would do
  const [inspecting, setInspecting] = useState<string | null>(null);
  const { addProduct, select } = useScene.getState();
  const stage = usePieceActions();
  const t = pieceTotals(items);
  const labelled = labels
    .map((id) => items.find((n) => n.id === id))
    .filter((n) => n !== undefined);
  // the same facts the store sends Eva, read fresh on each render
  const ctx = context();
  const plan = planOf(ctx);
  const at = stageOf(ctx);
  const inRoom = new Set(items.map((n) => n.name));

  // what Eva has read, in one line: the room, what stands in it, and
  // what she keeps to
  const kept = PREFERENCE_BLOCKS.filter((b) => prefs[b.id]).map((b) => {
    const p = prefs[b.id]!;
    return p.budget
      ? `${sgd(p.budget[0])} to ${sgd(p.budget[1])}`
      : p.values.join(", ");
  });
  const read = `${ROOM_NAMES[room.room]} in a ${flat} HDB, ${metres(room.width)} × ${metres(room.depth)}: ${t.pieces} ${t.pieces === 1 ? "piece" : "pieces"} at ${sgd(t.total)}.${kept.length ? ` Keeping to ${kept.join(" · ")}.` : ""}`;

  // the planner's findings: the room's health, with a Fix where one exists
  const issues = stage.issues;
  const missing = plan.missing.map((k) => CATEGORY_NAMES[k].toLowerCase());
  // the plan's one line: the most urgent of what is inside
  const urgent = [
    issues.length
      ? `${issues.length} finding${issues.length === 1 ? "" : "s"}`
      : "",
    missing.length ? `${missing.join(", ")} still to decide` : "",
  ].filter(Boolean);
  const showLayouts = at !== "intake" && stage.pieces.length > 0;
  const summary = urgent.length
    ? urgent.join(" · ")
    : at === "intake"
      ? "the room's walls first"
      : showLayouts
        ? `${stage.plans.length} layouts · clear`
        : "clear";

  const started = thread !== undefined && thread.length > 0;
  const pinned = (thread ?? []).filter((m) => m.pinned);
  return (
    <div className="agent">
      <div className="agent-msg">
        <span className="agent-who">
          <span className="chat-eva-dot" aria-hidden="true" />
          {persona.name}
          <span className="agent-who-tag">{persona.tagline}</span>
        </span>
        {!started && (
          <p>
            Hi, I&apos;m Eva. I plan rooms with Furnishes pieces: tell me how
            the room is used and I&apos;ll lay it out, price it and keep to what
            fits.
          </p>
        )}
        <p className="agent-read">{read}</p>
        <div
          className="agent-chips agent-hello-acts"
          role="group"
          aria-label="Ask Eva"
        >
          <button
            type="button"
            className="main-btn"
            disabled={thinking}
            onClick={() => void brainstorm()}
          >
            <LightbulbIcon size={14} />
            <span>{thinking ? "Thinking…" : "Brainstorm for me"}</span>
          </button>
          <button
            type="button"
            className="main-btn"
            disabled={thinking}
            onClick={() => void send(PREF_REVIEW)}
          >
            <span>{PREF_REVIEW}</span>
          </button>
        </div>
      </div>
      {exploration && (
        <p className="agent-exploring">
          Exploration is on: your preferences are set aside for now.
        </p>
      )}

      {/* the room plan: what only Eva reads, under one line */}
      <details className="agent-plan">
        <summary className="agent-plan-head">
          <span className="agent-plan-label">Room plan</span>
          <span className="agent-plan-sum" data-urgent={urgent.length > 0}>
            {summary}
          </span>
        </summary>
        <div className="agent-plan-body" aria-label="Room plan">
          {missing.length > 0 && (
            <p className="agent-plan-row">
              <span>Still to decide</span>
              <span>{missing.join(", ")}</span>
            </p>
          )}
          {plan.to !== undefined && (
            <ul
              className="agent-bands f-num"
              aria-label="Where the budget should go"
            >
              {plan.bands.map((b) => (
                <li key={b.category} data-over={b.spent > b.upTo}>
                  <span>{b.label}</span>
                  <span>
                    {sgd(b.spent)} of {sgd(b.from)}–{sgd(b.upTo)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {issues.length > 0 && (
            <ul className="agent-issues" aria-label="Room health">
              {issues.slice(0, 4).map((i) => (
                <li
                  key={`${i.kind}-${i.pieceId}-${i.text}`}
                  className="agent-plan-warn"
                >
                  <span>{i.text}</span>
                  {(i.fix || i.add) && (
                    <button
                      type="button"
                      className="agent-fix"
                      aria-label={`${i.add ? "Add" : "Fix"}: ${i.text}`}
                      onClick={() => stage.fix(i)}
                    >
                      {i.add ? "Add" : "Fix"}
                    </button>
                  )}
                </li>
              ))}
              {issues.length > 4 && (
                <li className="agent-plan-more">
                  and {issues.length - 4} more
                </li>
              )}
            </ul>
          )}
          {showLayouts && (
            <div className="agent-layouts" role="group" aria-label="Layouts">
              <span className="agent-plan-label">Layouts</span>
              {stage.plans.map((p, i) => (
                <div
                  key={p.id}
                  className="agent-layout"
                  data-applied={p.applied}
                  data-open={inspecting === p.id}
                >
                  <div className="agent-layout-row">
                    <div className="agent-layout-text">
                      <span className="agent-layout-name">
                        {p.label}
                        {i === stage.pick && (
                          <span className="agent-layout-pick">
                            Eva&apos;s pick
                          </span>
                        )}
                      </span>
                      <span className="agent-layout-note f-num">
                        {p.note} ·{" "}
                        {p.findings === 0
                          ? "clear"
                          : `${p.findings} finding${p.findings === 1 ? "" : "s"}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="agent-fix agent-inspect-btn"
                      aria-expanded={inspecting === p.id}
                      aria-label={`Inspect ${p.label}`}
                      onClick={() =>
                        setInspecting((cur) => (cur === p.id ? null : p.id))
                      }
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      className="agent-fix"
                      aria-pressed={p.applied}
                      disabled={p.applied}
                      onClick={() => stage.apply(p)}
                    >
                      {p.applied ? "Applied" : "Apply"}
                    </button>
                  </div>
                  {inspecting === p.id && (
                    <div
                      className="agent-inspect"
                      role="region"
                      aria-label={`${p.label}, inspected`}
                    >
                      <ul className="agent-inspect-why">
                        {whyLines(
                          p.id,
                          p,
                          stage.room.rules,
                          i === stage.pick,
                          stage.tied,
                        ).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      {p.issues.length > 0 && (
                        <ul
                          className="agent-inspect-list"
                          aria-label={`What ${p.label} would leave`}
                        >
                          {p.issues.map((x) => (
                            <li key={`${x.kind}-${x.pieceId}-${x.text}`}>
                              {x.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="agent-inspect-sum f-num">
                        {p.applied
                          ? "Every piece stands as this layout has it."
                          : p.moves.length === 0
                            ? "No piece would move."
                            : `${p.moves.length} ${p.moves.length === 1 ? "piece" : "pieces"} would move${p.stays > 0 ? `, ${p.stays} would stay` : ""}.`}
                      </p>
                      {!p.applied && p.moves.length > 0 && (
                        <ul
                          className="agent-inspect-list agent-inspect-moves"
                          aria-label={`What ${p.label} would move`}
                        >
                          {p.moves.slice(0, 5).map((m) => (
                            <li key={m.id}>
                              <span>{m.name}</span>
                              <span className="f-num">
                                {m.dist >= 50 ? metresOf(m.dist) : "in place"}
                                {m.turns ? " · turns" : ""}
                              </span>
                            </li>
                          ))}
                          {p.moves.length > 5 && (
                            <li className="agent-plan-more">
                              and {p.moves.length - 5} more
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {urgent.length === 0 && !showLayouts && (
            <p className="agent-plan-note">
              {at === "intake"
                ? "Set the room's walls in the Room tab, and the plan reads from them."
                : "Nothing to fix and nothing missing."}
            </p>
          )}
        </div>
      </details>

      {labelled.length > 0 && (
        <>
          <p className="agent-lead">
            <TagIcon size={14} />
            Labelled, {labelled.length} of {LABEL_MAX}
          </p>
          <div className="agent-labels" aria-label="Labelled pieces">
            {labelled.map((n, i) => (
              <button
                key={n.id}
                type="button"
                className="assets-chip agent-label"
                onClick={() => setDraft(`About ${i + 1} (${n.name}): `)}
              >
                <span className="agent-label-n f-num">{i + 1}</span>
                {n.name}
              </button>
            ))}
          </div>
        </>
      )}

      {pinned.length > 0 && (
        <ul className="agent-pinned" aria-label="Pinned">
          {pinned.map((m) => (
            <li key={m.id}>
              <PinIcon size={12} />
              <span className="agent-pinned-text">{m.text}</span>
              <button
                type="button"
                className="eva-pref-clear"
                aria-label="Unpin"
                onClick={() => pin(m.id)}
              >
                Unpin
              </button>
            </li>
          ))}
        </ul>
      )}
      {started && (
        <div className="agent-thread" aria-label={title ?? "Conversation"}>
          {thread.map((m) => (
            <div key={m.id} className="agent-turn" data-who={m.who}>
              <div className="agent-bubble" data-who={m.who}>
                {m.text}
              </div>
              <div
                className="agent-acts"
                role="group"
                aria-label="Message actions"
              >
                <button
                  type="button"
                  className="agent-act shell-tip"
                  data-tooltip="Copy"
                  aria-label="Copy message"
                  onClick={() => void navigator.clipboard?.writeText(m.text)}
                >
                  <CopyIcon size={12} />
                </button>
                {m.who === "you" ? (
                  <button
                    type="button"
                    className="agent-act shell-tip"
                    data-tooltip="Edit and resend"
                    aria-label="Edit and resend"
                    onClick={() => setDraft(m.text)}
                  >
                    <PencilIcon size={12} />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="agent-act shell-tip"
                      data-tooltip="Helpful"
                      aria-label="Helpful"
                      aria-pressed={m.rating === "up"}
                      onClick={() => rate(m.id, "up")}
                    >
                      <ThumbIcon size={12} />
                    </button>
                    <button
                      type="button"
                      className="agent-act shell-tip"
                      data-tooltip="Not helpful"
                      aria-label="Not helpful"
                      aria-pressed={m.rating === "down"}
                      onClick={() => rate(m.id, "down")}
                    >
                      <ThumbIcon size={12} down />
                    </button>
                    <button
                      type="button"
                      className="agent-act shell-tip"
                      data-tooltip={m.pinned ? "Unpin" : "Pin to project"}
                      aria-label={m.pinned ? "Unpin" : "Pin to project"}
                      aria-pressed={m.pinned === true}
                      onClick={() => pin(m.id)}
                    >
                      <PinIcon size={12} />
                    </button>
                  </>
                )}
              </div>
              {m.proposals?.map((p, i) => (
                <div
                  key={i}
                  className="agent-proposal"
                  data-settled={p.settled ?? "open"}
                  role="group"
                  aria-label={`${proposalLabel(p.cat)} heard`}
                >
                  <span className="agent-proposal-text">
                    <span className="agent-proposal-cat">
                      {proposalLabel(p.cat)}
                    </span>
                    {p.values.join(", ")}
                  </span>
                  {p.settled ? (
                    <span className="agent-proposal-state">
                      {p.settled === "accepted" ? "Kept" : "Set aside"}
                    </span>
                  ) : (
                    <span className="agent-proposal-acts">
                      <button
                        type="button"
                        className="main-btn main-btn-primary"
                        onClick={() => settleProposal(m.id, i, true)}
                      >
                        <span>Keep</span>
                      </button>
                      <button
                        type="button"
                        className="main-btn"
                        onClick={() => settleProposal(m.id, i, false)}
                      >
                        <span>Not now</span>
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {m.cards && (
                <div className="agent-cards" aria-label="Pieces Eva picked">
                  {m.cards.map(({ product, why }) => {
                    const added = inRoom.has(product.name);
                    return (
                      <article
                        key={product.id}
                        className="agent-card"
                        data-added={added}
                      >
                        <div className="agent-card-row">
                          <span className="agent-card-name">
                            {product.name}
                          </span>
                          <span className="agent-card-price f-num">
                            {sgd(product.price)}
                          </span>
                        </div>
                        <p className="agent-card-why">{why}</p>
                        <button
                          type="button"
                          className="main-btn agent-card-add"
                          aria-pressed={added}
                          disabled={added}
                          onClick={() =>
                            select(addProduct(product, room.id), false)
                          }
                        >
                          {added ? (
                            <CheckIcon size={13} />
                          ) : (
                            <PlusIcon size={13} />
                          )}
                          <span>
                            {added ? "In the room" : "Add to the room"}
                          </span>
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
              {m.chips && (
                <div className="agent-chips" role="group" aria-label="Next">
                  {m.chips.map((c: Chip) => (
                    <button
                      key={c.label}
                      type="button"
                      className="assets-chip"
                      onClick={() => pickChip(m.id, c)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="agent-turn" data-who="eva">
              <div
                className="agent-bubble agent-thinking"
                data-who="eva"
                aria-label="Eva is thinking"
              >
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <ThreadEnd count={thread.length} thinking={thinking} />
          {offline && (
            <p className="agent-offline">
              No model is connected on this server, so Eva answers from the
              room&apos;s facts and the catalogue.
            </p>
          )}
        </div>
      )}

      {/* before anything is said: prompts to start from, the room's own
          first; after that Eva's chips say what comes next */}
      {!started && (
        <>
          <p className="agent-lead">
            <LightbulbIcon size={14} />
            Start with one of these
          </p>
          <div className="agent-prompts">
            {[
              `Help me plan the ${ROOM_NAMES[room.room].toLowerCase()}`,
              ...PROMPTS,
            ].map((p) => (
              <button
                key={p}
                type="button"
                className="agent-prompt"
                onClick={() => setDraft(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** the end of the thread: a new turn, or Eva thinking, brings it into
    view; a thread already there when the panel opens stays put */
function ThreadEnd({ count, thinking }: { count: number; thinking: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<number | null>(null);
  useEffect(() => {
    const grew = seenRef.current !== null && count > seenRef.current;
    seenRef.current = count;
    if (grew || thinking)
      endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [count, thinking]);
  return <div ref={endRef} aria-hidden="true" />;
}
