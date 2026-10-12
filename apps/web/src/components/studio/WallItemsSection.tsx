"use client";

import { CloseIcon, PlusIcon } from "./icons";
import { newId } from "./ids";
import { type Wall, WALLS } from "./room-data";
import { activeOf, footprintOf, openingsOf, useRoom } from "./room-store";
import {
  itemCentre,
  itemY,
  useWallItems,
  WALL_ITEM_KINDS,
  WALL_ITEMS,
  type WallItem,
  type WallItemKind,
} from "./wall-items";

/**
 * The Room tab's "On the walls": the outlets and what hangs on the
 * walls, one row each (its wall, where along it, how high) with a
 * remove, and a chip to add each kind. The room starts with a suggested
 * set; the first change makes the list the room's own, and Suggest
 * again goes back. Shown as the room is made, with its openings, and
 * any time after.
 */
export function WallItemsSection({
  index,
  muted,
}: {
  index: string;
  /** a drawn room with no walls yet: nothing to hang things on */
  muted: boolean;
}) {
  const spec = useRoom(activeOf);
  const joins = useRoom((s) => s.joins);
  const setItems = useRoom((s) => s.setItems);
  const items = useWallItems(spec);
  const own = spec.items !== undefined;
  const shell = {
    W: spec.width,
    D: spec.depth,
    outline: footprintOf(spec),
    openings: openingsOf({ joins }, spec),
  };
  const nameOf = (it: WallItem) => {
    const same = items.filter((x) => x.kind === it.kind);
    const n = same.indexOf(it);
    const label = WALL_ITEMS[it.kind].label;
    return same.length > 1 ? `${label} ${n + 1}` : label;
  };
  const change = (id: string, patch: Partial<WallItem>) =>
    setItems(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setItems(items.filter((x) => x.id !== id));
  const add = (kind: WallItemKind) => {
    // on the wall with the fewest things on it, in its middle
    const count = (w: Wall) => items.filter((x) => x.wall === w).length;
    const wall = [...WALLS].sort((a, b) => count(a) - count(b))[0]!;
    setItems([...items, { id: newId(kind), kind, wall, at: null }]);
  };
  return (
    <section className="eva-pref" data-set={!muted} data-muted={muted}>
      <div className="eva-pref-head">
        <span className="eva-pref-index f-num">{index}</span>
        <span className="eva-pref-title">On the walls</span>
        {own && (
          <button
            type="button"
            className="eva-pref-clear"
            onClick={() => setItems(undefined)}
          >
            Suggest again
          </button>
        )}
      </div>
      <p className="eva-pref-hint">
        {muted
          ? "Draw the walls first; outlets and what hangs on them then go on them."
          : own
            ? "Your outlets and what hangs on the walls."
            : "Outlets and what hangs on the walls, suggested for the room: clear of the doors, the windows and tall furniture. Change any to make them your own."}
      </p>
      {!muted &&
        items.map((it) => {
          const name = nameOf(it);
          const c = itemCentre(shell, it);
          return (
            <div
              key={it.id}
              className="room-field room-opening"
              data-kind={it.kind}
            >
              <span className="room-field-label room-opening-head">
                {`${name} on the`}
                <button
                  type="button"
                  className="shell-iconbtn room-opening-remove"
                  aria-label={`Remove ${name}`}
                  onClick={() => remove(it.id)}
                >
                  <CloseIcon size={12} />
                </button>
              </span>
              <div
                className="eva-chips"
                role="radiogroup"
                aria-label={`${name} on the`}
              >
                {WALLS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    role="radio"
                    className="assets-chip"
                    aria-checked={it.wall === w}
                    onClick={() => change(it.id, { wall: w, at: null })}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <div className="room-opening-dims">
                <label className="room-dim">
                  <span className="room-dim-label">Along</span>
                  <input
                    className="room-dim-input"
                    type="number"
                    min={0}
                    step={50}
                    value={Math.round(c.centre)}
                    aria-label={`${name} along its wall in millimetres`}
                    onChange={(e) =>
                      change(it.id, { at: Number(e.target.value) })
                    }
                  />
                  <span className="room-dim-unit">mm</span>
                </label>
                <label className="room-dim">
                  <span className="room-dim-label">Height</span>
                  <input
                    className="room-dim-input"
                    type="number"
                    min={100}
                    max={spec.height - 100}
                    step={50}
                    value={itemY(it)}
                    aria-label={`${name} height in millimetres`}
                    onChange={(e) =>
                      change(it.id, {
                        y: Math.min(
                          spec.height - 100,
                          Math.max(100, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                  <span className="room-dim-unit">mm</span>
                </label>
              </div>
            </div>
          );
        })}
      {!muted && (
        <div className="room-field">
          <span className="room-field-label">Add to a wall</span>
          <div className="eva-chips" role="group" aria-label="Add to a wall">
            {WALL_ITEM_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="assets-chip"
                aria-label={`Add a ${WALL_ITEMS[k].label.toLowerCase()}`}
                onClick={() => add(k)}
              >
                <PlusIcon size={11} /> {WALL_ITEMS[k].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
