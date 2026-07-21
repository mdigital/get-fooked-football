'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { normalizeNickname } from '@/lib/nicknames';

/** Toggle the signed-in user's thumbs-up on a nickname. */
export async function toggleNicknameVoteAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const key = normalizeNickname(String(formData.get('nickname') ?? ''));
  if (!key) redirect('/nicknames');

  const existing = await db
    .select()
    .from(schema.nicknameVotes)
    .where(and(eq(schema.nicknameVotes.nickname, key), eq(schema.nicknameVotes.userId, s.userId!)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .delete(schema.nicknameVotes)
      .where(and(eq(schema.nicknameVotes.nickname, key), eq(schema.nicknameVotes.userId, s.userId!)));
  } else {
    await db.insert(schema.nicknameVotes).values({ nickname: key, userId: s.userId! });
  }
  redirect('/nicknames');
}
