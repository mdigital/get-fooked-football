'use server';

import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { saveUploadedImage } from '@/lib/uploads';
import { validateJabBody } from '@/lib/profile-jabs';
import { logAudit } from '@/lib/audit';

/**
 * Upload an avatar for the target user. Defaults to the signed-in user when
 * no `target_user_id` is in the form data; otherwise we trust the form and
 * write to whoever's id is provided.
 *
 * The "edit anyone's photo" path is a deliberate easter egg — no UI link,
 * but anyone who finds /profile/<id> can have their fun.
 */
export async function uploadAvatarAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const rawTarget = Number(formData.get('target_user_id'));
  const targetId = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : s.userId!;
  const redirectBase = targetId === s.userId ? '/profile' : `/profile/${targetId}`;

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) redirect(`${redirectBase}?err=nofile`);
  try {
    const filePath = await saveUploadedImage(file as File);
    await db.update(schema.users).set({ avatarUrl: filePath }).where(eq(schema.users.id, targetId));
    if (targetId === s.userId) {
      s.avatarUrl = filePath;
      await s.save();
    }
    await logAudit({
      userId: s.userId!,
      targetUserId: targetId === s.userId ? null : targetId,
      kind: 'avatar.set',
      detail: filePath,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'upload-failed';
    redirect(`${redirectBase}?err=${encodeURIComponent(code)}`);
  }
  redirect(`${redirectBase}?ok=1`);
}

/**
 * Set (or clear) the target user's public nickname. Empty/whitespace = clear.
 * Cap to ~30 chars to keep it from blowing out the layout.
 */
export async function setNicknameAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const rawTarget = Number(formData.get('target_user_id'));
  const targetId = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : s.userId!;
  const redirectBase = targetId === s.userId ? '/profile' : `/profile/${targetId}`;

  const raw = String(formData.get('nickname') ?? '').trim().slice(0, 30);
  const nickname = raw.length > 0 ? raw : null;

  await db.update(schema.users).set({ nickname }).where(eq(schema.users.id, targetId));
  await logAudit({
    userId: s.userId!,
    targetUserId: targetId === s.userId ? null : targetId,
    kind: nickname ? 'nickname.set' : 'nickname.clear',
    detail: nickname,
  });
  redirect(`${redirectBase}?ok=1`);
}

/**
 * Drop a jab onto the target user's wall. Author is the signed-in user.
 * Any signed-in user can post on any wall — including their own self-burn.
 */
export async function postJabAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const rawTarget = Number(formData.get('target_user_id'));
  const targetId = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : 0;
  if (!targetId) redirect('/');
  const redirectBase = targetId === s.userId ? '/profile' : `/profile/${targetId}`;

  const result = validateJabBody(formData.get('body'));
  if (!result.ok) redirect(`${redirectBase}?jaberr=${result.reason}#wall`);

  await db.insert(schema.profileJabs).values({
    targetUserId: targetId,
    authorUserId: s.userId!,
    body: result.body,
  });
  redirect(`${redirectBase}?ok=1#wall`);
}

/**
 * Soft-delete a jab. Only the target of the jab (or an admin) can hide it —
 * the author is locked in. Author dignity is not protected.
 */
export async function deleteJabAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const jabId = Number(formData.get('jab_id'));
  if (!Number.isFinite(jabId) || jabId <= 0) redirect('/');

  const [row] = await db
    .select()
    .from(schema.profileJabs)
    .where(eq(schema.profileJabs.id, jabId))
    .limit(1);
  if (!row) redirect('/');

  const canDelete = row.targetUserId === s.userId || s.isAdmin;
  const redirectBase = row.targetUserId === s.userId ? '/profile' : `/profile/${row.targetUserId}`;
  if (!canDelete) redirect(redirectBase);

  await db
    .update(schema.profileJabs)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.profileJabs.id, jabId), eq(schema.profileJabs.targetUserId, row.targetUserId)));
  redirect(`${redirectBase}?ok=1#wall`);
}

/** Clear the avatar back to the Gravatar fallback for the target user. */
export async function clearAvatarAction(formData: FormData) {
  const s = await getSession();
  if (!s.userId) redirect('/login');

  const rawTarget = Number(formData.get('target_user_id'));
  const targetId = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : s.userId!;
  const redirectBase = targetId === s.userId ? '/profile' : `/profile/${targetId}`;

  await db.update(schema.users).set({ avatarUrl: null }).where(eq(schema.users.id, targetId));
  if (targetId === s.userId) {
    s.avatarUrl = null;
    await s.save();
  }
  await logAudit({
    userId: s.userId!,
    targetUserId: targetId === s.userId ? null : targetId,
    kind: 'avatar.clear',
  });
  redirect(`${redirectBase}?ok=1`);
}
