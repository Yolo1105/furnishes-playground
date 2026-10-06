import {
  bigint,
  boolean,
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
 * api/orders, api/webhooks/stripe).
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
    /** pending_payment, paid, fulfilled, cancelled or refunded */
    status: text().notNull(),
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
