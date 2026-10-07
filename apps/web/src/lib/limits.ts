import { num } from "./env";

/**
 * How much of the studio one caller gets, and how much a document may
 * weigh: the product's rules, with their defaults here and the
 * environment able to set each (see .env.example). The money caps are
 * in cost.ts; api/health lists the shares in force.
 */
export const LIMITS = {
  /** Eva's turns an hour, per caller */
  chatTurnsPerHour: num("CHAT_TURNS_PER_HOUR", 40),
  /** room items drawn and modelled an hour, per caller */
  itemsPerHour: num("ITEMS_PER_HOUR", 12),
  /** Review this room by the model a day, per caller */
  reviewsPerDay: num("REVIEWS_PER_DAY", 8),
  /** waitlist tries an hour, per caller */
  waitlistPerHour: num("WAITLIST_PER_HOUR", 10),
  /** words to the studio a day, per caller */
  helpPerDay: num("HELP_PER_DAY", 10),
  /** bytes of JSON one mirrored document, or one shared room, may hold */
  documentBytes: num("DOCUMENT_BYTES", 2_000_000),
};
