'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

/**
 * Where to send the user after a curse action. Only same-origin relative paths
 * are honoured (must start with a single "/"), defaulting to the teams page —
 * so a `redirect_to` form field can bring you back to the match page without
 * becoming an open-redirect.
 */
function safeRedirect(raw: FormDataEntryValue | null): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  return '/teams#curses';
}

/**
 * Cast or update a curse on a team. Upserts so a second submit replaces
 * the existing curse text rather than erroring on the PK.
 * Self-curses are allowed (it's all chaos energy).
 */
export async function castCurseAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const to = safeRedirect(formData.get('redirect_to'));
  const teamId = Number(formData.get('team_id'));
  if (!Number.isFinite(teamId) || teamId <= 0) redirect(to);
  const curseText = (String(formData.get('curse_text') ?? '').trim().slice(0, 140)) || null;

  // Upsert: PK is (user_id, team_id). On conflict update curse_text.
  await db
    .insert(schema.teamCurses)
    .values({ userId: s.userId!, teamId, curseText })
    .onConflictDoUpdate({
      target: [schema.teamCurses.userId, schema.teamCurses.teamId],
      set: { curseText },
    });
  redirect(to);
}

/** Lift your own curse on a team. */
export async function liftCurseAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const to = safeRedirect(formData.get('redirect_to'));
  const teamId = Number(formData.get('team_id'));
  if (!Number.isFinite(teamId) || teamId <= 0) redirect(to);

  await db
    .delete(schema.teamCurses)
    .where(and(eq(schema.teamCurses.userId, s.userId!), eq(schema.teamCurses.teamId, teamId)));
  await logAudit({ userId: s.userId!, kind: 'curse.lift', detail: `team_id=${teamId}` });
  redirect(to);
}
