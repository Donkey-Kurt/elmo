// Applies the repo's drizzle migrations to the local dev database.
// Rationale: upstream runs migrations through a Docker `db-migrate` service
// (apps/cli/src/compose.ts), which is unavailable here. This replicates exactly
// what the migrate image does, using the same migrator and folder.
// Run from packages/lib so drizzle-orm/pg resolve from its node_modules.
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/elmo";
const migrationsFolder = path.resolve("src/db/migrations");

const pool = new pg.Pool({ connectionString, max: 4 });
const db = drizzle(pool);

try {
  console.log(`migrating from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  const { rows } = await pool.query(
    "select count(*)::int as n from information_schema.tables where table_schema='public'",
  );
  console.log(`migrations applied; public tables = ${rows[0].n}`);
} finally {
  await pool.end();
}
