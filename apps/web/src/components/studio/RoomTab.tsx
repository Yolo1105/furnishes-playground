"use client";

import {
  type BedWall,
  CEILING,
  DOOR_SIZES,
  doorSized,
  FIT_FOR_ROOM,
  FIT_GUIDANCE,
  FLAT_TYPES,
  FLOORS,
  hdbOffset,
  isWindow,
  metres,
  MUST_HAVE_CHOICES,
  type Opening,
  OPENING_KINDS,
  OPENING_WIDTH,
  openingLabel,
  OPENINGS,
  presetOf,
  presetRules,
  PRESETS,
  PRIORITY,
  REVEAL,
  ROOM_NAMES,
  ROOM_SIZE,
  type RoomId,
  RULE_PRESETS,
  rulesFor,
  sameRules,
  SPACING,
  WALKWAY,
  type Wall,
  WALL_TONES,
  WALLS,
  WINDOW_SIZES,
} from "./room-data";
import { CloseIcon, PlusIcon } from "./icons";
import { RoomStart } from "./RoomStart";
import { WALL_RANGE } from "./room-geometry";
import { useStudio } from "./studio-store";
import { openingCentre, wallSpan } from "./room-health";
import {
  activeOf,
  footprintOf,
  nextRoomKind,
  openingsOf,
  roomLabel,
  useRoom,
  wallsOf,
} from "./room-store";

/**
 * The room: which flat, which room in it, how big, where the door and
 * window are, what the floor and walls are. Sizes start from the typical
 * HDB figures for that flat and room and stop following them the moment
 * the visitor types their own. Everything in millimetres, shown in metres.
 *
 * It opens with how the room begins, and the rest follows from that:
 *   template — the shape, then the flat and room (which size it), the
 *              size itself, the openings, the finish;
 *   draw     — the walls (the size comes from them), the flat and room
 *              as what to call it, the openings once there are walls to
 *              put them on, the finish.
 * The openings are a list: each door (hinged, sliding, double, or an
 * open passage) and window on its wall, sized by name or in millimetres,
 * with a row to add another; the plan's Wall tool moves them too.
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
  const st = useRoom();
  /** the active room's fields with the flat's and the actions, as one */
  const s = { ...st, ...activeOf(st) };
  // a typed width or depth lands wall to wall with a neighbour when the
  // magnet is on, as a dragged room does
  const magnet = useStudio((x) => x.magnet);
  const start = s.start;
  const walls = wallsOf(s);
  let n = 0;
  const index = () => String(++n).padStart(2, "0");
  const rooms = (Object.keys(ROOM_NAMES) as RoomId[]).filter(
    (id) => PRESETS[s.flat][id],
  );
  const num = (key: "width" | "depth" | "height" | "thickness") => {
    const range =
      key === "thickness" ? WALL_RANGE : key === "height" ? CEILING : ROOM_SIZE;
    return (
      <label className="room-dim">
        <span className="room-dim-label">
          {key === "width"
            ? "Width"
            : key === "depth"
              ? "Depth"
              : key === "height"
                ? "Height"
                : "Walls"}
        </span>
        <input
          type="number"
          className="room-dim-input f-num"
          inputMode="numeric"
          min={range.min}
          max={range.max}
          step={key === "thickness" ? WALL_RANGE.step : 50}
          value={s[key]}
          aria-label={
            key === "thickness"
              ? "wall thickness in millimetres"
              : `${key} in millimetres`
          }
          onChange={(e) =>
            key === "thickness"
              ? s.set({ thickness: Number(e.target.value) })
              : s.setSize({ [key]: Number(e.target.value) }, magnet)
          }
        />
        <span className="room-dim-unit">mm</span>
      </label>
    );
  };
  /** a wall picker for one opening, or for the one the room lacks (the
      first door or the first window), where a wall adds it */
  const wallPick = (
    label: string,
    picked: Wall | null,
    onWall: (w: Wall) => void,
    none?: { label: string; on: () => void },
  ) => (
    <div className="eva-chips" role="radiogroup" aria-label={label}>
      {WALLS.map((w: Wall) => (
        <button
          key={w}
          type="button"
          role="radio"
          className="assets-chip"
          aria-checked={picked === w}
          onClick={() => onWall(w)}
        >
          {w}
        </button>
      ))}
      {none && (
        <button
          type="button"
          role="radio"
          className="assets-chip"
          aria-checked={picked === null}
          onClick={none.on}
        >
          {none.label}
        </button>
      )}
    </div>
  );
  const shell = { W: s.width, D: s.depth, outline: footprintOf(s) };
  /** the room's openings with the doorways it shares */
  const openings = openingsOf(st, s);
  const firstDoor = openings.find((o) => !isWindow(o)) ?? null;
  const firstWindow = openings.find(isWindow) ?? null;
  /** the room beyond a shared doorway */
  const beyond = (o: Opening) => {
    const j = st.joins.find((x) => x.id === o.join);
    const other = st.rooms.find((r) => r.id === (j?.a === s.id ? j?.b : j?.a));
    return other ? roomLabel(st.rooms, other) : null;
  };
  /** the name an opening's row goes by: its kind, numbered past the
      first; a shared doorway, by the room beyond it */
  const nameOf = (o: Opening) => {
    const to = beyond(o);
    if (to) return `${openingLabel(o.kind)} to the ${to}`;
    const same = s.openings.filter((x) => x.kind === o.kind);
    const n = same.indexOf(o);
    return n === 0 ? openingLabel(o.kind) : `${openingLabel(o.kind)} ${n + 1}`;
  };
  /** the doorways closed up, each a chip away from opening again */
  const closed = st.joins.filter(
    (j) => !j.open && (j.a === s.id || j.b === s.id),
  );
  const openingRow = (o: Opening) => {
    const name = nameOf(o);
    const win = isWindow(o);
    const span = wallSpan(shell, o.wall);
    const offset = hdbOffset(o, s.width, s.depth);
    const sizes = win ? WINDOW_SIZES : DOOR_SIZES;
    const fullWidth = Math.max(
      OPENING_WIDTH.min,
      span.to - span.from - 2 * REVEAL,
    );
    return (
      <div key={o.id} className="room-field room-opening" data-kind={o.kind}>
        <span className="room-field-label room-opening-head">
          {o.join ? name : `${name} on the`}
          <button
            type="button"
            className="shell-iconbtn room-opening-remove"
            aria-label={`Remove ${name}`}
            onClick={() => s.removeOpening(o.id)}
          >
            <CloseIcon size={12} />
          </button>
        </span>
        {!o.join &&
          wallPick(`${name} on the`, o.wall, (w) =>
            s.setOpening(o.id, { wall: w, at: null }),
          )}
        <div
          className="eva-chips room-opening-sizes"
          role="group"
          aria-label={`${name} size`}
        >
          {sizes.map((z) => {
            // a window's size is its width; a doorway's can be its kind too
            const patch =
              z.width === "full"
                ? { width: fullWidth }
                : win
                  ? { width: z.width }
                  : doorSized(o, z as (typeof DOOR_SIZES)[number]);
            const pressed =
              o.width === patch.width &&
              (!("kind" in patch) || o.kind === patch.kind);
            return (
              <button
                key={z.label}
                type="button"
                className="assets-chip"
                aria-pressed={pressed}
                onClick={() => s.setOpening(o.id, patch)}
              >
                {z.label}
              </button>
            );
          })}
        </div>
        <div className="room-opening-dims">
          <label className="room-dim">
            <span className="room-dim-label">Width</span>
            <input
              className="room-dim-input"
              type="number"
              min={OPENING_WIDTH.min}
              max={OPENING_WIDTH.max}
              step={OPENING_WIDTH.step}
              value={o.width}
              aria-label={`${name} width in millimetres`}
              onChange={(e) =>
                s.setOpening(o.id, {
                  width: Math.min(
                    OPENING_WIDTH.max,
                    Math.max(OPENING_WIDTH.min, Number(e.target.value)),
                  ),
                })
              }
            />
            <span className="room-dim-unit">mm</span>
          </label>
          <label className="room-dim">
            <span className="room-dim-label">Centre</span>
            <input
              className="room-dim-input"
              type="number"
              min={0}
              step={OPENING_WIDTH.step}
              value={Math.round(openingCentre(shell, o).centre)}
              aria-label={`${name} centre in millimetres`}
              onChange={(e) =>
                s.setOpening(o.id, { at: Number(e.target.value) })
              }
            />
            <span className="room-dim-unit">mm</span>
          </label>
          {win && (
            <>
              <label className="room-dim">
                <span className="room-dim-label">Sill</span>
                <input
                  className="room-dim-input"
                  type="number"
                  min={0}
                  max={s.height - 300}
                  step={50}
                  value={o.sill ?? OPENINGS.window.sill}
                  aria-label={`${name} sill in millimetres`}
                  onChange={(e) =>
                    s.setOpening(o.id, { sill: Number(e.target.value) })
                  }
                />
                <span className="room-dim-unit">mm</span>
              </label>
              <label className="room-dim">
                <span className="room-dim-label">Head</span>
                <input
                  className="room-dim-input"
                  type="number"
                  min={300}
                  max={s.height}
                  step={50}
                  value={o.head ?? OPENINGS.window.head}
                  aria-label={`${name} head in millimetres`}
                  onChange={(e) =>
                    s.setOpening(o.id, { head: Number(e.target.value) })
                  }
                />
                <span className="room-dim-unit">mm</span>
              </label>
            </>
          )}
        </div>
        {o.hdb && offset !== null && (
          <p className="eva-pref-hint room-opening-note">
            {offset} mm from the corner, as HDB has it
          </p>
        )}
      </div>
    );
  };

  const fit = FIT_FOR_ROOM[s.room].map((k) => FIT_GUIDANCE[s.flat][k]);
  const rules = s.rules;
  const slider = (
    label: string,
    key: "walkway" | "spacing" | "flow" | "open",
    range: { min: number; max: number; step: number },
    shown: string,
    unit = "in millimetres",
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
        aria-label={unit ? `${label} ${unit}` : label}
        aria-valuetext={shown}
        onChange={(e) => s.setRules({ [key]: Number(e.target.value) })}
      />
      <span className="room-rule-value f-num">{shown}</span>
    </label>
  );
  /** a priority's reading: which end it leans to, or balanced */
  const leaning = (v: number, low: string, high: string) =>
    v >= 70 ? `${high} first` : v <= 30 ? `${low} first` : "balanced";
  const preset = presetOf(rules, s.room);

  return (
    <div className="room">
      <section className="eva-pref" data-set={start !== null}>
        <div className="eva-pref-head">
          <span className="eva-pref-index f-num">{index()}</span>
          <span className="eva-pref-title">Start</span>
        </div>
        <div className="room-field">
          <span className="room-field-label room-field-head">
            Rooms
            {st.rooms.length > 1 && (
              <button
                type="button"
                className="eva-pref-clear"
                onClick={() => st.removeRoom(st.activeId)}
              >
                Remove
              </button>
            )}
          </span>
          <div className="eva-chips" role="radiogroup" aria-label="Rooms">
            {st.rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                className="assets-chip"
                aria-checked={r.id === st.activeId}
                onClick={() => st.setActive(r.id)}
              >
                {roomLabel(st.rooms, r)}
              </button>
            ))}
            <button
              type="button"
              className="assets-chip"
              aria-label="Add a room"
              onClick={() => st.addRoom(nextRoomKind(st.flat, st.rooms))}
            >
              <PlusIcon size={11} /> Room
            </button>
          </div>
        </div>
        <RoomStart />
        {start === null && (
          <p className="eva-pref-hint room-start-lead">
            Pick one to go on: a template brings the flat&apos;s typical sizes;
            drawing brings your own.
          </p>
        )}
        {start !== null && (
          <>
            <div className="room-field">
              <span className="room-field-label">Flat</span>
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
            </div>
            <div className="room-field">
              <span className="room-field-label">Room</span>
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
            </div>
            <div className="room-field">
              <span className="room-field-label room-field-head">
                Size
                {start === "draw" && walls > 0 && (
                  <button
                    type="button"
                    className="eva-pref-clear"
                    onClick={s.clearWalls}
                  >
                    Clear
                  </button>
                )}
                {start === "template" && !s.preset && (
                  <button
                    type="button"
                    className="eva-pref-clear"
                    onClick={s.resetSize}
                  >
                    Typical
                  </button>
                )}
              </span>
              <p className="eva-pref-hint room-size">
                {start === "draw" && !s.drawn ? (
                  <>
                    {walls === 0
                      ? "No walls yet"
                      : `${walls} ${walls === 1 ? "wall" : "walls"} so far`}
                    <span className="room-size-note">
                      {" "}
                      · click the plan to set corners; click the first again to
                      close
                    </span>
                  </>
                ) : (
                  <>
                    {start === "draw" ? `${walls} walls · ` : ""}
                    {metres(s.width)} × {metres(s.depth)} · {metres(s.height)}{" "}
                    high
                    <span className="room-size-note">
                      {s.preset
                        ? ` · typical for a ${s.flat}`
                        : start === "draw"
                          ? " · from your drawing"
                          : " · yours"}
                    </span>
                  </>
                )}
              </p>
              {(start === "template" || s.drawn) && (
                <div className="room-dims">
                  {num("width")}
                  {num("depth")}
                  {num("height")}
                  {num("thickness")}
                </div>
              )}
              {fit.length > 0 && (
                <ul className="room-fit" aria-label="What fits">
                  {fit.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
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
                Draw the walls first; the doors and windows then go on them.
              </p>
            )}
            {openings.map(openingRow)}
            {closed.map((j) => {
              const other = st.rooms.find(
                (r) => r.id === (j.a === s.id ? j.b : j.a),
              )!;
              return (
                <div key={j.id} className="room-field room-opening">
                  <span className="room-field-label room-opening-head">
                    Wall to the {roomLabel(st.rooms, other)} · solid
                    <button
                      type="button"
                      className="eva-pref-clear"
                      onClick={() => st.reopenJoin(j.id)}
                    >
                      Open it
                    </button>
                  </span>
                </div>
              );
            })}
            {!firstDoor && (
              <div className="room-field">
                <span className="room-field-label">Door on the</span>
                {wallPick("Door on the", null, (w) => s.addOpening("door", w))}
              </div>
            )}
            {!firstWindow && (
              <div className="room-field">
                <span className="room-field-label">Window on the</span>
                {wallPick(
                  "Window on the",
                  null,
                  (w) => s.addOpening("window", w),
                  { label: "none", on: () => undefined },
                )}
                <p className="eva-pref-hint room-opening-note">
                  {s.room === "kitchen"
                    ? "No window of its own: the service yard has it."
                    : "No window yet: pick a wall to put one in."}
                </p>
              </div>
            )}
            <div className="room-field">
              <span className="room-field-label">Add an opening</span>
              <div
                className="eva-chips"
                role="group"
                aria-label="Add an opening"
              >
                {OPENING_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    className="assets-chip"
                    aria-label={`Add a ${k.label.toLowerCase()}`}
                    onClick={() => s.addOpening(k.id)}
                  >
                    <PlusIcon size={11} /> {k.label}
                  </button>
                ))}
              </div>
              <p className="eva-pref-hint">
                On the plan, the Wall tool drags an opening along its wall and
                pulls its ends; the + strip drops one onto a wall.
              </p>
            </div>
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
            <div className="room-field">
              <span className="room-field-label">Presets</span>
              <div className="eva-chips" role="group" aria-label="Presets">
                {RULE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="assets-chip"
                    aria-pressed={preset === p.id}
                    title={p.note}
                    onClick={() => s.setRules(presetRules(p, s.room))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
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
            {slider(
              "Storage or flow",
              "flow",
              PRIORITY,
              leaning(rules.flow, "storage", "flow"),
              "",
            )}
            {slider(
              "Cosy or open",
              "open",
              PRIORITY,
              leaning(rules.open, "cosy", "open"),
              "",
            )}
            <p className="eva-pref-hint">
              The plan&apos;s health and its layouts keep to these; the two
              priorities decide which layout Eva picks, and Inspect under a
              layout says why.
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
