/**
 * Time as the studio keeps it: Singapore's, which has no daylight
 * saving, so a day and a month start eight hours before UTC's. The
 * spend caps and the operations page count by these days; a moment is
 * shown as "7 Oct 2026, 10:15 pm".
 */
export const TIME_ZONE = "Asia/Singapore";
const OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const dayStart = (now = Date.now()) =>
  Math.floor((now + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;

export const monthStart = (now = Date.now()) => {
  const local = new Date(now + OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS;
};

const format = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: TIME_ZONE,
});
export const whenAt = (ms: number) => format.format(ms);
