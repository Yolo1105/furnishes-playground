import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * The tables, in Drizzle. Columns are written in camelCase here and
 * stored in snake_case (the client and drizzle-kit both run with
 * `casing: "snake_case"`), so the auth library's field names match the
 * keys below while the database reads as Postgres usually does. The
 * first four tables are the shape Better Auth asks for; `sync` is the
 * account's mirror of the browser, one JSON document per kind (see
 * api/sync); `share` holds the rooms shared by link (see api/share);
 * `orders` and `payment_event` are the shop's ledger (api/checkout,
 * api/orders, api/webhooks/stripe); `help_request` and `waitlist` are
 * what people write to the studio (api/help, api/waitlist);
 * `rate_limit` and `cost_log` are the bounds on the providers
 * (lib/rate-limit, lib/cost).
 * `drizzle-kit generate` turns a change here into a migration under
 * drizzle/.
 */
export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp().notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const sync = pgTable(
  "sync",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** projects, orders, generations or guides */
    kind: text().notNull(),
    data: jsonb().notNull(),
    /** when the browser pushed it, epoch ms */
    at: bigint({ mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

export const share = pgTable(
  "share",
  {
    /** short and random, the tail of the link */
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text().notNull(),
    /** the room and its pieces, as a project's snapshot without Eva */
    data: jsonb().notNull(),
    at: bigint({ mode: "number" }).notNull(),
  },
  (t) => [index("share_user_id_idx").on(t.userId)],
);

export const orders = pgTable(
  "orders",
  {
    /** the order number the studio gave it, FN- and five characters */
    id: text().primaryKey(),
    /** the account it was placed under, if one; kept when the account
        goes, as the ledger's record */
    userId: text().references(() => user.id, { onDelete: "set null" }),
    /** the shopper's handle on it when not signed in: random, carried
        by the link back from paying */
    key: text().notNull(),
    /** where the order's mails go: the account's, or the one given at
        checkout */
    email: text(),
    /** pending_payment, paid, fulfilled, cancelled or refunded */
    status: text().notNull(),
    /** the studio's own note on it, from ops */
    note: text(),
    /** the pieces, each priced from the catalogue */
    lines: jsonb().notNull(),
    /** S$ */
    total: integer().notNull(),
    address: jsonb().notNull(),
    /** Stripe's Checkout Session, once one was opened; the intent it
        came to, once the webhook said */
    paymentRef: text(),
    paymentIntentRef: text(),
    at: bigint({ mode: "number" }).notNull(),
    updatedAt: bigint({ mode: "number" }).notNull(),
  },
  (t) => [
    index("orders_user_id_idx").on(t.userId),
    index("orders_payment_ref_idx").on(t.paymentRef),
  ],
);

export const paymentEvent = pgTable("payment_event", {
  /** Stripe's own event id: one row each, so a replay does nothing */
  id: text().primaryKey(),
  kind: text().notNull(),
  /** the order it moved, once applied */
  orderId: text(),
  at: bigint({ mode: "number" }).notNull(),
});

export const helpRequest = pgTable(
  "help_request",
  {
    id: text().primaryKey(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    email: text().notNull(),
    /** problem, idea or question */
    category: text().notNull(),
    message: text().notNull(),
    /** where they were: the page and the project */
    context: text(),
    at: bigint({ mode: "number" }).notNull(),
    /** when the studio marked it answered, from ops */
    answeredAt: bigint({ mode: "number" }),
  },
  (t) => [index("help_request_user_id_idx").on(t.userId)],
);

export const waitlist = pgTable("waitlist", {
  email: text().primaryKey(),
  at: bigint({ mode: "number" }).notNull(),
  /** when the one note was sent, from ops; never twice */
  notifiedAt: bigint({ mode: "number" }),
});

/** a caller's goes in a fixed window, by what they are doing */
export const rateLimit = pgTable("rate_limit", {
  key: text().primaryKey(),
  windowStart: bigint({ mode: "number" }).notNull(),
  count: integer().notNull(),
});

/** what a provider's call cost, counted as it is spent */
export const costLog = pgTable(
  "cost_log",
  {
    id: text().primaryKey(),
    caller: text().notNull(),
    userId: text(),
    /** chat or item */
    kind: text().notNull(),
    model: text(),
    inputTokens: integer().notNull(),
    outputTokens: integer().notNull(),
    /** US dollars, as the providers bill */
    usd: doublePrecision().notNull(),
    at: bigint({ mode: "number" }).notNull(),
  },
  (t) => [index("cost_log_at_idx").on(t.at)],
);
