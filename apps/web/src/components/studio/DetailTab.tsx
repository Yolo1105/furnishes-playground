"use client";

import { CATEGORY_NAMES, sgd, type AssetNode } from "./assets-data";
import { CartIcon, CheckIcon, ExpandIcon, TagIcon } from "./icons";
import { COLOURS, LABEL_MAX, TEXTURES } from "./piece-detail";
import { findNode, propsOf, useScene } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * The piece in hand, as a product page in the panel: its picture, name
 * and price, what it is, and what can be done with it (cart, a label for
 * Eva, a look at it alone). A piece built from parts lists them under
 * "Whole piece": editing the whole piece changes every part; picking a
 * part changes that part. Then the finish, colour and texture, and the
 * size, all kept over the defaults in the scene store.
 */
export function DetailTab() {
  const groups = useScene((s) => s.groups);
  const selectedId = useScene((s) => s.selectedId);
  const overrides = useScene((s) => s.overrides);
  const cart = useScene((s) => s.cart);
  const labels = useScene((s) => s.labels);
  const { select, setProps, toggleCart, toggleLabel } = useScene.getState();
  const setFocus = useStudio((s) => s.setFocus);
  const found = findNode(groups, selectedId);
  if (!found || found.node.kind !== "piece")
    return (
      <div className="detail-empty">
        <p className="assets-empty">
          Pick a Furnishes piece in the room, on the shelf or in the outliner to
          see it here.
        </p>
      </div>
    );
  const { node, parent } = found;
  const piece = parent ?? node;
  const parts = piece.children ?? [];
  // what the finish and size apply to: the picked part, or the whole piece
  const whole = node.id === piece.id;
  const target: AssetNode = node;
  const targets = whole && parts.length ? [piece, ...parts] : [target];
  const p = propsOf(target, overrides);
  const apply = (patch: Parameters<typeof setProps>[1]) =>
    targets.forEach((t) => setProps(t.id, patch));
  const inCart = cart.includes(piece.id);
  const label = labels.indexOf(piece.id);
  const labelsFull = label < 0 && labels.length >= LABEL_MAX;

  const dim = (key: "width" | "depth" | "height", text: string) => (
    <label className="room-dim">
      <span className="room-dim-label">{text}</span>
      <input
        type="number"
        className="room-dim-input f-num"
        inputMode="numeric"
        min={10}
        max={6000}
        step={10}
        value={p[key]}
        aria-label={`${target.name} ${key} in millimetres`}
        onChange={(e) => apply({ [key]: Number(e.target.value) })}
      />
      <span className="room-dim-unit">mm</span>
    </label>
  );

  return (
    <div className="detail">
      <section className="detail-head">
        <div className="detail-pic" aria-hidden="true" />
        <div className="detail-title">
          <h3 className="detail-name">{piece.name}</h3>
          <p className="detail-meta">
            {CATEGORY_NAMES[piece.category]}
            {parts.length > 0 && ` · ${parts.length} parts`}
          </p>
        </div>
        {piece.price !== undefined && (
          <span className="detail-price f-num">{sgd(piece.price)}</span>
        )}
      </section>
      <div className="detail-acts">
        <button
          type="button"
          className="main-btn main-btn-primary detail-cart"
          aria-pressed={inCart}
          onClick={() => toggleCart(piece.id)}
        >
          {inCart ? <CheckIcon size={14} /> : <CartIcon size={14} />}
          <span>{inCart ? "In the cart" : "Add to cart"}</span>
        </button>
        <button
          type="button"
          className="main-btn"
          aria-pressed={label >= 0}
          aria-label={
            label >= 0 ? `Label ${label + 1}, for Eva` : "Label for Eva"
          }
          disabled={labelsFull}
          title={
            labelsFull ? `Up to ${LABEL_MAX} labels at a time` : "Label for Eva"
          }
          onClick={() => toggleLabel(piece.id)}
        >
          <TagIcon size={14} />
          <span>{label >= 0 ? `Label ${label + 1}` : "Label"}</span>
        </button>
        <button
          type="button"
          className="main-btn"
          aria-label="Show alone"
          title="Show alone"
          onClick={() => setFocus(piece.id)}
        >
          <ExpandIcon size={14} />
        </button>
      </div>

      {parts.length > 0 && (
        <section className="eva-pref">
          <div className="eva-pref-head">
            <span className="eva-pref-title">Parts</span>
            <span className="detail-of">
              {whole ? "changing all" : `changing ${target.name}`}
            </span>
          </div>
          <div className="detail-parts" role="radiogroup" aria-label="Parts">
            <button
              type="button"
              role="radio"
              className="detail-part"
              aria-checked={whole}
              onClick={() => select(piece.id, false)}
            >
              <span className="detail-part-name">Whole piece</span>
              {piece.price !== undefined && (
                <span className="detail-part-price f-num">
                  {sgd(piece.price)}
                </span>
              )}
            </button>
            {parts.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                className="detail-part"
                aria-checked={c.id === node.id}
                onClick={() => select(c.id, false)}
              >
                <span className="detail-part-name">{c.name}</span>
                {c.price !== undefined && (
                  <span className="detail-part-price f-num">
                    {sgd(c.price)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="eva-pref">
        <div className="eva-pref-head">
          <span className="eva-pref-title">Colour</span>
        </div>
        <div className="eva-swatches" role="radiogroup" aria-label="Colour">
          {COLOURS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              className="eva-swatch"
              aria-checked={p.colour === c.id}
              aria-label={c.name}
              onClick={() => apply({ colour: c.id })}
            >
              <span
                className="eva-swatch-dot"
                style={{ background: c.hex }}
                aria-hidden="true"
              />
              <span className="eva-swatch-name">{c.name}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="eva-pref">
        <div className="eva-pref-head">
          <span className="eva-pref-title">Texture</span>
        </div>
        <div className="eva-chips" role="radiogroup" aria-label="Texture">
          {TEXTURES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              className="assets-chip"
              aria-checked={p.texture === t}
              onClick={() => apply({ texture: t })}
            >
              {t}
            </button>
          ))}
        </div>
      </section>
      <section className="eva-pref">
        <div className="eva-pref-head">
          <span className="eva-pref-title">Size</span>
          <span className="detail-of f-num">
            {p.width} × {p.depth} × {p.height} mm
          </span>
        </div>
        <div className="room-dims">
          {dim("width", "Width")}
          {dim("depth", "Depth")}
          {dim("height", "Height")}
        </div>
      </section>
    </div>
  );
}
