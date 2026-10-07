import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { dataDir } from "../data-dir";
import { HOSTED, str } from "../env";
import * as schema from "./schema";

/**
 * One database, two ways to reach it. With DATABASE_URL set it is Neon
 * Postgres over HTTP, as in production; without it, it is PGlite, a
 * Postgres that runs inside the server process and keeps its files
 * under pglite/ in the data folder (lib/data-dir), so development and the tests need
 * no account and no key. It opens on first use, not on import: the
 * development server evaluates a route's modules in more than one
 * process, and PGlite's files belong to one. The migrations under
 * drizzle/ run with that first use; `ready` resolves once they have.
 * One instance is kept across hot reloads; a Neon one whose migration
 * failed is let go, so the next request tries again rather than stay
 * broken until a restart.
 */
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

const open = (): { db: Db; ready: Promise<void> } => {
  const url = str("DATABASE_URL");
  if (url) {
    const db = neonDrizzle({ connection: url, schema, casing: "snake_case" });
    const ready = migrateNeon(db, { migrationsFolder: MIGRATIONS });
    // a failed migration is reported by the route that awaits it, not
    // as an unhandled rejection; and the instance is let go
    ready.catch(() => {
      if (kept.furnishesDb?.ready === ready) delete kept.furnishesDb;
    });
    return { db, ready };
  }
  // on a host, PGlite's files would live on a disk that is wiped between
  // runs: accounts would vanish without a word, so this says so instead
  if (HOSTED)
    throw new Error(
      "DATABASE_URL is not set: a hosted deployment needs a Postgres (Neon) behind it",
    );
  const files = path.join(dataDir(), "pglite");
  // PGlite makes its own folder, not the ones above it
  mkdirSync(path.dirname(files), { recursive: true });
  const db = pgliteDrizzle({
    connection: { dataDir: files },
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
