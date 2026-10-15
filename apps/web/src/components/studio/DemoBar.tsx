"use client";

import { DEMO_SCENES, leaveDemo, pauseDemo, playDemo, skipDemo } from "./demo";
import { useDemo } from "./demo-store";

/**
 * The guided demo's bar over Eva's thread: where it is (the scene of
 * twelve), and Play the demo, Pause or Resume, Next scene, and Leave,
 * which goes back to the project that was open.
 */
export function DemoBar() {
  const played = useDemo((s) => s.played.length);
  const playing = useDemo((s) => s.playing);
  const paused = useDemo((s) => s.paused);
  const done = played >= DEMO_SCENES.length;
  return (
    <div
      className="agent-demo"
      role="group"
      aria-label="Guided demo"
      data-playing={playing}
    >
      <span className="agent-demo-where f-num">
        Guided demo ·{" "}
        {done ? "the end" : `${played + 1} of ${DEMO_SCENES.length}`}
      </span>
      <span className="agent-demo-acts">
        {!playing ? (
          !done && (
            <button
              type="button"
              className="assets-chip"
              onClick={() => void playDemo()}
            >
              Play the demo
            </button>
          )
        ) : (
          <button
            type="button"
            className="assets-chip"
            aria-pressed={paused}
            onClick={() => pauseDemo(!paused)}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        )}
        {!done && (
          <button type="button" className="assets-chip" onClick={skipDemo}>
            Next scene
          </button>
        )}
        <button type="button" className="assets-chip" onClick={leaveDemo}>
          Leave
        </button>
      </span>
    </div>
  );
}
