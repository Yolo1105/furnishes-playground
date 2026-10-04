"use client";

import {
  CEILING,
  FIT_FOR_ROOM,
  FIT_GUIDANCE,
  FLAT_TYPES,
  FLOORS,
  metres,
  MUST_HAVE_CHOICES,
  PRESETS,
  ROOM_NAMES,
  rulesFor,
  sameRules,
  SPACING,
  type BedWall,
  type RoomId,
  type Wall,
  WALKWAY,
  WALL_TONES,
  WALLS,
} from "./room-data";
import { RoomStart } from "./RoomStart";
import { useRoom, wallsOf } from "./room-store";

/**
 * The room: which flat, which room in it, how big, where the door and
 * window are, what the floor and walls are. Sizes start from the typical
 * HDB figures for that flat and room and stop following them the moment
 * the visitor types their own. Everything in millimetres, shown in metres.
 *
 * It opens with how the room begins, and the rest follows from that:
 *   template — the shape, then the flat and room (which size it), the
 *              size itself, the door and window, the finish;
 *   draw     — the walls (the size comes from them), the flat and room
 *              as what to call it, the door and window once there are
 *              walls to put them on, the finish.
 * Before the choice, only the choice. The Rules come last: the walkway,
 * what is kept clear, a bed against a wall, what the room must have, and
 * how far apart a layout spreads the pieces; the plan's health and its
 * layouts keep to them.
 */
const BED_WALL: { id: BedWall; label: string }[] = [
  { id: "prefer", label: "Preferred" },
  { id: "required", label: "Required" },
  { id: "off", label: "Off" },
];
export function RoomTab() {
  const s = useRoom();
  const start = s.start;
  const walls = wallsOf(s);
  let n = 0;
  const index = () => String(++n).padStart(2, "0");
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
            onClick={() =>
              s.set(
                key === "door" ? { door: w, doorOffset: null } : { window: w },
              )
            }
          >
            {w}
          </button>
        ))}
        {key === "window" && (
          <button
            type="button"
            role="radio"
            className="assets-chip"
            aria-checked={s.window === null}
            onClick={() => s.set({ window: null })}
          >
            none
          </button>
        )}
      </div>
      {key === "door" && s.doorOffset !== null && (
        <p className="eva-pref-hint room-opening-note">
          {s.doorOffset} mm from the corner, as HDB has it
        </p>
      )}
      {key === "window" && s.window === null && (
        <p className="eva-pref-hint room-opening-note">
          No window of its own: the service yard has it.
        </p>
      )}
    </div>
  );
  const fit = FIT_FOR_ROOM[s.room].map((k) => FIT_GUIDANCE[s.flat][k]);
  const rules = s.rules;
  const slider = (
    label: string,
    key: "walkway" | "spacing",
    range: { min: number; max: number; step: number },
    shown: string,
  ) => (
    <label className="room-field room-rule-row">
      <span className="room-field-label">{label}</span>
      <input
        type="range"
        className="room-range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={rules[key]}
        aria-label={`${label} in millimetres`}
        onChange={(e) => s.setRules({ [key]: Number(e.target.value) })}
      />
      <span className="room-rule-value f-num">{shown}</span>
    </label>
  );

  return (
    <div className="room">
      <section className="eva-pref" data-set={start !== null}>
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">{index()}</span>
          <span className="eva-pref-title">Start</span>
        </div>
        <RoomStart />
      </section>

      {start === null && (
        <p className="eva-pref-hint room-start-lead">
          Pick one to go on: a template brings the flat&apos;s typical sizes;
          drawing brings your own.
        </p>
      )}
      {start === "draw" && (
        <section className="eva-pref" data-set={walls > 0}>
          <div className="eva-pref-head">
            <span className="eva-pref-index f-num">{index()}</span>
            <span className="eva-pref-title">Walls</span>
            {walls > 0 && (
              <button
                type="button"
                className="eva-pref-clear"
                onClick={s.clearWalls}
              >
                Clear
              </button>
            )}
          </div>
          <p className="eva-pref-hint room-size">
            {walls === 0
              ? "No walls yet"
              : s.drawn
                ? `${walls} walls · ${metres(s.width)} × ${metres(s.depth)}`
                : `${walls} ${walls === 1 ? "wall" : "walls"} so far`}
            <span className="room-size-note">
              {s.drawn
                ? " · from your drawing"
                : " · click the plan to set corners; click the first again to close"}
            </span>
          </p>
        </section>
      )}
      {start !== null && (
        <>
          <section className="eva-pref" data-set="true">
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{index()}</span>
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
            <p className="eva-pref-hint">
              {start === "draw"
                ? "HDB · Singapore · so Eva knows which flat this is"
                : "HDB · Singapore"}
            </p>
          </section>
          <section className="eva-pref" data-set="true">
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{index()}</span>
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
        </>
      )}
      {start === "template" && (
        <>
          <section className="eva-pref" data-set="true">
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{index()}</span>
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
            {fit.length > 0 && (
              <ul className="room-fit" aria-label="What fits">
                {fit.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {start !== null && (
        <>
          <section
            className="eva-pref"
            data-set={start === "template" || walls > 0}
            data-muted={start === "draw" && walls === 0}
          >
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{index()}</span>
              <span className="eva-pref-title">Openings</span>
            </div>
            {start === "draw" && walls === 0 && (
              <p className="eva-pref-hint">
                Draw the walls first; the door and window then go on them.
              </p>
            )}
            {wallPick("door", "Door on the")}
            {wallPick("window", "Window on the")}
          </section>
          <section className="eva-pref" data-set="true">
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{index()}</span>
              <span className="eva-pref-title">Rules</span>
              {!sameRules(rules, rulesFor(s.room)) && (
                <button
                  type="button"
                  className="eva-pref-clear"
                  onClick={s.resetRules}
                >
                  Typical
                </button>
              )}
            </div>
            {slider("Walkway", "walkway", WALKWAY, `${rules.walkway} mm`)}
            <div className="room-field">
              <span className="room-field-label">Keep clear</span>
              <div className="eva-chips" role="group" aria-label="Keep clear">
                <button
                  type="button"
                  className="assets-chip"
                  aria-pressed={rules.doorClear}
                  onClick={() => s.setRules({ doorClear: !rules.doorClear })}
                >
                  Door swing
                </button>
                <button
                  type="button"
                  className="assets-chip"
                  aria-pressed={rules.windowClear}
                  onClick={() =>
                    s.setRules({ windowClear: !rules.windowClear })
                  }
                >
                  Window
                </button>
              </div>
            </div>
            <div className="room-field">
              <span className="room-field-label">Bed against a wall</span>
              <div
                className="eva-chips"
                role="radiogroup"
                aria-label="Bed against a wall"
              >
                {BED_WALL.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    className="assets-chip"
                    aria-checked={rules.bedWall === o.id}
                    onClick={() => s.setRules({ bedWall: o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="room-field">
              <span className="room-field-label">Must have</span>
              <div className="eva-chips" role="group" aria-label="Must have">
                {MUST_HAVE_CHOICES.map((c) => {
                  const on = rules.mustHave.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className="assets-chip"
                      aria-pressed={on}
                      onClick={() =>
                        s.setRules({
                          mustHave: on
                            ? rules.mustHave.filter((k) => k !== c.key)
                            : [...rules.mustHave, c.key],
                        })
                      }
                    >
                      {c.key}
                    </button>
                  );
                })}
              </div>
            </div>
            {slider(
              "Spacing",
              "spacing",
              { min: 0, ...SPACING },
              rules.spacing === 0 ? "snug" : `+${rules.spacing} mm`,
            )}
            <p className="eva-pref-hint">
              The plan&apos;s health and its layouts keep to these.
            </p>
          </section>
          <section className="eva-pref" data-set="true">
            <div className="eva-pref-head">
              <span className="eva-pref-index f-num">{index()}</span>
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
        </>
      )}
    </div>
  );
}
