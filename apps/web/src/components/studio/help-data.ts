/**
 * What the hand does in the studio, by what is in it: a mouse or a
 * trackpad, or a finger or a pen on the screen. Each line names a thing
 * to do and the way to do it, in the words the Help dialog shows; the
 * keyboard's list lives with its listener in shortcuts.ts. Every line
 * describes what the code does, so a line changes when a gesture does.
 */
type HelpRow = { does: string; how: string };
type HelpGroup = { where: string; rows: HelpRow[] };
export type HelpTab = {
  id: "mouse" | "touch";
  label: string;
  groups: HelpGroup[];
};

export const HELP_TABS: readonly HelpTab[] = [
  {
    id: "mouse",
    label: "Mouse & trackpad",
    groups: [
      {
        where: "On the plan",
        rows: [
          {
            does: "Pick a piece",
            how: "Click it. With the Inspect tool a click also opens its actions.",
          },
          {
            does: "Move a piece",
            how: "Drag it anywhere, past the walls too; near a wall it goes flush (the magnet, in Settings).",
          },
          {
            does: "Turn a piece",
            how: "Drag its turn handle, in steps of 15°; hold Shift to turn freely. A click on the handle turns it a quarter.",
          },
          {
            does: "Zoom the plan",
            how: "A notch of the wheel, or a pinch on the trackpad; + and − do the same.",
          },
          {
            does: "Move the sheet",
            how: "Two fingers on the trackpad, or drag the sheet by its margin. Fit (0) brings it back; Settings can settle what the wheel does.",
          },
          {
            does: "Measure",
            how: "M, then click two points; Escape clears the line.",
          },
          {
            does: "Draw the walls",
            how: "W, then click corner to corner. With the tool on, drag a wall or a corner of the room to resize it, double-click a wall to split it, and drag a door or window along its wall or pull either end to size it.",
          },
          {
            does: "Work in another room",
            how: "Click its floor, or a piece in it; the Room tab's Rooms row adds one, picks one or removes one. With the Wall tool, drag a room by its floor: against a neighbour, the magnet stands it a wall apart and a doorway joins them.",
          },
          {
            does: "Set the tour's stops",
            how: "T, then click the plan; a click on a stop takes it away. Play walks the room.",
          },
        ],
      },
      {
        where: "In 3D",
        rows: [
          {
            does: "Turn the view",
            how: "Drag on the floor or the walls, or drag the view cube itself, which turns as the camera does; a click on one of its faces snaps to that angle.",
          },
          { does: "Zoom", how: "The wheel, or a pinch on the trackpad." },
          {
            does: "Find a piece",
            how: "Rest on it: it outlines, shows its name, and the hand says it can be dragged (a finger, only picked). View settings can keep every name on.",
          },
          {
            does: "Move a piece",
            how: "Drag it over the floor; it outlines in red where it meets another, and the overlaps are listed in a card at the top left.",
          },
          { does: "Turn a piece", how: "Drag the spin handle over it." },
          {
            does: "Walk",
            how: "G, or Walk under the view cube. W A S D or the arrows move, a drag looks round, a click on the floor goes there; Escape stops.",
          },
        ],
      },
      {
        where: "Shelf and panels",
        rows: [
          {
            does: "Add a piece",
            how: "Click a tile to add it, or drag the tile onto the plan to put it there.",
          },
          {
            does: "See what a button does",
            how: "Rest the pointer on it.",
          },
          {
            does: "Hide, remove, cart",
            how: "Rest the pointer on a row in the outliner, a card on the shelf or one of Eva's answers; the buttons show.",
          },
        ],
      },
    ],
  },
  {
    id: "touch",
    label: "Touch",
    groups: [
      {
        where: "On the plan",
        rows: [
          { does: "Pick a piece", how: "Tap it." },
          { does: "Move a piece", how: "Drag it with one finger." },
          {
            does: "Turn a piece",
            how: "Drag its turn handle, in steps of 15°; a tap on the handle turns it a quarter.",
          },
          { does: "A piece's actions", how: "Press and hold it." },
          {
            does: "Zoom the plan",
            how: "Pinch with two fingers; + and − do the same.",
          },
          {
            does: "Move the sheet",
            how: "Two fingers; Fit brings it back.",
          },
          {
            does: "Measure, walls, tour",
            how: "Pick the tool, then tap the plan; a tap on a tour stop takes it away.",
          },
        ],
      },
      {
        where: "In 3D",
        rows: [
          { does: "Turn the view", how: "One finger." },
          { does: "Zoom", how: "Pinch with two fingers." },
          { does: "Move a piece", how: "Drag it over the floor." },
          { does: "Turn a piece", how: "Drag the spin handle over it." },
          {
            does: "Walk",
            how: "Walk under the view cube; drag to look round, tap the floor to go there; Stop ends it.",
          },
        ],
      },
      {
        where: "Shelf and panels",
        rows: [
          {
            does: "Add a piece",
            how: "Tap a tile to add it, or press and hold a tile and carry it onto the plan.",
          },
          {
            does: "Hide, remove, cart",
            how: "The buttons stand shown under a finger: on the shelf's cards, on the catalogue and under Eva's answers; in the outliner, tap a row and its eye shows.",
          },
          {
            does: "On a phone",
            how: "Project and Eva open as drawers from the tabs at the foot of the screen.",
          },
        ],
      },
    ],
  },
];
