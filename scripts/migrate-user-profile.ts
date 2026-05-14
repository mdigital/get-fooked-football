/**
 * Migration: catch the prod DB up with the schema-side changes that landed in
 * recent feature commits.
 *
 *   users:
 *     ADD COLUMN avatar_url   TEXT
 *     ADD COLUMN buy_in       INTEGER NOT NULL DEFAULT 100
 *     ADD COLUMN onboarded_at TIMESTAMPTZ
 *
 *   invites:
 *     ADD COLUMN multi_use   BOOLEAN NOT NULL DEFAULT false
 *     ADD COLUMN expires_at  TIMESTAMPTZ
 *
 * Atomic, IF NOT EXISTS guarded, safe to re-run. Existing user rows get
 *   avatar_url = NULL (falls back to Gravatar in the app)
 *   buy_in = 100 (matches the default the code shipped with)
 *   onboarded_at = NULL  -> existing users will be bounced through /onboarding
 *
 * Set BACKFILL_ONBOARDED=1 to skip the onboarding gate for existing users.
 */
import { pool } from '../src/db/client';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('› ADD COLUMN users.avatar_url');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    console.log('› ADD COLUMN users.buy_in');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS buy_in INTEGER NOT NULL DEFAULT 100`);
    console.log('› ADD COLUMN users.onboarded_at');
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ`);

    console.log('› ADD COLUMN invites.multi_use');
    await client.query(`ALTER TABLE invites ADD COLUMN IF NOT EXISTS multi_use BOOLEAN NOT NULL DEFAULT false`);
    console.log('› ADD COLUMN invites.expires_at');
    await client.query(`ALTER TABLE invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`);

    if (process.env.BACKFILL_ONBOARDED) {
      console.log('› BACKFILL onboarded_at = now() where null');
      const r = await client.query(`UPDATE users SET onboarded_at = NOW() WHERE onboarded_at IS NULL`);
      console.log(`  ${r.rowCount} row(s) marked onboarded`);
    }

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
