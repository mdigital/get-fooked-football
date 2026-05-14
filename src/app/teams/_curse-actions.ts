'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

/**
 * Cast or update a curse on a team. Upserts so a second submit replaces
 * the existing curse text rather than erroring on the PK.
 * Self-curses are allowed (it's all chaos energy).
 */
export async function castCurseAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const teamId = Number(formData.get('team_id'));
  if (!Number.isFinite(teamId) || teamId <= 0) redirect('/teams#curses');
  const curseText = (String(formData.get('curse_text') ?? '').trim().slice(0, 140)) || null;

  // Upsert: PK is (user_id, team_id). On conflict update curse_text.
  await db
    .insert(schema.teamCurses)
    .values({ userId: s.userId!, teamId, curseText })
    .onConflictDoUpdate({
      target: [schema.teamCurses.userId, schema.teamCurses.teamId],
      set: { curseText },
    });
  redirect('/teams#curses');
}

/** Lift your own curse on a team. */
export async function liftCurseAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const teamId = Number(formData.get('team_id'));
  if (!Number.isFinite(teamId) || teamId <= 0) redirect('/teams#curses');

  await db
    .delete(schema.teamCurses)
    .where(and(eq(schema.teamCurses.userId, s.userId!), eq(schema.teamCurses.teamId, teamId)));
  await logAudit({ userId: s.userId!, kind: 'curse.lift', detail: `team_id=${teamId}` });
  redirect('/teams#curses');
}
