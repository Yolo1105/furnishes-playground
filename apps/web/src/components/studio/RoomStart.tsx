"use client";

import { CubeIcon, WallIcon } from "./icons";
import { useGuide } from "./guide-store";
import { useRoom } from "./room-store";
import { ROOM_TEMPLATES, isoFaces } from "./room-templates";
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
  const { setStart, setTemplate } = useRoom.getState();
  const setTool = useStudio((s) => s.setTool);
  const show = useGuide((s) => s.show);

  const draw = () => {
    setStart("draw");
    setTool("wall");
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
          The Wall tool is on. Click the canvas to start.
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
              aria-checked={template === t.id}
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
    </>
  );
}
