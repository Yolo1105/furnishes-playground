"use client";

import { Portrait } from "./Portrait";
import { useMemo, useState } from "react";
import { CATEGORY_NAMES, sgd, type AssetCategory } from "./assets-data";
import { products } from "./catalogue";
import {
  droppedJustNow,
  endTileDrag,
  moveTileDrag,
  startOpeningDrag,
  startTileDrag,
} from "./dnd";
import { OpeningGlyph } from "./opening-glyphs";
import { ComponentGlyph } from "./component-glyphs";
import { OPENING_KINDS } from "./room-data";
import { useRoom } from "./room-store";
import {
  describeItem,
  propFor,
  useGenerations,
  type Generation,
} from "./generation-store";
import { BoardIcon, CloseIcon, StarIcon } from "./icons";
import { useBoard } from "./board-store";
import { useScene } from "./scene-store";

/**
 * What the + in the toolbar opens: a strip under the bar with the parts
 * and pieces to put in the room, and the openings to cut in its walls
 * (a door, a sliding or double door, a passage, a window: a click puts
 * one in a wall with room for it, a drag onto the plan puts it where it
 * lands). One line of chips narrows it by
 * category; the last chip, Generate, makes a room item from a few words
 * (a sofa, a plant, a lamp: things that set the scene and are not for
 * sale). With an image and mesh provider connected the item gets a
 * picture and a model; without one it stands as a shape, and the strip
 * says so. Every item made is kept as a tile to use again; a star keeps
 * the ones worth coming back to, and Starred shows only those.
 */
type Chip = "all" | "openings" | AssetCategory | "generate";
/** every category with something to add, All first, Generate last */
const CHIPS: Chip[] = [
  "all",
  "openings",
  ...(Object.keys(CATEGORY_NAMES) as AssetCategory[]).filter((c) =>
    products.some((p) => p.category === c),
  ),
  "generate",
];

export function AddStrip({ onAdded }: { onAdded: (id: string) => void }) {
  const add = useScene((s) => s.addProduct);
  const addItem = useScene((s) => s.addItem);
  const select = useScene((s) => s.select);
  const addOpening = useRoom((s) => s.addOpening);
  const activeId = useRoom((s) => s.activeId);
  const [category, setCategory] = useState<Chip>("all");
  const shown = useMemo(
    () =>
      category === "openings"
        ? []
        : products.filter((p) => category === "all" || p.category === category),
    [category],
  );
  const openings = category === "all" || category === "openings";
  /** a generated item goes into the room; a fresh one keeps the strip
      open so its note and tile can be read, a tile click closes it */
  const place = (g: Generation, close: boolean) => {
    const id = addItem(
      {
        name: g.name,
        category: g.category,
        ...(g.imageUrl ? { image: g.imageUrl } : {}),
        ...(g.modelUrl ? { model: g.modelUrl } : {}),
      },
      activeId,
    );
    select(id, false);
    if (close) onAdded(id);
  };
  return (
    <div
      className="glass shell-menu add-strip"
      role="dialog"
      aria-label="Add to the room"
    >
      <div className="add-strip-chips" role="group" aria-label="Category">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            className="assets-chip"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c === "all"
              ? "All"
              : c === "openings"
                ? "Openings"
                : c === "generate"
                  ? "Generate"
                  : CATEGORY_NAMES[c]}
          </button>
        ))}
      </div>
      {category === "generate" ? (
        <Generate
          onMade={(g) => place(g, false)}
          onPlace={(g) => place(g, true)}
        />
      ) : (
        <div className="add-strip-row no-scrollbar">
          {shown.length === 0 && !openings && (
            <p className="assets-empty">Nothing here matches.</p>
          )}
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="add-tile"
              onPointerDown={(e) => startTileDrag(e, p)}
              onPointerMove={moveTileDrag}
              onPointerUp={endTileDrag}
              onPointerCancel={endTileDrag}
              onClick={() => {
                if (droppedJustNow()) return;
                const id = add(p, activeId);
                select(id, false);
                onAdded(id);
              }}
              aria-label={`Add ${p.name}, ${sgd(p.price)}`}
            >
              <span className="add-tile-pic" aria-hidden="true">
                {p.recipe ? (
                  <Portrait productId={p.id} />
                ) : (
                  <ComponentGlyph id={p.id} />
                )}
              </span>
              <span className="add-tile-name">{p.name}</span>
              <span className="add-tile-price f-num">{sgd(p.price)}</span>
            </button>
          ))}
          {openings &&
            OPENING_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className="add-tile add-tile-opening"
                onPointerDown={(e) => startOpeningDrag(e, k.id)}
                onPointerMove={moveTileDrag}
                onPointerUp={endTileDrag}
                onPointerCancel={endTileDrag}
                onClick={() => {
                  if (droppedJustNow()) return;
                  onAdded(addOpening(k.id));
                }}
                aria-label={`Add a ${k.label.toLowerCase()}, ${k.width} mm`}
              >
                <span className="add-tile-pic" aria-hidden="true">
                  <OpeningGlyph kind={k.id} size={44} />
                </span>
                <span className="add-tile-name">{k.label}</span>
                <span className="add-tile-price f-num">{k.width} mm</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function Generate({
  onMade,
  onPlace,
}: {
  onMade: (g: Generation) => void;
  onPlace: (g: Generation) => void;
}) {
  const generations = useGenerations((s) => s.generations);
  const { add, star, remove } = useGenerations.getState();
  // the board's own array, read here: a fresh array from the selector
  // would never settle
  const pictures = useBoard((s) => s.pictures);
  const kept = pictures.map((p) => p.src);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const tiles = starredOnly
    ? generations.filter((g) => g.starred)
    : generations;

  const make = async () => {
    const words = prompt.trim();
    if (!words || busy) return;
    setBusy(true);
    setNote("");
    const { name, category } = describeItem(words);
    // without a provider's answer: a stock mesh of the thing when there
    // is one, else a shape
    const prop = propFor(words);
    const stand = (why: string) => {
      made = add({
        prompt: words,
        name,
        category,
        ...(prop
          ? { modelUrl: prop, source: "prop" as const }
          : { source: "shape" as const }),
      });
      setNote(
        prop
          ? `${why}; a stock ${name.toLowerCase()} stands in for it.`
          : `${why}; it stands as a shape.`,
      );
    };
    let made: Generation | null = null;
    try {
      const res = await fetch("/api/generate-item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: words }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          imageUrl?: string;
          modelUrl?: string;
        };
        made = add({
          prompt: words,
          name,
          category,
          source: "fal",
          ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
          ...(data.modelUrl ? { modelUrl: data.modelUrl } : {}),
        });
        if (!data.modelUrl)
          setNote("The picture came, the mesh did not: it stands as a shape.");
      } else
        stand(
          res.status === 503
            ? "No image or mesh provider is connected on this server"
            : res.status === 429
              ? "That is the hour's share of generations"
              : "The provider did not answer",
        );
    } catch {
      stand("The provider could not be reached");
    }
    setBusy(false);
    setPrompt("");
    if (made) onMade(made);
  };

  return (
    <div className="add-gen">
      <form
        className="add-gen-form"
        onSubmit={(e) => {
          e.preventDefault();
          void make();
        }}
      >
        <input
          className="room-dim-input add-gen-input"
          value={prompt}
          placeholder="A rattan armchair, a tall fiddle-leaf fig, a paper pendant…"
          aria-label="Describe a room item"
          maxLength={200}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          type="submit"
          className="main-btn main-btn-primary"
          disabled={busy || prompt.trim().length < 2}
          aria-busy={busy}
        >
          <span>{busy ? "Making…" : "Generate"}</span>
        </button>
      </form>
      <p className="add-gen-hint">
        {note ||
          "Room items set the scene and are not for sale: a sofa, a plant, a lamp. A picture and a mesh come from fal.ai when it is connected."}
      </p>
      {generations.length > 0 && (
        <div className="add-gen-head">
          <span className="add-gen-label">
            {starredOnly ? "Starred" : "Generated"} · {tiles.length}
          </span>
          <button
            type="button"
            className="assets-chip"
            aria-pressed={starredOnly}
            onClick={() => setStarredOnly((v) => !v)}
          >
            <StarIcon size={12} /> Starred
          </button>
        </div>
      )}
      <div className="add-strip-row no-scrollbar">
        {tiles.length === 0 && generations.length > 0 && (
          <p className="assets-empty">Nothing starred yet.</p>
        )}
        {tiles.map((g) => (
          <div
            key={g.id}
            className="add-tile add-tile-gen"
            data-starred={g.starred}
          >
            <button
              type="button"
              className="add-tile-pic add-tile-pic-btn"
              aria-label={`Add ${g.name}`}
              style={
                g.imageUrl
                  ? { backgroundImage: `url("${g.imageUrl}")` }
                  : undefined
              }
              onClick={() => onPlace(g)}
            />
            <button
              type="button"
              className="add-tile-star"
              aria-label={g.starred ? `Unstar ${g.name}` : `Star ${g.name}`}
              aria-pressed={g.starred}
              onClick={() => star(g.id)}
            >
              <StarIcon size={12} />
            </button>
            <button
              type="button"
              className="add-tile-star add-tile-x"
              aria-label={`Forget ${g.name}`}
              onClick={() => remove(g.id)}
            >
              <CloseIcon size={11} />
            </button>
            {g.imageUrl && (
              <button
                type="button"
                className="add-tile-star add-tile-keep"
                aria-label={`Keep the picture of ${g.name} on the board`}
                aria-pressed={kept.includes(g.imageUrl)}
                disabled={kept.includes(g.imageUrl)}
                onClick={() => {
                  const why = useBoard.getState().add({
                    src: g.imageUrl!,
                    title: g.name,
                    note: g.prompt,
                    from: "item",
                  });
                  setNote(why ?? `${g.name} is on the board.`);
                }}
              >
                <BoardIcon size={11} />
              </button>
            )}
            <span className="add-tile-name">{g.name}</span>
            <span className="add-tile-price">
              {g.source === "shape"
                ? "shape"
                : g.source === "prop"
                  ? "stock mesh"
                  : g.modelUrl
                    ? "mesh"
                    : "picture"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
