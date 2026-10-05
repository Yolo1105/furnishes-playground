"use client";

import { CubeIcon, WallIcon } from "./icons";
import { useGuide } from "./guide-store";
import { useRoom } from "./room-store";
import { ROOM_TEMPLATES, isoFaces, GRID } from "./room-templates";
import { useStudio } from "./studio-store";

/**
 * How the room begins: traced wall by wall on the canvas, or picked from
 * a shape. Draw turns the Wall tool on and offers the how-to; a shape
 * shows the templates as small isometric boxes, the way the catalogue
 * shows pieces.
 */
export function RoomStart() {
  const start = useRoom((s) => s.start);
  const template = useRoom((s) => s.template);
  const drawn = useRoom((s) => s.drawn);
  const cells = useRoom((s) => s.cells);
  const { toggleCell } = useRoom.getState();
  const { setStart, setTemplate } = useRoom.getState();
  const { setTool, setView } = useStudio.getState();
  const show = useGuide((s) => s.show);

  // walls are drawn on the plan: the Wall tool comes on, the main surface
  // turns to 2D, the how-to opens
  const draw = () => {
    setStart("draw");
    setTool("wall");
    setView("2d");
    show("walls");
  };

  return (
    <>
      <div className="room-start" role="radiogroup" aria-label="Start from">
        <button
          type="button"
          role="radio"
          className="room-start-card"
          aria-checked={start === "draw"}
          onClick={draw}
        >
          <WallIcon size={20} />
          <b>Draw walls</b>
          <span>Trace the room on the canvas</span>
        </button>
        <button
          type="button"
          role="radio"
          className="room-start-card"
          aria-checked={start === "template"}
          onClick={() => setStart("template")}
        >
          <CubeIcon size={20} />
          <b>Template</b>
          <span>Pick a shape, then size it</span>
        </button>
      </div>
      {start === "draw" && (
        <p className="eva-pref-hint room-start-hint">
          The Wall tool is on: drag a wall or a corner, or click the canvas to
          trace a new room.
          <button
            type="button"
            className="eva-pref-clear"
            onClick={() => show("walls", true)}
          >
            Show me how
          </button>
        </p>
      )}
      {start === "template" && (
        <div
          className="room-templates"
          role="radiogroup"
          aria-label="Room shape"
        >
          {ROOM_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              className="room-template"
              aria-checked={template === t.id && !drawn}
              onClick={() => setTemplate(t.id)}
            >
              <svg
                viewBox="0 0 120 96"
                className="room-template-iso"
                aria-hidden="true"
              >
                {isoFaces(t.footprint).map((f, i) => (
                  <polygon key={i} points={f.points} data-face={f.kind} />
                ))}
              </svg>
              <span className="room-template-name">{t.name}</span>
            </button>
          ))}
        </div>
      )}
      {start === "template" && template === "grid" && !drawn && (
        <div className="room-grid-wrap">
          <div
            className="room-grid"
            role="group"
            aria-label="Your shape, in squares"
            style={{ ["--cols" as string]: GRID.cols }}
          >
            {Array.from({ length: GRID.rows }, (_, y) =>
              Array.from({ length: GRID.cols }, (_, x) => {
                const on = cells.includes(`${x},${y}`);
                return (
                  <button
                    key={`${x},${y}`}
                    type="button"
                    className="room-grid-cell"
                    aria-pressed={on}
                    aria-label={`Square ${x + 1}, ${y + 1}`}
                    onClick={() => toggleCell(x, y)}
                  />
                );
              }),
            )}
          </div>
          <p className="eva-pref-hint">
            Tap squares into the room; they must hold together. The size below
            stretches the shape.
          </p>
        </div>
      )}
    </>
  );
}
