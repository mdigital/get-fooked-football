/**
 * Apply any pending Drizzle migrations against the connected DATABASE_URL.
 *
 * - Idempotent: re-running on an up-to-date DB is a no-op.
 * - Non-interactive: no "yes/no" prompts. Safe for CI / Railway pre-deploy.
 * - First-run bootstrap: if the DB already has the current schema but no
 *   drizzle migration journal (because we used to `db:push` instead of
 *   `db:migrate`), we create the journal and mark the baseline migration
 *   as applied so the first run doesn't try to CREATE TABLE on existing
 *   tables.
 * - Stale-baseline reconciliation: if the journal has a baseline hash that
 *   doesn't match the current `drizzle/0000_baseline.sql` (which happens
 *   when the baseline was regenerated to capture new tables), we update
 *   the journal entry to the new hash and let any further migrations apply
 *   normally.
 *
 * Usage:
 *   npm run db:migrate         # apply any pending migrations
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '../src/db/client';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
const BASELINE_FILE = '0000_baseline.sql';

async function readBaselineHash(): Promise<string> {
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, BASELINE_FILE), 'utf8');
  return crypto.createHash('sha256').update(sql).digest('hex');
}

async function bootstrapIfNeeded() {
  const client = await pool.connect();
  try {
    const journalExists = (
      await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations') AS exists`,
      )
    ).rows[0]?.exists;

    const legacyDb = (
      await client.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') AS exists`,
      )
    ).rows[0]?.exists;

    // Case 1: fresh DB. Let the drizzle migrator do everything.
    if (!journalExists && !legacyDb) return;

    const baselineHash = await readBaselineHash();

    // Case 2: legacy DB with no journal. Create journal + mark baseline as applied.
    if (!journalExists && legacyDb) {
      console.log('Legacy DB detected (has app tables, no drizzle journal). Bootstrapping…');
      await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
          id SERIAL PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        )
      `);
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [baselineHash, Date.now()],
      );
      console.log(`  marked ${BASELINE_FILE} as applied (hash ${baselineHash.slice(0, 12)}…)`);
      return;
    }

    // Case 3: journal exists. Check the first entry — if it's a stale baseline
    // hash from a previous bootstrap, update to the current hash. This handles
    // schema regenerations cleanly without losing track of subsequent
    // migrations.
    const first = await client.query<{ id: number; hash: string }>(
      `SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id LIMIT 1`,
    );
    if (first.rows.length > 0 && first.rows[0].hash !== baselineHash) {
      console.log(`Updating stale baseline hash in journal (${first.rows[0].hash.slice(0, 12)}… → ${baselineHash.slice(0, 12)}…)`);
      await client.query(`UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE id = $2`, [
        baselineHash,
        first.rows[0].id,
      ]);
    }
  } finally {
    client.release();
  }
}

async function main() {
  await bootstrapIfNeeded();
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log('Migrations up to date.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
