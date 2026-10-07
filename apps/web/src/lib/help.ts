/**
 * A word to the studio, as both sides know it: the three kinds, and
 * how short or long the words may be. The client (help-client) and the
 * route (api/help) read these.
 */
export const HELP_CATEGORIES = ["problem", "idea", "question"] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];
export const HELP_MIN = 5;
export const HELP_MAX = 4000;
