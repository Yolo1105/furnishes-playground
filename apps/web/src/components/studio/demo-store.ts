import { create } from "zustand";
import type { Reply } from "./eva-brain";
import type { SceneLook } from "./studio-store";

/**
 * The guided demo's state (demo.ts plays it): whether it is open, the
 * scenes played, whether it plays itself, and what to go back to when it
 * is left (the project that was open, the look the View settings had).
 * The chat and the projects read it here, so neither holds the script:
 * while the demo is open Eva's turns are the script's (`turn`) and
 * nothing is saved to the projects or sent to the server.
 */
export type DemoState = {
  on: boolean;
  /** the scenes played, in order, by id */
  played: string[];
  /** the scene playing now, or the last played */
  scene: string | null;
  /** playing itself (Play the demo), and paused */
  playing: boolean;
  paused: boolean;
  /** the project open before, and the look the View settings had */
  from: string | null;
  look: SceneLook | null;
  /** Eva's turn in the demo, the script's answer to whatever was said */
  turn: ((text: string) => Reply) | null;
  /** what one of the demo's chips does (Play, Replay, Leave, Start your
      own) */
  chip: ((act: DemoAct) => void) | null;
  /** Eva's changes applied in the demo: what they brought in or gave a
      new finish, by id, to be shown */
  applied: ((ids: string[]) => void) | null;
};
export type DemoAct = "demo-play" | "demo-replay" | "demo-leave" | "demo-new";

export const useDemo = create<DemoState>(() => ({
  on: false,
  played: [],
  scene: null,
  playing: false,
  paused: false,
  from: null,
  look: null,
  turn: null,
  chip: null,
  applied: null,
}));

/** the demo is open: nothing is saved or sent */
export const inDemo = () => useDemo.getState().on;
