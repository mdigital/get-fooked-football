/**
 * One-off migration: switch prizes from fixed NZD amounts to percentages of the pot.
 *
 *  - Drops column   prizes.amount_nzd
 *  - Adds   column   prizes.pct_of_pot  DECIMAL(5,2)  NOT NULL  DEFAULT 0
 *
 * Wrapped in a single transaction so it's atomic. Safe to re-run: each ALTER
 * uses IF EXISTS / IF NOT EXISTS guards.
 *
 * After this runs, `npm run db:seed` will repopulate pct_of_pot values
 * (the seed deletes prize rows that still have pct_of_pot=0 and reinserts).
 */
import { pool } from '../src/db/client';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('› ADD COLUMN pct_of_pot');
    await client.query(
      `ALTER TABLE prizes ADD COLUMN IF NOT EXISTS pct_of_pot DECIMAL(5,2) NOT NULL DEFAULT 0`,
    );
    console.log('› DROP COLUMN amount_nzd');
    await client.query(`ALTER TABLE prizes DROP COLUMN IF EXISTS amount_nzd`);
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
