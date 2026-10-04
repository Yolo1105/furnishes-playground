import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit: `pnpm db:generate` writes a migration under drizzle/ from
 * a change to src/lib/db/schema.ts. The casing matches the client, so
 * camelCase keys become snake_case columns. A DATABASE_URL is only
 * needed for the commands that talk to a database (push, studio).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
