import { useRoom } from "./room-store";
import { useScene } from "./scene-store";
import { useStudio } from "./studio-store";

/** what a picture of the flat is of: its rooms and its pieces with
    their places (each store makes these anew on any change) */
export const shownNow = (): readonly unknown[] => {
  const scene = useScene.getState();
  return [useRoom.getState().rooms, scene.groups, scene.overrides];
};

/** the 3D view's last picture while the flat is still as it was taken,
    else null: a project opened or a piece moved since leaves the small
    panel to its drawn view of the flat as it stands */
export const useLastFrame = () => {
  const frame = useStudio((s) => s.lastFrame);
  const rooms = useRoom((s) => s.rooms);
  const groups = useScene((s) => s.groups);
  const overrides = useScene((s) => s.overrides);
  const now = [rooms, groups, overrides];
  return frame && frame.of.every((o, i) => o === now[i]) ? frame.url : null;
};
