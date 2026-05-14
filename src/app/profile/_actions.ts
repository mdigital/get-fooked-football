'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSession } from '@/lib/session';
import { saveUploadedImage } from '@/lib/uploads';

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
  } catch (err) {
    const code = err instanceof Error ? err.message : 'upload-failed';
    redirect(`${redirectBase}?err=${encodeURIComponent(code)}`);
  }
  redirect(`${redirectBase}?ok=1`);
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
  redirect(`${redirectBase}?ok=1`);
}
