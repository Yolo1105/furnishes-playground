import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

/**
 * One database, two ways to reach it. With DATABASE_URL set it is Neon
 * Postgres over HTTP, as in production; without it, it is PGlite, a
 * Postgres that runs inside the server process and keeps its files
 * under .data/pglite (or DATA_DIR), so development and the tests need
 * no account and no key. It opens on first use, not on import: the
 * development server evaluates a route's modules in more than one
 * process, and PGlite's files belong to one. The migrations under
 * drizzle/ run with that first use; `ready` resolves once they have.
 * One instance is kept across hot reloads.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const open = (): { db: Db; ready: Promise<void> } => {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = neonDrizzle({ connection: url, schema, casing: "snake_case" });
    return { db, ready: migrateNeon(db, { migrationsFolder: MIGRATIONS }) };
  }
  const dataDir =
    process.env.DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  // PGlite makes its own folder, not the ones above it
  mkdirSync(path.dirname(dataDir), { recursive: true });
  const db = pgliteDrizzle({
    connection: { dataDir },
    schema,
    casing: "snake_case",
  });
  const ready = migratePglite(db, { migrationsFolder: MIGRATIONS });
  // a failed migration is reported by the route that awaits it, not as
  // an unhandled rejection
  ready.catch(() => undefined);
  return { db, ready };
};

const kept = globalThis as typeof globalThis & {
  furnishesDb?: ReturnType<typeof open>;
};
/** the database, opened and migrated on the first call */
export const getDb = () => (kept.furnishesDb ??= open());
