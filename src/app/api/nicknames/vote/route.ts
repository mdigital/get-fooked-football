import { NextResponse } from 'next/server';
import { db, schema } from '@/db/client';
import { and, eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/session';
import { normalizeNickname } from '@/lib/nicknames';

export const dynamic = 'force-dynamic';

/**
 * POST /api/nicknames/vote { nickname } — toggles the current user's thumbs-up
 * on a nickname. Responds with { voted, count } so the client updates without a
 * page reload. The nickname is normalized to the canonical vote key server-side.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let key: string;
  try {
    const body = await req.json();
    key = normalizeNickname(String(body.nickname ?? ''));
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!key) return NextResponse.json({ error: 'bad nickname' }, { status: 400 });

  const existing = await db
    .select()
    .from(schema.nicknameVotes)
    .where(and(eq(schema.nicknameVotes.nickname, key), eq(schema.nicknameVotes.userId, session.userId)))
    .limit(1);

  let voted: boolean;
  if (existing.length > 0) {
    await db
      .delete(schema.nicknameVotes)
      .where(and(eq(schema.nicknameVotes.nickname, key), eq(schema.nicknameVotes.userId, session.userId)));
    voted = false;
  } else {
    await db.insert(schema.nicknameVotes).values({ nickname: key, userId: session.userId });
    voted = true;
  }

  const count = await db.execute(
    sql`select count(*)::int as c from nickname_votes where nickname = ${key}`,
  );
  const c = Number((count.rows[0] as { c: number } | undefined)?.c ?? 0);
  return NextResponse.json({ voted, count: c });
}
