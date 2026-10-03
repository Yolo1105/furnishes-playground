"use client";

import {
  CEILING,
  FLAT_TYPES,
  FLOORS,
  PRESETS,
  ROOM_NAMES,
  WALL_TONES,
  WALLS,
  metres,
  type RoomId,
  type Wall,
} from "./room-data";
import { useRoom } from "./room-store";

/**
 * The room: which flat, which room in it, how big, where the door and
 * window are, what the floor and walls are. Sizes start from the typical
 * HDB figures for that flat and room and stop following them the moment
 * the visitor types their own. Everything in millimetres, shown in metres.
 */
export function RoomTab() {
  const s = useRoom();
  const rooms = (Object.keys(ROOM_NAMES) as RoomId[]).filter(
    (id) => PRESETS[s.flat][id],
  );
  const num = (key: "width" | "depth" | "height") => (
    <label className="room-dim">
      <span className="room-dim-label">
        {key === "width" ? "Width" : key === "depth" ? "Depth" : "Height"}
      </span>
      <input
        type="number"
        className="room-dim-input f-num"
        inputMode="numeric"
        min={key === "height" ? CEILING.min : 1500}
        max={key === "height" ? CEILING.max : 12000}
        step={50}
        value={s[key]}
        aria-label={`${key} in millimetres`}
        onChange={(e) => s.setSize({ [key]: Number(e.target.value) })}
      />
      <span className="room-dim-unit">mm</span>
    </label>
  );
  const wallPick = (key: "door" | "window", label: string) => (
    <div className="room-field">
      <span className="room-field-label">{label}</span>
      <div className="eva-chips" role="radiogroup" aria-label={label}>
        {WALLS.map((w: Wall) => (
          <button
            key={w}
            type="button"
            role="radio"
            className="assets-chip"
            aria-checked={s[key] === w}
            onClick={() => s.set({ [key]: w })}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="room">
      <section className="eva-pref" data-set="true">
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">01</span>
          <span className="eva-pref-title">Flat</span>
        </div>
        <div
          className="main-seg room-seg"
          role="radiogroup"
          aria-label="Flat type"
        >
          {FLAT_TYPES.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              className="main-seg-btn"
              aria-checked={s.flat === f}
              onClick={() => s.setFlat(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <p className="eva-pref-hint">HDB · Singapore</p>
      </section>

      <section className="eva-pref" data-set="true">
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">02</span>
          <span className="eva-pref-title">Room</span>
        </div>
        <div className="eva-chips" role="radiogroup" aria-label="Room">
          {rooms.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              className="assets-chip"
              aria-checked={s.room === id}
              onClick={() => s.setRoom(id)}
            >
              {ROOM_NAMES[id]}
            </button>
          ))}
        </div>
      </section>

      <section className="eva-pref" data-set="true">
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">03</span>
          <span className="eva-pref-title">Size</span>
          {!s.preset && (
            <button
              type="button"
              className="eva-pref-clear"
              onClick={s.resetSize}
            >
              Typical
            </button>
          )}
        </div>
        <p className="eva-pref-hint room-size">
          {metres(s.width)} × {metres(s.depth)} · {metres(s.height)} high
          <span className="room-size-note">
            {s.preset ? ` · typical for a ${s.flat}` : " · yours"}
          </span>
        </p>
        <div className="room-dims">
          {num("width")}
          {num("depth")}
          {num("height")}
        </div>
      </section>

      <section className="eva-pref" data-set="true">
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">04</span>
          <span className="eva-pref-title">Openings</span>
        </div>
        {wallPick("door", "Door on the")}
        {wallPick("window", "Window on the")}
      </section>

      <section className="eva-pref" data-set="true">
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">05</span>
          <span className="eva-pref-title">Finish</span>
        </div>
        <div className="room-field">
          <span className="room-field-label">Floor</span>
          <div className="eva-chips" role="radiogroup" aria-label="Floor">
            {FLOORS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                className="assets-chip"
                aria-checked={s.floor === f}
                onClick={() => s.set({ floor: f })}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="room-field">
          <span className="room-field-label">Walls</span>
          <div
            className="eva-swatches"
            role="radiogroup"
            aria-label="Wall tone"
          >
            {WALL_TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                className="eva-swatch"
                aria-checked={s.wallTone === t.id}
                aria-label={t.name}
                onClick={() => s.set({ wallTone: t.id })}
              >
                <span
                  className="eva-swatch-dot"
                  style={{ background: t.hex }}
                  aria-hidden="true"
                />
                <span className="eva-swatch-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
