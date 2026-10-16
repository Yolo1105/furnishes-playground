import { Color } from "three";

/**
 * A look's white balance, as an interiors photographer sets the camera
 * near the lamps' colour (about 3000 K): a white lit by the room's lamps
 * alone comes out a warm white, not orange, while the lamps' own pools
 * still read warm against what stays cooler (the dusk at the window). A
 * gain on each channel of the picture before its tone mapping (Post.tsx),
 * never a change to any material's colour; its green is 1, so the
 * picture's brightness is the exposure's to set.
 */

/** a lamp's bulb: warm, about 2700 K (Furniture3D's lamps shine it) */
export const LAMP_BULB = "#ffb877";

/** the white a lamp-lit white surface comes out as in the evening */
export const LAMPLIT_WHITE = "#f3ebe0";

/** the light a white wall gets in the evening: the lamps' with the
    dusk's from the windows and the bounce, measured off the evening's
    Corner view before any gain (a wall's red to green 1.58, blue to
    green 0.64). Balancing for the bulb alone overshot: everything the
    dusk lit went blue, which is most of the room. A camera's auto white
    balance lands on the mix, and the lamps' own pools stay warmer than
    the walls, as they read in a photograph.
    Round 9 (2026-10-16): with the bounce baked (GiBake.tsx) the walls
    are lit by the lamps' light come back off the room, not by a blue
    fill: measured again off the evening's Corner view, a wall's red to
    green 1.55 and blue to green 0.45 under the old gain (the walls read
    tan). Balanced for the ceiling light's colour, between the old mix
    and the bulb, the walls read a warm white again and the dusk at the
    window stays blue */
export const EVENING_LIGHT = "#ffc48a";

/** the gain that turns a white lit by `lampHex` into `targetHex`, each
    channel in linear light, green held at 1 */
export const balanceGain = (
  lampHex: string,
  targetHex = LAMPLIT_WHITE,
): [number, number, number] => {
  const lamp = new Color(lampHex);
  const target = new Color(targetHex);
  const r = target.r / lamp.r;
  const g = target.g / lamp.g;
  const b = target.b / lamp.b;
  return [r / g, 1, b / g];
};
