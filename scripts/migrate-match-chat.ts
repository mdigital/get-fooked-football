/**
 * Migration: replace the sticker board with the new match-page chat.
 *
 *   match_comments     — text + optional image, soft-deletable
 *   comment_reactions  — one row per (user, comment, emoji)
 *   match_stickers     — DROPPED (the chat replaces it)
 *
 * Atomic, IF NOT EXISTS guarded on creates, IF EXISTS guarded on drops; safe
 * to re-run. Set KEEP_STICKERS=1 to skip the destructive drop (useful if you
 * want to keep the old data around for a bit before nuking it).
 */
import { pool } from '../src/db/client';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('› CREATE TABLE match_comments');
    await client.query(`
      CREATE TABLE IF NOT EXISTS match_comments (
        id           SERIAL PRIMARY KEY,
        fixture_id   INTEGER NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body         TEXT NOT NULL,
        image_path   TEXT,
        deleted_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('› CREATE INDEX match_comments_fixture_idx');
    await client.query(`
      CREATE INDEX IF NOT EXISTS match_comments_fixture_idx
        ON match_comments(fixture_id, created_at)
    `);

    console.log('› CREATE TABLE comment_reactions');
    await client.query(`
      CREATE TABLE IF NOT EXISTS comment_reactions (
        comment_id  INTEGER NOT NULL REFERENCES match_comments(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        emoji       TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (comment_id, user_id, emoji)
      )
    `);
    console.log('› CREATE INDEX comment_reactions_comment_idx');
    await client.query(`
      CREATE INDEX IF NOT EXISTS comment_reactions_comment_idx
        ON comment_reactions(comment_id)
    `);

    if (process.env.KEEP_STICKERS) {
      console.log('› KEEP_STICKERS=1 → leaving match_stickers table in place');
    } else {
      console.log('› DROP TABLE match_stickers (sticker board removed)');
      await client.query(`DROP TABLE IF EXISTS match_stickers`);
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
