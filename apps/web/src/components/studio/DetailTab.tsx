"use client";

import { CATEGORY_NAMES, sgd } from "./assets-data";
import { COLOURS, TEXTURES } from "./piece-detail";
import { findNode, propsOf, useScene } from "./scene-store";

/**
 * The piece in hand: what it is, what it costs, and what can be changed.
 * A piece built from components lists them; picking one brings up its
 * colour, texture and size. A piece with no components is changed as a
 * whole. Changes sit over the piece's defaults in the scene store.
 */
export function DetailTab() {
  const groups = useScene((s) => s.groups);
  const selectedId = useScene((s) => s.selectedId);
  const overrides = useScene((s) => s.overrides);
  const { select, setProps } = useScene.getState();
  const found = findNode(groups, selectedId);
  if (!found || found.node.kind !== "piece")
    return (
      <p className="assets-empty">
        Pick a Furnishes piece in the room, on the shelf or in the outliner.
      </p>
    );
  const { node, parent } = found;
  const piece = parent ?? node;
  const parts = piece.children ?? [];
  const target = node.children?.length ? null : node;
  const p = target ? propsOf(target, overrides) : null;
  const dim = (key: "width" | "depth" | "height", label: string) => (
    <label className="room-dim">
      <span className="room-dim-label">{label}</span>
      <input
        type="number"
        className="room-dim-input f-num"
        inputMode="numeric"
        min={10}
        max={6000}
        step={10}
        value={p![key]}
        aria-label={`${target!.name} ${key} in millimetres`}
        onChange={(e) =>
          setProps(target!.id, { [key]: Number(e.target.value) })
        }
      />
      <span className="room-dim-unit">mm</span>
    </label>
  );
  return (
    <div className="detail">
      <section className="eva-pref" data-set="true">
        <div className="eva-pref-head">
          <span className="eva-pref-title detail-name">{piece.name}</span>
          {piece.price !== undefined && (
            <span className="detail-price f-num">{sgd(piece.price)}</span>
          )}
        </div>
        <p className="eva-pref-hint detail-meta">
          {CATEGORY_NAMES[piece.category]}
          {parts.length > 0 && ` · ${parts.length} components`}
        </p>
      </section>

      {parts.length > 0 && (
        <section className="eva-pref">
          <div className="eva-pref-head">
            <span className="eva-pref-title">Components</span>
          </div>
          <div
            className="detail-parts"
            role="radiogroup"
            aria-label="Components"
          >
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
          {!target && (
            <p className="eva-pref-hint">Pick a component to change it.</p>
          )}
        </section>
      )}

      {target && p && (
        <>
          <section className="eva-pref">
            <div className="eva-pref-head">
              <span className="eva-pref-title">
                Colour
                {parent && <span className="detail-of"> · {target.name}</span>}
              </span>
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
                  onClick={() => setProps(target.id, { colour: c.id })}
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
                  onClick={() => setProps(target.id, { texture: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>
          <section className="eva-pref">
            <div className="eva-pref-head">
              <span className="eva-pref-title">Size</span>
            </div>
            <div className="room-dims">
              {dim("width", "Width")}
              {dim("depth", "Depth")}
              {dim("height", "Height")}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
