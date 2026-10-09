import { useStudio } from "./studio-store";

/**
 * The by-hand checks of docs/plan-realism.md as a guided list
 * (`/rounded?check=webgpu`, CheckPanel.tsx): each sets the view it
 * needs, says what to look at, and names the stage attributes to read
 * off while it is looked at. The results and the attributes go into
 * the report the panel copies out.
 */
export type Check = {
  id: string;
  title: string;
  /** what to look at, in a sentence or two */
  look: string;
  /** the stage attributes worth reading while looking */
  reads: readonly string[];
  /** the view set up for the look, when one is needed */
  set?: () => void;
};

const st = () => useStudio.getState();

export const CHECKS: readonly Check[] = [
  {
    id: "backend",
    title: "WebGPU is up",
    look: "The stage says data-backend webgpu and data-post desktop; View settings offers Photo.",
    reads: ["backend", "post", "probes", "reflection"],
    set: () => st().setScene({ quality: "full" }),
  },
  {
    id: "first-frame",
    title: "The first frame",
    look: "Reload: the shell arrives, then the room fades up within a second or two; no blank freeze, and the wood and the floor fill in after the flat colours without a flash.",
    reads: ["drawn", "materials", "materials-pending"],
  },
  {
    id: "probes",
    title: "The probes' bounce",
    look: "Change the walls' tone in the Room tab: data-probes goes pending then ready within seconds; undersides take the floor's tone, corners darken, no dark blotch beside a piece after the second pass.",
    reads: ["probes"],
  },
  {
    id: "reflection",
    title: "The floor's reflection",
    look: "data-reflection ready; the window's light patch and a piece's underside show in the floor in the right place as the camera orbits.",
    reads: ["reflection"],
  },
  {
    id: "sky-shadow",
    title: "The sky's shadow",
    look: "With shadows on, the floor under a sideboard is softly darker than the open floor beside it; nothing banded or speckled on the walls.",
    reads: ["shadows"],
    set: () => st().setScene({ shadows: "on" }),
  },
  {
    id: "render",
    title: "Render's steps",
    look: "Render (stage 03): the steps card runs light, floor, edges, grade; the line's pace follows the counts; the picture grades without a jump.",
    reads: ["post", "settled"],
    set: () => st().setMode("preview"),
  },
  {
    id: "photo",
    title: "The photo",
    look: "On WebGPU Render traces a photo: the window shows the outside, daylight comes through it, no helper (halo, ring, label, edge line) in the picture; 1080p at 256 samples under a minute.",
    reads: ["photo", "photo-samples", "photo-ms", "photo-size"],
    set: () => {
      st().setScene({ photoSize: "1080p" });
      st().setMode("preview");
    },
  },
  {
    id: "photo-sizes",
    title: "The photo's sizes",
    look: "View settings > Photo: Screen, 1440p and 4K each trace; Export > PNG writes the full size; a size the device cannot hold is greyed out.",
    reads: ["photo-size"],
  },
  {
    id: "photo-memory",
    title: "Ten photos, no growth",
    look: "Take ten photos in a row (or run /rounded?bench=photo): Chrome's task manager GPU memory does not keep growing.",
    reads: ["photo-ms"],
  },
  {
    id: "window",
    title: "The window's outside",
    look: "The outlook is sharp at any zoom, the sun's disc sits where the floor's patch says it should; the evening turns it to dusk.",
    reads: ["light", "sky"],
    set: () => st().setScene({ light: "evening" }),
  },
  {
    id: "walk",
    title: "The walk",
    look: "Walk: 60 fps with the shadows on, no shimmer on the edges once the TRAA settles; W A S D steer, Esc leaves.",
    reads: ["walk", "cam", "settled"],
    set: () => {
      st().setScene({ light: "day" });
      st().setMode("edit");
      st().setWalk(true);
    },
  },
  {
    id: "bench",
    title: "The frame bench",
    look: "Run the bench below (a twenty-second walk): every budget line passes for this tier.",
    reads: ["backend", "post"],
    set: () => st().setWalk(false),
  },
];
