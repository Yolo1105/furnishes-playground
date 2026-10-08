"use client";

import {
  type Added,
  backGroove,
  carcassPanels,
  type Feature,
  featureLabel,
  freeId,
  hingeCups,
  innerFace,
  middleCutout,
  newPanel,
  type Panel,
  systemHoles,
} from "@furnishes/domain";
import { CATEGORY_NAMES, sgd, type AssetNode } from "./assets-data";
import {
  CartIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  ExpandIcon,
  ExportIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  RotateIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from "./icons";
import { usePieceActions } from "./piece-actions";
import {
  carcassOf,
  COLOURS,
  LABEL_MAX,
  PLACE_SNAP,
  TEXTURES,
  turned,
  isSquare,
  normTurn,
  ROTATE_SNAP,
  squared,
} from "./piece-detail";
import { portraitOf, recipeOf } from "./catalogue";
import { exportCutList, exportPanelDxf } from "./machining";
import { ProductPage } from "./ProductPage";
import { findNode, propsOf, useScene } from "./scene-store";
import { useStudio } from "./studio-store";

/**
 * The piece in hand, as a product page in the panel: its picture, name
 * and price (an estimate, counted from its parts), what it is, and what
 * can be done with it (cart, a label for Eva, a look at it alone); for
 * a Furnishes piece, its product page (see ProductPage). A piece built from parts lists them under
 * "Whole piece": editing the whole piece changes every part; picking a
 * part changes that part. Then where it stands and which way it turns
 * (locked, it stays put; hidden, it leaves the stage but not the room;
 * removed, it leaves the room), the finish, colour and texture, and the
 * size, all kept over the defaults in the scene store.
 */
export function DetailTab() {
  const groups = useScene((s) => s.groups);
  const selectedId = useScene((s) => s.selectedId);
  const overrides = useScene((s) => s.overrides);
  const cart = useScene((s) => s.cart);
  const labels = useScene((s) => s.labels);
  const panelId = useScene((s) => s.panelId);
  const {
    select,
    selectPanel,
    setProps,
    setPanels,
    toggleCart,
    toggleLabel,
    removeNode,
  } = useScene.getState();
  const setFocus = useStudio((s) => s.setFocus);
  const stage = usePieceActions();
  const found = findNode(groups, selectedId);
  if (!found || found.node.kind === "fixed")
    return (
      <div className="detail-empty">
        <p className="assets-empty">
          Pick a piece or a room item in the room, on the shelf or in the
          outliner to see it here.
        </p>
      </div>
    );
  const { node, parent } = found;
  const piece = parent ?? node;
  // a room item sets the scene and is not for sale: no cart, no finish
  const item = piece.kind !== "piece";
  const parts = piece.children ?? [];
  // what the finish and size apply to: the picked part, or the whole piece
  const whole = node.id === piece.id;
  const target: AssetNode = node;
  const targets = whole && parts.length ? [piece, ...parts] : [target];
  const p = propsOf(target, overrides);
  const apply = (patch: Parameters<typeof setProps>[1]) =>
    targets.forEach((t) => setProps(t.id, patch));
  const inCart = cart.includes(piece.id);
  const recipe = recipeOf(piece);
  const portrait = portraitOf(piece);
  const label = labels.indexOf(piece.id);
  const labelsFull = label < 0 && labels.length >= LABEL_MAX;
  // where the whole piece stands: its own place, or the layout's
  const whole_ = propsOf(piece, overrides);
  const spot = stage.spots.get(piece.id) ?? { x: 0, y: 0 };
  // typed in millimetres, a place is taken as typed: no grid, no magnet
  const place = (patch: { x?: number; y?: number }) =>
    setProps(piece.id, {
      x: Math.round(patch.x ?? spot.x),
      y: Math.round(patch.y ?? spot.y),
    });

  // the piece as panels: a carcass can be opened; the picked panel is
  // typed in millimetres, in the piece's frame about its middle
  const carcass = whole && !item ? carcassOf(piece) : null;
  const panels = whole ? whole_.panels : undefined;
  const panel = panels?.find((x) => x.id === panelId);
  const changePanels = (next: Panel[]) => setPanels(piece.id, next);
  const editPanel = (patch: Partial<Panel>) =>
    panel &&
    changePanels(
      panels!.map((x) => (x.id === panel.id ? { ...x, ...patch } : x)),
    );
  const add = (kind: Added) => {
    const made = newPanel(panels ?? [], kind);
    changePanels([...(panels ?? []), made]);
    selectPanel(made.id);
  };
  // the picked panel's machining: a preset laid on its inner face, or
  // one feature taken off
  const machine = (made: (has: Feature[]) => Feature[]) =>
    panel &&
    editPanel({
      features: [...(panel.features ?? []), ...made(panel.features ?? [])],
    });
  const PRESETS: [string, (p: Panel) => Feature[]][] = [
    [
      "Shelf pins",
      (p) =>
        systemHoles(p, p.features).map((h) => ({ ...h, face: innerFace(p) })),
    ],
    ["Hinge cups", (p) => hingeCups(p, p.features)],
    [
      "Back groove",
      (p) => [{ ...backGroove(p, p.features), face: innerFace(p) }],
    ],
    ["Cut-out", (p) => [middleCutout(p, p.features)]],
  ];
  const panelNum = (
    text: string,
    value: number,
    label: string,
    onChange: (v: number) => void,
    step = 1,
  ) => (
    <label className="room-dim" key={label}>
      <span className="room-dim-label">{text}</span>
      <input
        type="number"
        className="room-dim-input f-num"
        inputMode="numeric"
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="room-dim-unit">mm</span>
    </label>
  );
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
        <div
          className="detail-pic"
          aria-hidden="true"
          data-portrait={!piece.image && portrait !== undefined}
          style={
            piece.image || portrait
              ? { backgroundImage: `url("${piece.image ?? portrait}")` }
              : undefined
          }
        />
        <div className="detail-title">
          <h3 className="detail-name">{piece.name}</h3>
          <p className="detail-meta">
            {CATEGORY_NAMES[piece.category]}
            {item && " · room item"}
            {parts.length > 0 && ` · ${parts.length} parts`}
          </p>
        </div>
        {piece.price !== undefined && (
          <span className="detail-price f-num">
            {sgd(piece.price)}
            {recipe && <small>estimate</small>}
          </span>
        )}
      </section>
      <div className="detail-acts">
        {!item && (
          <button
            type="button"
            className="main-btn main-btn-primary detail-cart"
            aria-pressed={inCart}
            onClick={() => toggleCart(piece.id)}
          >
            {inCart ? <CheckIcon size={14} /> : <CartIcon size={14} />}
            <span>{inCart ? "In the cart" : "Add to cart"}</span>
          </button>
        )}
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

      {recipe && whole && <ProductPage recipe={recipe} />}

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
          <span className="eva-pref-title">Place</span>
          <span className="detail-of f-num">
            {spot.x} · {spot.y} mm · {whole_.rotation}°
          </span>
        </div>
        <div className="room-dims detail-place">
          <label className="room-dim">
            <span className="room-dim-label">West</span>
            <input
              type="number"
              className="room-dim-input f-num"
              inputMode="numeric"
              step={PLACE_SNAP}
              value={spot.x}
              aria-label={`${piece.name} from the west wall in millimetres`}
              onChange={(e) => place({ x: Number(e.target.value) })}
            />
            <span className="room-dim-unit">mm</span>
          </label>
          <label className="room-dim">
            <span className="room-dim-label">North</span>
            <input
              type="number"
              className="room-dim-input f-num"
              inputMode="numeric"
              step={PLACE_SNAP}
              value={spot.y}
              aria-label={`${piece.name} from the north wall in millimetres`}
              onChange={(e) => place({ y: Number(e.target.value) })}
            />
            <span className="room-dim-unit">mm</span>
          </label>
          <label className="room-dim">
            <span className="room-dim-label">Turn</span>
            <input
              type="number"
              className="room-dim-input f-num"
              inputMode="numeric"
              min={0}
              max={359}
              step={ROTATE_SNAP}
              value={whole_.rotation}
              disabled={whole_.locked}
              aria-label={`${piece.name} turn in degrees`}
              onChange={(e) =>
                setProps(piece.id, {
                  rotation: normTurn(Number(e.target.value)),
                })
              }
            />
            <span className="room-dim-unit">°</span>
          </label>
        </div>
        <div className="detail-acts detail-place-acts">
          <button
            type="button"
            className="main-btn"
            disabled={whole_.locked}
            onClick={() =>
              setProps(piece.id, { rotation: turned(whole_.rotation) })
            }
          >
            <RotateIcon size={14} />
            <span>Turn</span>
          </button>
          {!isSquare(whole_.rotation) && (
            <button
              type="button"
              className="main-btn"
              disabled={whole_.locked}
              aria-label="Square to the walls"
              onClick={() =>
                setProps(piece.id, { rotation: squared(whole_.rotation) })
              }
            >
              <span>Square</span>
            </button>
          )}
          <button
            type="button"
            className="main-btn"
            aria-pressed={whole_.locked}
            onClick={() => setProps(piece.id, { locked: !whole_.locked })}
          >
            <LockIcon size={14} />
            <span>{whole_.locked ? "Locked" : "Lock"}</span>
          </button>
          <button
            type="button"
            className="main-btn"
            aria-pressed={whole_.hidden}
            onClick={() => setProps(piece.id, { hidden: !whole_.hidden })}
          >
            {whole_.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            <span>{whole_.hidden ? "Hidden" : "Hide"}</span>
          </button>
          <button
            type="button"
            className="main-btn"
            aria-label={`Remove ${piece.name} from the room`}
            onClick={() => removeNode(piece.id)}
          >
            <TrashIcon size={14} />
            <span>Remove</span>
          </button>
        </div>
      </section>
      {!item && (
        <>
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
        </>
      )}
      <section className="eva-pref">
        <div className="eva-pref-head">
          <span className="eva-pref-title">Size</span>
          <span className="detail-of f-num">
            {p.width} × {p.depth} × {p.height} mm
            {panels && " · from its panels"}
          </span>
        </div>
        {!panels && (
          <div className="room-dims">
            {dim("width", "Width")}
            {dim("depth", "Depth")}
            {dim("height", "Height")}
          </div>
        )}
      </section>
      {carcass && (
        <section className="eva-pref" aria-label="Panels">
          <div className="eva-pref-head">
            <span className="eva-pref-title">Panels</span>
            <span className="detail-of f-num">
              {panels
                ? `${panels.length} panels · ${sgd(piece.price ?? 0)} estimate`
                : "as the recipe draws it"}
            </span>
          </div>
          {!panels ? (
            <div className="detail-acts">
              <button
                type="button"
                className="main-btn"
                onClick={() =>
                  setPanels(
                    piece.id,
                    carcassPanels({
                      width: p.width,
                      depth: p.depth,
                      height: p.height,
                      ...carcass,
                    }),
                  )
                }
              >
                <PlusIcon size={14} />
                <span>Open as panels</span>
              </button>
            </div>
          ) : (
            <>
              <div
                className="detail-parts"
                role="radiogroup"
                aria-label="Panels"
              >
                {panels.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    className="detail-part"
                    aria-checked={x.id === panelId}
                    onClick={() => selectPanel(x.id === panelId ? null : x.id)}
                  >
                    <span className="detail-part-name">{x.name}</span>
                    <span className="detail-part-price f-num">
                      {x.length} × {x.width} × {x.thickness}
                    </span>
                  </button>
                ))}
              </div>
              {panel && (
                <>
                  <div className="room-dims detail-panel">
                    {panelNum(
                      "Length",
                      panel.length,
                      `${panel.name} length in millimetres`,
                      (length) => editPanel({ length }),
                    )}
                    {panelNum(
                      "Width",
                      panel.width,
                      `${panel.name} width in millimetres`,
                      (width) => editPanel({ width }),
                    )}
                    {panelNum(
                      "Thick",
                      panel.thickness,
                      `${panel.name} thickness in millimetres`,
                      (thickness) => editPanel({ thickness }),
                    )}
                  </div>
                  <div className="room-dims detail-panel">
                    {(["Across", "Up", "Out"] as const).map((text, i) =>
                      panelNum(
                        text,
                        panel.position[i]!,
                        `${panel.name} ${text.toLowerCase()} in millimetres`,
                        (v) => {
                          const position = [
                            ...panel.position,
                          ] as Panel["position"];
                          position[i] = v;
                          editPanel({ position });
                        },
                        PLACE_SNAP,
                      ),
                    )}
                  </div>
                  <div className="detail-acts">
                    <button
                      type="button"
                      className="main-btn"
                      onClick={() => {
                        const made: Panel = {
                          ...panel,
                          id: freeId(panels, panel.name.toLowerCase()),
                          position: [
                            panel.position[0],
                            panel.position[1] + panel.thickness * 2,
                            panel.position[2],
                          ],
                        };
                        changePanels([...panels, made]);
                        selectPanel(made.id);
                      }}
                    >
                      <CopyIcon size={14} />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      className="main-btn"
                      aria-label={`Remove ${panel.name}`}
                      onClick={() =>
                        changePanels(panels.filter((x) => x.id !== panel.id))
                      }
                    >
                      <TrashIcon size={14} />
                      <span>Remove</span>
                    </button>
                    <button
                      type="button"
                      className="main-btn"
                      aria-label={`${panel.name} as DXF`}
                      onClick={() => exportPanelDxf(piece.name, panel)}
                    >
                      <ExportIcon size={14} />
                      <span>DXF</span>
                    </button>
                  </div>
                  <div className="eva-pref-head">
                    <span className="eva-pref-title">Machining</span>
                    <span className="detail-of">
                      {panel.features?.length
                        ? `${panel.features.length} on ${panel.name}`
                        : "none yet"}
                    </span>
                  </div>
                  {panel.features && panel.features.length > 0 && (
                    <ul className="detail-features" aria-label="Machining">
                      {panel.features.map((x) => (
                        <li key={x.id}>
                          <span>{featureLabel(x)}</span>
                          <button
                            type="button"
                            className="shell-iconbtn"
                            aria-label={`Remove ${x.id}`}
                            onClick={() =>
                              editPanel({
                                features: panel.features!.filter(
                                  (y) => y.id !== x.id,
                                ),
                              })
                            }
                          >
                            <CloseIcon size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="detail-acts">
                    {PRESETS.map(([name, made]) => (
                      <button
                        key={name}
                        type="button"
                        className="main-btn"
                        onClick={() => machine(() => made(panel))}
                      >
                        <PlusIcon size={14} />
                        <span>{name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="detail-acts">
                {(["shelf", "divider", "door", "back"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="main-btn"
                    onClick={() => add(k)}
                  >
                    <PlusIcon size={14} />
                    <span>{k[0]!.toUpperCase() + k.slice(1)}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="main-btn"
                  onClick={() => exportCutList(piece.name, panels)}
                >
                  <ExportIcon size={14} />
                  <span>Cut list</span>
                </button>
                <button
                  type="button"
                  className="main-btn"
                  onClick={() => setPanels(piece.id, undefined)}
                >
                  <span>Back to the recipe</span>
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
