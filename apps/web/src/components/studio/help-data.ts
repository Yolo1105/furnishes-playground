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
            how: "Pick it: the bar under it turns it a quarter either way; click its angle to type one. R and Shift R turn a quarter, [ and ] by 15°.",
          },
          {
            does: "Put a piece against a wall",
            how: "To wall, on its bar: its back to the nearest wall, flush. The arrows nudge a picked piece 50 mm (Shift, 10 mm). Where pieces stand over each other, click again to pick the one under, or pick it from the list on the bar's name.",
          },
          {
            does: "Zoom the plan",
            how: "A notch of the mouse wheel, or a pinch on the trackpad (Ctrl with the wheel too); + and − do the same.",
          },
          {
            does: "Move the sheet",
            how: "Two fingers on the trackpad (or a Magic Mouse), Shift with the mouse wheel to go across, or drag the sheet with Select. Fit (0) brings it back; Settings can make the wheel always zoom or always move.",
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
          {
            does: "Zoom",
            how: "A notch of the mouse wheel, or a pinch on the trackpad.",
          },
          {
            does: "Move the view",
            how: "Two fingers on the trackpad, or drag with the right button (or Shift and the left). A view moved by hand stays put until an angle is picked again.",
          },
          {
            does: "Find a piece",
            how: "Rest on it: it outlines, shows its name, and the hand says it can be dragged (a finger, only picked). View settings can keep every name on.",
          },
          {
            does: "Move a piece",
            how: "Drag it over the floor; it outlines in red where it meets another, and the overlaps are listed in a card at the top left.",
          },
          {
            does: "Turn a piece",
            how: "Pick it, then the turns on the bar under it, or its degrees; R turns a quarter.",
          },
          {
            does: "Walk",
            how: "G, or Walk under the view cube. W A S D or the arrows move, a drag looks round, a click on the floor (not the end of a drag) goes there; Escape stops.",
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
            how: "Tap it, then a turn on the bar under it, or tap its angle to type one.",
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
          { does: "Move the view", how: "Drag with two fingers." },
          { does: "Move a piece", how: "Drag it over the floor." },
          {
            does: "Turn a piece",
            how: "Tap it, then a turn on the bar under it.",
          },
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

/** the 3D models the room draws whose licence asks for credit where they
    are used (CC-BY 4.0), and those whose authors are thanked anyway:
    public/props/LICENSES.md has every file's source and what was changed */
export const MODEL_CREDITS: { model: string; by: string; licence: string }[] = [
  { model: "Glam velvet sofa", by: "Eric Chadwick", licence: "CC BY 4.0" },
  {
    model: "Leather and wood sofa",
    by: "Eric Chadwick; Fran Calvente",
    licence: "CC BY 4.0 and CC0",
  },
  { model: "Damask chair", by: "Eric Chadwick", licence: "CC BY 4.0" },
  { model: "Velvet chair", by: "Eric Chadwick", licence: "CC0" },
  { model: "Silk pouf", by: "Eric Chadwick", licence: "CC BY 4.0" },
  { model: "Arc floor lamp", by: "DGG", licence: "CC BY 4.0" },
  {
    model: "Glass vase with flowers",
    by: "Eric Chadwick; Rico Cilliers",
    licence: "CC0",
  },
  {
    model: "Tall potted plant",
    by: "Eric Chadwick; Rico Cilliers",
    licence: "CC BY 4.0 and CC0",
  },
];
/** where they come from */
export const MODEL_SOURCE =
  "Khronos glTF Sample Assets (github.com/KhronosGroup/glTF-Sample-Assets); the other room models are Poly Haven's, CC0.";
