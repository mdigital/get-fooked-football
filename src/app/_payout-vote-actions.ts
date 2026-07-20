'use server';

import { redirect } from 'next/navigation';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { validatePayoutChoice } from '@/lib/payout-vote';

/**
 * Cast (or change) an anonymous PAY / NOT ballot on paying out the pot.
 * One row per user, upserted. Deliberately NO audit event — the audit feed
 * is public and the ballot is anonymous.
 */
export async function castPayoutVoteAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const choice = validatePayoutChoice(formData.get('choice'));
  if (!choice) redirect('/');

  await db
    .insert(schema.payoutVotes)
    .values({ userId: s.userId!, choice })
    .onConflictDoUpdate({
      target: schema.payoutVotes.userId,
      set: { choice, votedAt: new Date() },
    });
  redirect('/');
}
