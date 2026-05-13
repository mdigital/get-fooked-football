/**
 * Migration: add polymarket_price to teams + create team_preferences.
 *
 *   ALTER TABLE teams ADD COLUMN polymarket_price DECIMAL(6,4) NOT NULL DEFAULT 0;
 *   CREATE TABLE team_preferences (
 *     user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *     rank      INTEGER NOT NULL,
 *     team_id   INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 *     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     PRIMARY KEY (user_id, rank)
 *   );
 *
 * Atomic, IF [NOT] EXISTS guarded, safe to re-run.
 */
import { pool } from '../src/db/client';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('› ADD COLUMN teams.polymarket_price');
    await client.query(
      `ALTER TABLE teams ADD COLUMN IF NOT EXISTS polymarket_price DECIMAL(6,4) NOT NULL DEFAULT 0`,
    );
    console.log('› CREATE TABLE team_preferences');
    await client.query(`
      CREATE TABLE IF NOT EXISTS team_preferences (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rank       INTEGER NOT NULL,
        team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, rank)
      )
    `);
    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
