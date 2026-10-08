"use client";

import {
  ACCESSORIES,
  billOfParts,
  boxes,
  buildSteps,
  counts,
  type Configuration,
  defaultConfig,
  dimensionSummary,
  priceOf,
  RATES,
  RECOMMENDATION_LABELS,
  RECOMMENDATIONS,
  STATUS,
  type Product as Recipe,
} from "@furnishes/domain";
import { sgd } from "./assets-data";
import { productOf } from "./catalogue";
import { PlusIcon } from "./icons";
import { useRoom } from "./room-store";
import { useScene } from "./scene-store";

/**
 * A Furnishes piece's product page, under its actions in the Detail
 * tab: what it is and what to check in the room, what comes in the box
 * (every part counted, every box weighed), how it is built (the steps,
 * the minutes, the bolts), where its price comes from (line by line
 * from the parts, and labelled an estimate), and the pieces worth a look
 * beside it, each a press away from the room. Count, don't claim: all
 * of it is read from the recipe's part list, nothing typed in twice.
 */
export function ProductPage({
  recipe: r,
  config,
}: {
  recipe: Recipe;
  /** the piece as configured; the recipe's own when unset */
  config?: Configuration | undefined;
}) {
  const activeId = useRoom((s) => s.activeId);
  const { addProduct, select } = useScene.getState();
  const c = config ?? defaultConfig(r);
  const parts = billOfParts(r, c);
  const bx = boxes(r, c);
  const steps = buildSteps(r, c);
  const n = counts(r, c);
  const price = priceOf(r, c);
  const names = (ids: string[]) =>
    ids.map((id) => ACCESSORIES[id]?.name.toLowerCase() ?? id).join(", ");
  const recs = (RECOMMENDATIONS[r.id] ?? [])
    .map((x) => ({ ...x, product: productOf(x.id) }))
    .filter((x) => x.product !== undefined);
  return (
    <>
      <section className="eva-pref" aria-label="About">
        <div className="eva-pref-head">
          <span className="eva-pref-title">About</span>
          <span className="detail-of">{STATUS[r.status].label}</span>
        </div>
        <p className="detail-use">{r.use}</p>
        <p className="detail-text">{r.description}</p>
        <p className="detail-fact f-num">
          {r.fit} · {dimensionSummary(r)}
        </p>
        <p className="detail-note">{r.space}</p>
        {c.accessories.length > 0 && (
          <p className="detail-fact">Comes with {names(c.accessories)}.</p>
        )}
        {r.optionalAccessories.length > 0 && (
          <p className="detail-note">
            Can take {names(r.optionalAccessories)}.
          </p>
        )}
        <p className="detail-note">{STATUS[r.status].blurb}</p>
      </section>

      <section className="eva-pref" aria-label="In the box">
        <div className="eva-pref-head">
          <span className="eva-pref-title">In the box</span>
          <span className="detail-of f-num">
            {n.parts} parts · {n.boxes} {n.boxes === 1 ? "box" : "boxes"}
          </span>
        </div>
        <ul className="detail-list" aria-label="Parts">
          {parts.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              <span className="f-num">× {row.quantity}</span>
            </li>
          ))}
        </ul>
        <ul className="detail-list detail-boxes" aria-label="Boxes">
          {bx.map((b) => (
            <li key={b.id}>
              <span>
                {b.label} · {b.contents}
              </span>
              <span className="f-num">{b.weightKg} kg</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="eva-pref" aria-label="Building it">
        <div className="eva-pref-head">
          <span className="eva-pref-title">Building it</span>
          <span className="detail-of f-num">
            {n.minutes} min · {n.people === 2 ? "two people" : "one person"}
          </span>
        </div>
        <p className="detail-note f-num">
          {n.bolts} bolts and the one L-key, parked in the base. Minutes and
          bolts are working estimates until the record is validated on samples.
        </p>
        <ol className="detail-steps">
          {steps.map((s) => (
            <li key={s.n}>
              <b>{s.title}</b>
              <span>{s.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="eva-pref" aria-label="Where the price comes from">
        <div className="eva-pref-head">
          <span className="eva-pref-title">Where the price comes from</span>
          <span className="detail-of f-num">{sgd(price.sgd)} · estimate</span>
        </div>
        <ul className="detail-list" aria-label="Price lines">
          {price.lines.map((l) => (
            <li key={l.label}>
              <span>{l.label}</span>
              <span className="f-num">{sgd(l.sgd)}</span>
            </li>
          ))}
        </ul>
        <p className="detail-note f-num">
          Counted from the parts: {price.m2} m² of 18 mm birch plywood in{" "}
          {price.panels} panels, times {RATES.overhead} for the studio, rounded
          to five. An estimate until the first run is costed.
        </p>
      </section>

      {recs.length > 0 && (
        <section className="eva-pref" aria-label="Also look at">
          <div className="eva-pref-head">
            <span className="eva-pref-title">Also look at</span>
          </div>
          <ul className="detail-list detail-recs">
            {recs.map((x) => (
              <li key={x.id}>
                <span className="detail-rec-text">
                  <b>{x.product!.name}</b>
                  <span className="detail-rec-kind">
                    {RECOMMENDATION_LABELS[x.type]}
                  </span>
                  <span>{x.reason}</span>
                </span>
                <button
                  type="button"
                  className="agent-fix"
                  aria-label={`Add ${x.product!.name} to the room`}
                  onClick={() =>
                    select(addProduct(x.product!, activeId), false)
                  }
                >
                  <PlusIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
