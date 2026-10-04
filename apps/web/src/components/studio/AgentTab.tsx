"use client";

import { CATEGORY_NAMES, pieceTotals, sgd } from "./assets-data";
import { planOf, stageOf, STAGES, STARTERS, type Chip } from "./eva-brain";
import { PREFERENCE_BLOCKS, PROMPTS } from "./eva-data";
import { useEva } from "./eva-store";
import { CartIcon, CheckIcon, LightbulbIcon, PlusIcon, TagIcon } from "./icons";
import { usePieceActions } from "./piece-actions";
import { footprint, LABEL_MAX } from "./piece-detail";
import { metres, ROOM_NAMES } from "./room-data";
import { useRoom } from "./room-store";
import { useScene, useTopLevel } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * The Agent tab: Eva says hello and what she has read from the room, the
 * stage the work is at, and the room plan's readiness; a first visit is
 * offered four rooms to start from. Once something is said, the thread
 * of the open conversation follows, you on the right and Eva on the
 * left: her messages carry the preferences she heard (to take up or set
 * aside), the pieces she picked with why each fits (and a way to add
 * them), and what to say or do next.
 */
export function AgentTab() {
  const room = useRoom();
  const items = useTopLevel();
  const labels = useScene((s) => s.labels);
  const cart = useScene((s) => s.cart);
  const setDraft = useEva((s) => s.setDraft);
  const exploration = useEva((s) => s.exploration);
  const prefs = useEva((s) => s.preferences);
  const activeId = useEva((s) => s.activeId);
  const thread = useEva((s) => (activeId ? s.messages[activeId] : undefined));
  const title = useEva(
    (s) => s.conversations.find((c) => c.id === activeId)?.title,
  );
  const { send, settleProposal, pickChip } = useEva.getState();
  const { addProduct, select } = useScene.getState();
  const { setShelfTab, setPanelTab } = useStudio.getState();
  const stage = usePieceActions();
  const t = pieceTotals(items);
  const labelled = labels
    .map((id) => items.find((n) => n.id === id))
    .filter((n) => n !== undefined);
  const ctx = {
    room: {
      id: room.room,
      flat: room.flat,
      width: room.width,
      depth: room.depth,
      height: room.height,
      sized: room.start !== null,
    },
    pieces: items.filter((n) => n.kind !== "fixed"),
    cart,
    prefs,
    exploration,
  };
  const plan = planOf(ctx);
  const at = stageOf(ctx);
  const inRoom = new Set(items.map((n) => n.name));

  // the room's health: pieces standing over each other, or past a wall
  const warnings: string[] = [];
  const boxes = stage.pieces
    .filter((n) => !stage.props.get(n.id)!.hidden)
    .map((n) => {
      const f = footprint(stage.props.get(n.id)!);
      const s = stage.spots.get(n.id)!;
      return { n, x: s.x, y: s.y, w: f.w, d: f.d };
    });
  for (const b of boxes)
    if (b.x + b.w > stage.room.W + 1 || b.y + b.d > stage.room.D + 1)
      warnings.push(`${b.n.name} stands past the wall`);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.d &&
        b.y < a.y + a.d
      )
        warnings.push(`${a.n.name} overlaps ${b.n.name}`);
    }

  const started = thread !== undefined && thread.length > 0;
  return (
    <div className="agent">
      <div className="agent-msg">
        <span className="agent-who">
          <span className="chat-eva-dot" aria-hidden="true" />
          Eva
        </span>
        <p>
          Hi, I&apos;m Eva. I plan rooms with Furnishes pieces: tell me how the
          room is used and I&apos;ll lay it out, price it and keep to what fits.
        </p>
      </div>
      {exploration && (
        <p className="agent-exploring">
          Exploration is on: your preferences are set aside for now.
        </p>
      )}

      {/* where the work stands */}
      <ol className="agent-stages" aria-label="Where we are">
        {STAGES.map((s, i) => {
          const done = STAGES.findIndex((x) => x.id === at) > i;
          return (
            <li
              key={s.id}
              className="agent-stage"
              data-now={s.id === at}
              data-done={done}
              aria-current={s.id === at ? "step" : undefined}
            >
              {done ? (
                <CheckIcon size={11} />
              ) : (
                <span className="agent-stage-n f-num">{i + 1}</span>
              )}
              {s.label}
            </li>
          );
        })}
      </ol>

      <dl className="agent-context" aria-label="What Eva has read">
        <div>
          <dt>Room</dt>
          <dd>
            {ROOM_NAMES[room.room]} · {room.flat} HDB
          </dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd className="f-num">
            {metres(room.width)} × {metres(room.depth)} · {metres(room.height)}{" "}
            high
          </dd>
        </div>
        <div>
          <dt>In the room</dt>
          <dd className="f-num">
            {t.pieces} pieces · {sgd(t.total)}
          </dd>
        </div>
        {PREFERENCE_BLOCKS.filter((b) => prefs[b.id]).map((b) => {
          const p = prefs[b.id]!;
          return (
            <div key={b.id}>
              <dt>{b.label}</dt>
              <dd className={p.budget ? "f-num" : undefined}>
                {p.budget
                  ? `${sgd(p.budget[0])} – ${sgd(p.budget[1])}`
                  : p.values.join(", ")}
              </dd>
            </div>
          );
        })}
      </dl>

      {/* the room plan: how ready it is, the budget, what is missing */}
      <section className="agent-plan" aria-label="Room plan">
        <div className="agent-plan-head">
          <span className="agent-plan-label">{plan.label}</span>
          <span className="agent-plan-score f-num">{plan.score}%</span>
        </div>
        <div
          className="agent-bar"
          role="progressbar"
          aria-valuenow={plan.score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Readiness"
        >
          <span style={{ width: `${plan.score}%` }} />
        </div>
        {plan.to !== undefined && (
          <>
            <div className="agent-plan-row f-num">
              <span>Budget</span>
              <span data-over={plan.remaining! < 0}>
                {sgd(plan.total)} of {sgd(plan.to)} ·{" "}
                {plan.remaining! >= 0
                  ? `${sgd(plan.remaining!)} left`
                  : `${sgd(-plan.remaining!)} over`}
              </span>
            </div>
            <div className="agent-bar agent-bar-budget" aria-hidden="true">
              <span
                data-over={plan.remaining! < 0}
                style={{
                  width: `${Math.min(100, (plan.total / plan.to) * 100)}%`,
                }}
              />
            </div>
          </>
        )}
        {plan.missing.length > 0 && (
          <p className="agent-plan-row">
            <span>Still to decide</span>
            <span>
              {plan.missing
                .map((k) => CATEGORY_NAMES[k].toLowerCase())
                .join(", ")}
            </span>
          </p>
        )}
        {warnings.slice(0, 3).map((w) => (
          <p key={w} className="agent-plan-warn">
            {w}
          </p>
        ))}
        {at === "order" ? (
          <button
            type="button"
            className="main-btn main-btn-primary agent-plan-cta"
            onClick={() => setShelfTab("cart")}
          >
            <CartIcon size={14} />
            <span>Ready to order · open the cart</span>
          </button>
        ) : at === "intake" ? (
          <button
            type="button"
            className="main-btn agent-plan-cta"
            onClick={() => setPanelTab("room")}
          >
            <span>Set the room&apos;s walls</span>
          </button>
        ) : null}
      </section>

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

      {started && (
        <div className="agent-thread" aria-label={title ?? "Conversation"}>
          {thread.map((m) => (
            <div key={m.id} className="agent-turn" data-who={m.who}>
              <div className="agent-bubble" data-who={m.who}>
                {m.image && (
                  <span className="agent-bubble-image">{m.image}</span>
                )}
                {m.text}
              </div>
              {m.proposals?.map((p, i) => {
                const block = PREFERENCE_BLOCKS.find((b) => b.id === p.cat)!;
                return (
                  <div
                    key={i}
                    className="agent-proposal"
                    data-settled={p.settled ?? "open"}
                    role="group"
                    aria-label={`${block.label} heard`}
                  >
                    <span className="agent-proposal-text">
                      <span className="agent-proposal-cat">{block.label}</span>
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
                );
              })}
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
                          onClick={() => select(addProduct(product), false)}
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
        </div>
      )}

      {!started && (
        <>
          <p className="agent-lead">
            <LightbulbIcon size={14} />
            Which room are we planning?
          </p>
          <div
            className="agent-starters"
            role="group"
            aria-label="Start from a room"
          >
            {STARTERS.map((r) => (
              <button
                key={r}
                type="button"
                className="assets-chip"
                onClick={() => send(`Help me plan my ${r.toLowerCase()}`)}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="agent-lead">
        <LightbulbIcon size={14} />
        {started ? "Or ask" : "Or start with one of these"}
      </p>
      <div className="agent-prompts">
        {PROMPTS.map((p) => (
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
    </div>
  );
}
