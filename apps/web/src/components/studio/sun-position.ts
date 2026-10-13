/**
 * Where the sun stands over the flat: from its latitude, the day of the
 * year and the clock, as an almanac gives it (the declination and the
 * hour angle; the equation of time, a quarter hour at most, is left
 * out). Singapore by default: about 1.35° north, its clocks set an hour
 * ahead of its longitude's sun, so the sun stands highest near 13:05.
 *
 * The flat's own frame: x east and z south of the plan when the plan's
 * north points up (`north` = 0°); a flat whose north points elsewhere
 * on the plan turns the sun with it.
 */
export const PLACE = {
  /** degrees north */
  latitude: 1.35,
  /** degrees east */
  longitude: 103.8,
  /** the clock's meridian, degrees east (UTC+8) */
  meridian: 120,
} as const;
/** the day the sun is placed on: the March equinox, when it rises due
    east and sets due west, so a window's sun is the same either side
    of noon (day of the year, 1 = 1 January) */
export const SUN_DAY = 80;
/** the times of day the View settings offer, clock hours: a low
    morning sun, the high midday one, and a low afternoon sun; the
    afternoon is the default (low, so it reaches into the rooms) */
export const SUN_TIMES = { morning: 9.5, midday: 13, afternoon: 16 } as const;
export type SunTime = keyof typeof SUN_TIMES;

const RAD = Math.PI / 180;

/** the sun's height over the horizon and its bearing from north,
    clockwise, both in degrees */
export const sunAt = (
  hour: number,
  day = SUN_DAY,
  place: { latitude: number; longitude: number; meridian: number } = PLACE,
): { elevation: number; azimuth: number } => {
  const lat = place.latitude * RAD;
  const dec = 23.44 * RAD * Math.sin((2 * Math.PI * (284 + day)) / 365);
  // the sun's own time: the clock less the meridian's lead
  const solar = hour - (place.meridian - place.longitude) / 15;
  const ha = (solar - 12) * 15 * RAD;
  const sinEl =
    Math.sin(lat) * Math.sin(dec) +
    Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  // bearing from the south, west positive, then turned to the north
  const fromSouth = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat),
  );
  const azimuth = (fromSouth / RAD + 180 + 360) % 360;
  return { elevation: elevation / RAD, azimuth };
};

/** the way to the sun in the flat's frame (x east, y up, z south with
    north up the plan), a unit vector; `north` the plan's north, degrees
    clockwise from up */
export const sunDirection = (
  hour: number,
  north = 0,
  day = SUN_DAY,
): [number, number, number] => {
  const { elevation, azimuth } = sunAt(hour, day);
  const el = elevation * RAD;
  // the bearing on the plan: the sun's bearing from north, turned by
  // where north points on the plan
  const b = (azimuth + north) * RAD;
  const flat = Math.cos(el);
  return [flat * Math.sin(b), Math.sin(el), -flat * Math.cos(b)];
};
